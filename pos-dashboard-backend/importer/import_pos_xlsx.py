import os, glob, shutil, argparse
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values, Json

def read_pos_excel(path: str) -> pd.DataFrame:
    # .xlsx -> openpyxl, .xls -> xlrd (if installed)
    ext = os.path.splitext(path)[1].lower()
    if ext == ".xlsx":
        return pd.read_excel(path, engine="openpyxl")
    if ext == ".xls":
        # Many "xls" exports are actually HTML tables with a .xls extension.
        try:
            with open(path, "rb") as f:
                head = f.read(4096).lower()
        except Exception:
            head = b""

        if b"<html" in head or b"<!doctype html" in head or b"<table" in head:
            # Prefer BeautifulSoup parsing so we can preserve hyperlink hrefs (e.g., Note links).
            try:
                from bs4 import BeautifulSoup
                with open(path, "rb") as f:
                    html = f.read()
                soup = BeautifulSoup(html, "lxml")
                tables = soup.find_all("table")
                if not tables:
                    raise RuntimeError("HTML .xls contained no <table> elements.")

                expected = {k.strip().lower() for k in COLMAP.keys()}

                def table_headers(table):
                    header_cells = table.find_all("tr")[0].find_all(["th", "td"])
                    return [c.get_text(" ", strip=True) for c in header_cells]

                # Choose best table by header match score
                best_table = None
                best_score = -1
                for t in tables:
                    hs = [h.strip().lower() for h in table_headers(t)]
                    score = len(set(hs).intersection(expected))
                    if score > best_score:
                        best_score = score
                        best_table = t

                table = best_table or tables[0]
                rows = table.find_all("tr")
                if not rows:
                    raise RuntimeError("HTML .xls table had no rows.")

                headers = [h.strip() for h in table_headers(table)]
                data = []

                for tr in rows[1:]:
                    cells = tr.find_all(["td", "th"])
                    if not cells:
                        continue
                    row = {}
                    for i, cell in enumerate(cells):
                        if i >= len(headers):
                            continue
                        header = headers[i]
                        a = cell.find("a")
                        href = a.get("href") if a else None
                        text = cell.get_text(" ", strip=True)
                        # Preserve hyperlinks even if they're relative (many POS exports use app-relative URLs)
                        if href:
                            row[header] = href if not text else f"{text} ({href})"
                        else:
                            row[header] = text
                    if any(v not in (None, "") for v in row.values()):
                        data.append(row)

                if not data:
                    raise RuntimeError("HTML .xls table contained no data rows.")

                return pd.DataFrame(data)
            except Exception:
                # Fallback to pandas HTML parsing
                try:
                    tables = pd.read_html(path)  # requires lxml and/or html5lib and/or bs4
                except Exception as e:
                    raise RuntimeError(
                        "This .xls appears to be an HTML export. To import it, install HTML parser deps:\n"
                        "  pip install lxml html5lib beautifulsoup4\n"
                        "or convert the file to .xlsx and retry."
                    ) from e

                if not tables:
                    raise RuntimeError("HTML .xls contained no tables.")

                expected = {k.strip().lower() for k in COLMAP.keys()}
                best = None
                best_score = -1
                for t in tables:
                    cols = {str(c).strip().lower() for c in t.columns}
                    score = len(cols.intersection(expected))
                    if score > best_score:
                        best_score = score
                        best = t

                return best if best is not None else tables[0]

        try:
            return pd.read_excel(path, engine="xlrd")
        except Exception as e:
            raise RuntimeError(
                "Could not read this .xls file. Some POS exports are not true Excel binaries (they may be HTML). "
                "Try opening/saving as .xlsx, or ensure html parsing deps are installed:\n"
                "  pip install html5lib beautifulsoup4\n"
                "If it is a real .xls, ensure 'xlrd' is installed."
            ) from e
    raise ValueError(f"Unsupported file type: {ext} ({path})")

