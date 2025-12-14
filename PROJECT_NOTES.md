# Project Notes (POS Dashboard)

## Current working end-to-end (confirmed)

### Data pipeline

- Drop POS export `.xlsx` files into `pos-dashboard-backend/incoming/`
- Run the importer: `python pos-dashboard-backend/importer/import_pos_xlsx.py`
- Importer behavior:
  - Upserts (no duplicates) using `Sales#` as `sale_id`
  - Moves processed files to `pos-dashboard-backend/processed/`
  - Handles real-world headers, including the POS typo `Receitp#`
- Post-import row counts confirmed:
  - `pos_sales`: `3734`
  - `pos_sales_raw`: `3734`

### Database structure

- Postgres runs in Docker via `pos-dashboard-backend/docker-compose.yml`
- Tables:
  - `pos_sales_raw` (`JSONB`): stores the full raw row JSON so exports can change without data loss
  - `pos_sales` (normalized): columns used for analytics (`sale_date`, `salesperson`, `location`, `grand_total`, `profit`, etc.)
- Schema mismatch from earlier iterations was resolved; current schema is the intended “clean” schema.

### Analytics logic

- View `pos_sales_people` splits combo salespeople like `"A and B"` into two rows, splitting totals evenly (50/50).
- Leaderboard queries run successfully off `pos_sales_people`.

### TypeScript API

- API server runs at `http://127.0.0.1:5055` (see `pos-dashboard-backend/src/server.ts`)
- Endpoints confirmed:
  - `GET /health` → `{"ok":true,"db":1}`
  - `GET /api/leaderboard?start=YYYY-MM-DD&end=YYYY-MM-DD&limit=10` → JSON results
- Postgres auth crash was fixed by loading `.env` via `import "dotenv/config";`

## Known cleanup (optional)

- Some rows can have missing `profit` values; safest is to treat missing profit as `0` in analytics (via `COALESCE` in `pos_sales_people` or queries).

## How to run (current workflow)

### Start Postgres

```bash
cd pos-dashboard-backend
docker-compose up -d
```

### Create/update schema (tables + view)

```bash
cd pos-dashboard-backend
psql "postgres://salesapp:dev_password_change_me@127.0.0.1:5432/salesdb" -f db/schema.sql
```

### Import XLSX

```bash
source pos-dashboard-backend/.venv/bin/activate
python pos-dashboard-backend/importer/import_pos_xlsx.py
```

### Notes on `.xls`

- Some POS “.xls” exports are actually HTML tables with a `.xls` extension (not a true Excel binary).
- The importer supports `.xls` and `.xlsx`. For HTML `.xls`, it tries to preserve hyperlink targets (e.g., Note links).

### Start API

```bash
cd pos-dashboard-backend
npm run dev
```
