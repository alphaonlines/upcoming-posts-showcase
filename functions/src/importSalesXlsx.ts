import { onObjectFinalized } from "firebase-functions/v2/storage";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as XLSX from "xlsx";

initializeApp();

const db = getFirestore();
const MAX_BATCH_OPS = 450;

// Helper to create a URL-friendly ID from a string
function slugify(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "") // Allow spaces and hyphens
    .replace(/[\s-]+/g, "-") // Replace spaces and hyphens with a single hyphen
    .replace(/(^-|-$)/g, "");
}

// Helper to parse the specific date format "MM/DD/YYYY" from the Excel file
function ymdFromExcelDate(v: any): string | null {
  if (!v) return null;
  // Handle dates that are already in JS Date format
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }

  // Handle "MM/DD/YYYY" format
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  // Reassemble into YYYY-MM-DD
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

function isSalesFolder(filePath: string): boolean {
  return /^sales\//i.test(filePath);
}

function toSafeDocId(id: string): string {
  // Firestore doc IDs cannot contain "/" (path separator).
  return id.replace(/\//g, "-");
}

export const importSalesXlsx = onObjectFinalized(
  { region: "us-central1", timeoutSeconds: 540, retry: true },
  async (event) => {
    const obj = event.data;
    const bucketName = obj.bucket;
    const filePath = obj.name || "";

    try {
      console.log("importSalesXlsx triggered", {
        bucket: bucketName,
        name: filePath,
        contentType: obj.contentType,
        size: obj.size,
        generation: obj.generation,
      });

      if (!filePath) {
        console.log("No object name provided. Skipping.");
        return;
      }

      // Only process files in the "sales/" folder
      if (!isSalesFolder(filePath)) {
        console.log(`File ${filePath} is not in the sales/ folder. Skipping.`);
        return;
      }

      const lower = filePath.toLowerCase();
      if (!(lower.endsWith(".xlsx") || lower.endsWith(".xls"))) {
        console.log(`File ${filePath} is not an Excel file. Skipping.`);
        return;
      }

      const bucket = getStorage().bucket(bucketName);
      const file = bucket.file(filePath);

      const [buf] = await file.download();
      const wb = XLSX.read(buf, { type: "buffer" });
      
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase().startsWith("sales")) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null });

      let batch = db.batch();
      const seenStores = new Set<string>();
      let batchOps = 0;
      let rowCount = 0;
      let validRowCount = 0;
      let skippedRowCount = 0;
      let totalWrites = 0;

      if (rows.length > 0) {
        console.log("Parsed sheet/headers", {
          sheetName,
          headers: Object.keys(rows[0] || {}),
          rowCount: rows.length,
        });
      } else {
        console.log(`No rows parsed from ${filePath}.`);
      }

      const commitBatch = async (reason: string) => {
        if (batchOps === 0) return;
        console.log(`Committing batch (${batchOps} ops) [${reason}] for ${filePath}...`);
        await batch.commit();
        totalWrites += batchOps;
        batch = db.batch();
        batchOps = 0;
      };

      for (const r of rows) {
        rowCount++;
        const dateOfSale = ymdFromExcelDate(r["Date of Sale"]);
        const storeLocation = (r["Sales Location"] ?? "").toString().trim();
        const salesPersonString = (r["Sales Person"] ?? "Unassigned").toString().trim();
        const salesId = (r["Sales#"] ?? "").toString().trim();

        if (!dateOfSale || !storeLocation || !salesId) {
          skippedRowCount++;
          continue;
        }
        validRowCount++;
        
        const storeId = slugify(storeLocation);
        if (storeId && !seenStores.has(storeId)) {
          batch.set(
            db.doc(`stores/${storeId}`),
            { name: storeLocation, active: true, updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
          seenStores.add(storeId);
          batchOps++;
        }

        const salespeople = salesPersonString.split(" AND ").map((name: string) => name.trim());
        
        const safeSalesId = toSafeDocId(salesId);
        if (safeSalesId !== salesId) {
          console.warn(`Sales# contained "/" and was normalized for Firestore doc ID: "${salesId}" -> "${safeSalesId}"`);
        }
        const transactionRef = db.doc(`sales_transactions/${safeSalesId}`);
        batch.set(transactionRef, {
          salesId: salesId,
          date: dateOfSale,
          storeId: storeId,
          storeName: storeLocation,
          salespeople: salespeople,
          grandTotal: Number(r["Grand Total"] ?? 0) || 0,
          cost: Number(r["Cost"] ?? 0) || 0,
          financeFee: Number(r["Finance Fee"] ?? 0) || 0,
          profit: Number(r["Profit"] ?? 0) || 0,
          sourceFile: filePath,
          updatedAt: FieldValue.serverTimestamp(),
        });
        batchOps++;

        if (batchOps >= MAX_BATCH_OPS) {
          await commitBatch(`hit MAX_BATCH_OPS at row ${rowCount}`);
        }
      }

      await commitBatch("final");
      
      console.log("Import complete", {
        filePath,
        parsedRows: rows.length,
        processedRows: rowCount,
        validRows: validRowCount,
        skippedRows: skippedRowCount,
        storesTouched: seenStores.size,
        totalWrites,
      });

    } catch (e) {
      console.error("CRITICAL ERROR during file processing:", e);
      throw e;
    }
  }
);