def json_safe(v):
    # Convert pandas / numpy / datetime types into JSON-serializable primitives
    try:
        import numpy as np
    except Exception:
        np = None

    if v is None:
        return None

    # pandas NaN/NaT
    try:
        if pd.isna(v):
            return None
    except Exception:
        pass

    # pandas Timestamp / python datetime/date
    if isinstance(v, pd.Timestamp):
        return v.isoformat()

    import datetime as _dt
    if isinstance(v, (_dt.datetime, _dt.date)):
        return v.isoformat()

    # numpy scalars
    if np is not None:
        if isinstance(v, np.integer):
            return int(v)
        if isinstance(v, np.floating):
            return float(v)
        if isinstance(v, np.bool_):
            return bool(v)

    # Decimal
    try:
        from decimal import Decimal
        if isinstance(v, Decimal):
            return float(v)
    except Exception:
        pass

    return v






ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INCOMING = os.path.join(ROOT, "incoming")
PROCESSED = os.path.join(ROOT, "processed")

PG = dict(
    host=os.environ.get("PGHOST", "127.0.0.1"),
    port=int(os.environ.get("PGPORT", "5432")),
    dbname=os.environ.get("PGDATABASE", "salesdb"),
    user=os.environ.get("PGUSER", "salesapp"),
    password=os.environ.get("PGPASSWORD", "dev_password_change_me"),
)

COLMAP = {
    "Sales#": "sale_id",
    "Sale #": "sale_id",
    "Date of Sale": "sale_date",
    "Est Date of Delivery": "est_delivery_date",
    "Date Deliv Confirmed": "delivery_confirmed_date",
    "Date of Last PMT": "last_payment_date",

    "Sales Person": "salesperson",
    "Sales Location": "location",

    "Receitp#": "receipt_no",
    "Receipt#": "receipt_no",
    "Receipt #": "receipt_no",

    "Subtotal": "subtotal",
    "Adjustments before and after tax": "adjustments",
    "Additional Fees before and after tax": "additional_fees",
    "Tax": "tax",
    "Grand Total": "grand_total",
    "Store Credit Applied": "store_credit_applied",
    "Previous Paid": "previous_paid",
    "Total Collected": "total_collected",

    "Total Finance AMT": "total_finance_amt",
    "Finance Balance": "finance_balance",
    "Finance Fee": "finance_fee",
    "Lwy Balance": "lwy_balance",

    "Cost": "cost",
    "Profit": "profit",
    "Gross Margin": "gross_margin",

    "Customer Name": "customer_name",
    "Phone #": "phone",
    "Phone#": "phone",
    "Print Letter": "print_letter",
    "Delivery": "delivery",
    "Note": "note",
    "Sale Type": "sale_type",
    "Sale Status": "sale_status",
    "City": "city",
    "State": "state",
    "Zip": "zip",
}

CLEAN_COLS = [
    "sale_id","sale_date","est_delivery_date","delivery_confirmed_date","last_payment_date",
    "salesperson","location","receipt_no",
    "subtotal","adjustments","additional_fees","tax","grand_total","store_credit_applied","previous_paid","total_collected",
    "total_finance_amt","finance_fee","finance_balance","lwy_balance",
    "cost","profit","gross_margin",
    "customer_name","phone","print_letter","delivery","note","sale_type","sale_status","city","state","zip",
    "raw_source_file",
]

UPSERT_RAW = """
INSERT INTO pos_sales_raw (sale_id, sale_date, raw_source_file, row_json)
VALUES %s
ON CONFLICT (sale_id) DO UPDATE SET
  sale_date = EXCLUDED.sale_date,
  raw_source_file = EXCLUDED.raw_source_file,
  row_json = EXCLUDED.row_json;
"""

