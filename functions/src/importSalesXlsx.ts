import { onObjectFinalized } from "firebase-functions/v2/storage";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as XLSX from "xlsx";

initializeApp();

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function ymdFromExcelDate(v: any): string | null {
  // Your "Date of Sale" is like "12/02/2025"
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);

  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

export const importSalesXlsx = onObjectFinalized(
  { region: "us-central1" },
  async (event) => {
    const obj = event.data;
    const bucketName = obj.bucket;
    const filePath = obj.name || "";

    // ✅ YOU used "sales/" so we watch that folder
    if (!filePath.startsWith("sales/")) return;

    // accept both .xlsx and .xls
    const lower = filePath.toLowerCase();
    if (!(lower.endsWith(".xlsx") || lower.endsWith(".xls"))) return;

    const bucket = getStorage().bucket(bucketName);
    const file = bucket.file(filePath);

    const [buf] = await file.download();
    const wb = XLSX.read(buf, { type: "buffer" });

    // Sheet name is usually like "Sales (85 rows)"
    const sheetName =
      wb.SheetNames.find((n) => n.toLowerCase().startsWith("sales")) ||
      wb.SheetNames[0];

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null });

    type Agg = {
      grossSales: number;
      cogs: number;
      financeFees: number;
      profit: number;
      orders: Set<string>;
    };

    const aggMap = new Map<string, Agg>();

    for (const r of rows) {
      const date = ymdFromExcelDate(r["Date of Sale"]);
      const locRaw = (r["Sales Location"] ?? "").toString().trim();
      if (!date || !locRaw) continue;

      const storeId = slugify(locRaw);

      const gross = Number(r["Grand Total"] ?? 0) || 0;
      const cogs = Number(r["Cost"] ?? 0) || 0;
      const fee = Number(r["Finance Fee"] ?? 0) || 0;
      const profit = Number(r["Profit"] ?? 0) || 0;
      const salesNum = (r["Sales#"] ?? "").toString().trim();

      const key = `${storeId}__${date}`;
      const cur =
        aggMap.get(key) || {
          grossSales: 0,
          cogs: 0,
          financeFees: 0,
          profit: 0,
          orders: new Set<string>(),
        };

      cur.grossSales += gross;
      cur.cogs += cogs;
      cur.financeFees += fee;
      cur.profit += profit;
      if (salesNum) cur.orders.add(salesNum);

      aggMap.set(key, cur);
    }

    const db = getFirestore();
    const batch = db.batch();

    for (const [key, a] of aggMap.entries()) {
      const [storeId, date] = key.split("__");

      const grossMargin = a.grossSales > 0 ? a.profit / a.grossSales : 0;

      // Write daily aggregate
      batch.set(
        db.doc(`stores/${storeId}/daily/${date}`),
        {
          grossSales: Number(a.grossSales.toFixed(2)),
          cogs: Number(a.cogs.toFixed(2)),
          financeFees: Number(a.financeFees.toFixed(2)),
          profit: Number(a.profit.toFixed(2)),
          grossMargin,
          orders: a.orders.size,
          updatedAt: FieldValue.serverTimestamp(),
          sourceFile: filePath,
        },
        { merge: true }
      );

      // Ensure store doc exists
      batch.set(
        db.doc(`stores/${storeId}`),
        {
          name: storeId,
          active: true,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
  }
);
