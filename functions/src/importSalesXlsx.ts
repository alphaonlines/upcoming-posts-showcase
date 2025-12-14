import { onObjectFinalized } from "firebase-functions/v2/storage";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as XLSX from "xlsx";

initializeApp();

const db = getFirestore();

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

export const importSalesXlsx = onObjectFinalized(
  { region: "us-central1", timeoutSeconds: 540 },
  async (event) => {
    const obj = event.data;
    const bucketName = obj.bucket;
    const filePath = obj.name || "";

    // Heartbeat write to test basic functionality
    try {
      const heartbeatRef = db.collection('function_triggers').doc();
      await heartbeatRef.set({
        timestamp: FieldValue.serverTimestamp(),
        file: filePath,
        status: 'triggered'
      });
    } catch (e) {
      console.error("Heartbeat write failed:", e);
      // We will still attempt to continue with the rest of the function
    }

    // Only process files in the "sales/" folder
    if (!filePath.startsWith("sales/")) {
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
    
    // Find the sheet that starts with "Sales", or default to the first one
    const sheetName = wb.SheetNames.find((n) => n.toLowerCase().startsWith("sales")) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null });

    let batch = db.batch();
    const seenStores = new Set<string>();
    let rowCount = 0;

    for (const r of rows) {
      rowCount++;
      const dateOfSale = ymdFromExcelDate(r["Date of Sale"]);
      const storeLocation = (r["Sales Location"] ?? "").toString().trim();
      const salesPersonString = (r["Sales Person"] ?? "Unassigned").toString().trim();
      const salesId = (r["Sales#"] ?? "").toString().trim();

      // Skip row if essential data is missing
      if (!dateOfSale || !storeLocation || !salesId) {
        continue;
      }
      
      const storeId = slugify(storeLocation);
      if (storeId && !seenStores.has(storeId)) {
        // Ensure a basic store document exists
        batch.set(
          db.doc(`stores/${storeId}`),
          { name: storeLocation, active: true, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
        seenStores.add(storeId);
      }

      // Handle multiple salespeople in the same field
      const salespeople = salesPersonString.split(" AND ").map((name: string) => name.trim());
      
      // Create a new document in 'sales_transactions' for each row
      const transactionRef = db.doc(`sales_transactions/${salesId}`);
      batch.set(transactionRef, {
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

      // Commit the batch every 400 rows to stay under the 500-operation limit
      if (rowCount % 400 === 0) {
        await batch.commit();
        batch = db.batch(); // Start a new batch
      }
    }

    // Commit any remaining operations in the last batch
    if (rowCount % 400 !== 0) {
      await batch.commit();
    }
    
    console.log(`Processed ${rows.length} rows from ${filePath}. All batches committed.`);
  }
);