UPSERT_CLEAN = """
INSERT INTO pos_sales (
  sale_id, sale_date, est_delivery_date, delivery_confirmed_date, last_payment_date,
  salesperson, location, receipt_no,
  subtotal, adjustments, additional_fees, tax, grand_total, store_credit_applied, previous_paid, total_collected,
  total_finance_amt, finance_fee, finance_balance, lwy_balance,
  cost, profit, gross_margin,
  customer_name, phone, print_letter, delivery, note, sale_type, sale_status, city, state, zip,
  raw_source_file
)
VALUES %s
ON CONFLICT (sale_id) DO UPDATE SET
  sale_date = EXCLUDED.sale_date,
  est_delivery_date = EXCLUDED.est_delivery_date,
  delivery_confirmed_date = EXCLUDED.delivery_confirmed_date,
  last_payment_date = EXCLUDED.last_payment_date,
  salesperson = EXCLUDED.salesperson,
  location = EXCLUDED.location,
  receipt_no = EXCLUDED.receipt_no,
  subtotal = EXCLUDED.subtotal,
  adjustments = EXCLUDED.adjustments,
  additional_fees = EXCLUDED.additional_fees,
  tax = EXCLUDED.tax,
  grand_total = EXCLUDED.grand_total,
  store_credit_applied = EXCLUDED.store_credit_applied,
  previous_paid = EXCLUDED.previous_paid,
  total_collected = EXCLUDED.total_collected,
  total_finance_amt = EXCLUDED.total_finance_amt,
  finance_fee = EXCLUDED.finance_fee,
  finance_balance = EXCLUDED.finance_balance,
  lwy_balance = EXCLUDED.lwy_balance,
  cost = EXCLUDED.cost,
  profit = EXCLUDED.profit,
  gross_margin = EXCLUDED.gross_margin,
  customer_name = EXCLUDED.customer_name,
  phone = EXCLUDED.phone,
  print_letter = EXCLUDED.print_letter,
  delivery = EXCLUDED.delivery,
  note = EXCLUDED.note,
  sale_type = EXCLUDED.sale_type,
  sale_status = EXCLUDED.sale_status,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  zip = EXCLUDED.zip,
  raw_source_file = EXCLUDED.raw_source_file;
"""

def to_date(s):
    # pandas handles most date formats; coerce invalid to NaT -> None
    if s is None:
        return None
    dt = pd.to_datetime(s, errors="coerce")
    if pd.isna(dt):
        return None
    return dt.date()

def to_num(x):
    if x is None:
        return None
    try:
        if pd.isna(x):
            return None
    except Exception:
        pass
    # handle strings like "$1,234.00" or "35%"
    if isinstance(x, str):
        t = x.strip().replace("$","").replace(",","")
        if t.endswith("%"):
            t = t[:-1]
        if t.lower() == "nan":
            return None
        if t == "":
            return None
        try:
            return float(t)
        except:
            return None
    try:
        return float(x)
    except:
        return None

def clean_row(df: pd.DataFrame, source_file: str) -> pd.DataFrame:
    # normalize headers
    df.columns = [str(c).strip() for c in df.columns]

    # rename columns we care about
    present = {k:v for k,v in COLMAP.items() if k in df.columns}
    df = df.rename(columns=present)

    # ensure required id exists
    if "sale_id" not in df.columns:
        raise ValueError("Missing required column: 'Sales#' (mapped to sale_id)")

    df["raw_source_file"] = source_file

    # create any missing clean columns as None
    for c in CLEAN_COLS:
        if c not in df.columns:
            df[c] = None

    df = df[CLEAN_COLS].copy()

    # trim sale_id
    df["sale_id"] = df["sale_id"].astype(str).str.strip()
    df = df[df["sale_id"].notna() & (df["sale_id"] != "")]

    # dates
    for c in ["sale_date","est_delivery_date","delivery_confirmed_date","last_payment_date"]:
        df[c] = df[c].apply(to_date)

    # numbers
    for c in [
        "subtotal",
        "adjustments",
        "additional_fees",
        "tax",
        "grand_total",
        "store_credit_applied",
        "previous_paid",
        "total_collected",
        "total_finance_amt",
        "finance_fee",
        "finance_balance",
        "lwy_balance",
        "cost",
        "profit",
        "gross_margin",
    ]:
        df[c] = df[c].apply(to_num)

    return df

def main():
    ap = argparse.ArgumentParser(description="Import POS export XLSX files into Postgres (upsert by sale_id).")
    ap.add_argument("--incoming", default=INCOMING, help="Folder to scan for XLSX files (default: %(default)s)")
    ap.add_argument("--processed", default=PROCESSED, help="Folder to move processed XLSX files into (default: %(default)s)")
    ap.add_argument("--include-processed", action="store_true", help="Also scan the processed folder (useful for re-imports)")
    ap.add_argument("--no-move", action="store_true", help="Do not move processed files")
    ap.add_argument("--allow-id-collisions", action="store_true", help="Allow sale_id collisions across different dates (not recommended)")
    args = ap.parse_args()

    incoming_dir = args.incoming
    processed_dir = args.processed

    os.makedirs(incoming_dir, exist_ok=True)
    os.makedirs(processed_dir, exist_ok=True)

    files = sorted(glob.glob(os.path.join(incoming_dir, "*.xlsx"))) + sorted(glob.glob(os.path.join(incoming_dir, "*.xls")))
    if args.include_processed:
        files += sorted(glob.glob(os.path.join(processed_dir, "*.xlsx"))) + sorted(glob.glob(os.path.join(processed_dir, "*.xls")))
        files = sorted(set(files))

    if not files:
        print(f"No XLSX files in {incoming_dir}" + (" or processed" if args.include_processed else ""))
        return

    conn = psycopg2.connect(**PG)
    try:
        with conn, conn.cursor() as cur:
            for path in files:
                source = os.path.basename(path)
                print(f"\n=== Importing {source} ===")
                df = read_pos_excel(path)
                df2 = clean_row(df, source)

                # RAW rows: sale_id + sale_date + json of entire original row
                # Build json from original df (not renamed), but ensure same row alignment
                raw_df = df.copy()
                raw_df.columns = [str(c).strip() for c in raw_df.columns]
                # sale_id / sale_date pulled from cleaned df2
                raw_rows = []
                clean_rows = []

                # Safety: detect sale_id collisions (common if Sales# resets each year)
                sale_ids = list({str(x).strip() for x in df2["sale_id"].tolist() if str(x).strip()})
                if sale_ids:
                    cur.execute(
                        "SELECT sale_id, sale_date FROM pos_sales WHERE sale_id = ANY(%s)",
                        (sale_ids,),
                    )
                    existing = {r[0]: (r[1].isoformat() if r[1] else None) for r in cur.fetchall()}
                    collisions = []
                    for _, row in df2.iterrows():
                        sid = row["sale_id"]
                        if sid in existing and existing[sid] and row["sale_date"] and existing[sid] != row["sale_date"].isoformat():
                            collisions.append((sid, existing[sid], row["sale_date"].isoformat()))
                    if collisions and not args.allow_id_collisions:
                        print("\n❌ Detected sale_id collisions with different sale_date. This usually means Sales# is not globally unique.")
                        for sid, prev, nxt in collisions[:25]:
                            print(f"  sale_id={sid} existing={prev} incoming={nxt}")
                        if len(collisions) > 25:
                            print(f"  ... and {len(collisions) - 25} more")
                        print("\nFix: choose a unique key strategy (e.g. include year) or rerun with --allow-id-collisions to overwrite.")
                        raise SystemExit(2)

                # For raw JSON: iterate original rows, but need the matching sale_id.
                # simplest: rebuild a dict per row from cleaned and raw together
                for idx, row in df2.iterrows():
                    # idx corresponds to original df row index
                    raw_json = {k: json_safe(v) for k, v in (raw_df.loc[idx].to_dict() if idx in raw_df.index else {}).items()}
                    raw_rows.append((
                        row["sale_id"],
                        row["sale_date"],
                        source,
                        Json(raw_json),
                    ))
                    clean_rows.append(tuple(row[c] for c in CLEAN_COLS))

                execute_values(cur, UPSERT_RAW, raw_rows, page_size=2000)
                execute_values(cur, UPSERT_CLEAN, clean_rows, page_size=2000)

                print(f"Upserted: {len(clean_rows)} rows (clean) + {len(raw_rows)} rows (raw)")

                if args.no_move:
                    print("Skipped moving file (--no-move).")
                else:
                    dest = os.path.join(processed_dir, source)
                    if os.path.abspath(path) != os.path.abspath(dest):
                        shutil.move(path, dest)
                        print(f"Moved to processed: {dest}")
                    else:
                        print("File already in processed folder.")

        print("\n✅ Done.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
