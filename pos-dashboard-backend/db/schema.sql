-- RAW: store full row so imports never break if columns change
CREATE TABLE IF NOT EXISTS pos_sales_raw (
  sale_id         TEXT PRIMARY KEY,
  sale_date       DATE,
  raw_source_file TEXT,
  row_json        JSONB NOT NULL,
  imported_at     TIMESTAMPTZ DEFAULT now()
);

-- CLEAN: columns you’ll chart/filter on
CREATE TABLE IF NOT EXISTS pos_sales (
  sale_id                 TEXT PRIMARY KEY,
  sale_date               DATE,
  est_delivery_date       DATE,
  delivery_confirmed_date DATE,
  last_payment_date       DATE,

  salesperson             TEXT,
  location                TEXT,

  receipt_no              TEXT,

  subtotal                NUMERIC,
  adjustments             NUMERIC,
  additional_fees         NUMERIC,
  tax                     NUMERIC,
  grand_total             NUMERIC,
  store_credit_applied    NUMERIC,
  previous_paid           NUMERIC,
  total_collected         NUMERIC,

  total_finance_amt       NUMERIC,
  finance_fee             NUMERIC,
  finance_balance         NUMERIC,
  lwy_balance             NUMERIC,

  cost                    NUMERIC,
  profit                  NUMERIC,
  gross_margin            NUMERIC,

  customer_name           TEXT,
  phone                   TEXT,
  print_letter            TEXT,
  delivery                TEXT,
  note                    TEXT,
  sale_type               TEXT,
  sale_status             TEXT,
  city                    TEXT,
  state                   TEXT,
  zip                     TEXT,

  raw_source_file         TEXT,
  imported_at             TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist for older DB volumes (safe no-ops when already present)
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS adjustments NUMERIC;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS additional_fees NUMERIC;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS store_credit_applied NUMERIC;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS previous_paid NUMERIC;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS lwy_balance NUMERIC;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS print_letter TEXT;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS delivery TEXT;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS sale_type TEXT;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS sale_status TEXT;

CREATE INDEX IF NOT EXISTS idx_pos_sales_date ON pos_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_pos_sales_salesperson ON pos_sales(salesperson);


CREATE INDEX IF NOT EXISTS idx_pos_sales_location ON pos_sales(location);

-- Analytics: split "A and B" (or "A & B") combos into one row per person.
-- Totals are split evenly across the participants.
CREATE OR REPLACE VIEW pos_sales_people AS
WITH base AS (
  SELECT
    sale_id,
    sale_date,
    location,
    CASE
      WHEN grand_total IS NULL OR grand_total <> grand_total THEN 0
      ELSE grand_total
    END AS grand_total,
    CASE
      WHEN profit IS NULL OR profit <> profit THEN 0
      ELSE profit
    END AS profit,
    CASE
      WHEN total_finance_amt IS NULL OR total_finance_amt <> total_finance_amt THEN 0
      ELSE total_finance_amt
    END AS total_finance_amt,
    CASE
      WHEN finance_fee IS NULL OR finance_fee <> finance_fee THEN 0
      ELSE finance_fee
    END AS finance_fee,
    CASE
      WHEN finance_balance IS NULL OR finance_balance <> finance_balance THEN 0
      ELSE finance_balance
    END AS finance_balance,
    regexp_split_to_array(
      regexp_replace(COALESCE(salesperson, ''), E'\\s*&\\s*', ' and ', 'g'),
      E'\\s+and\\s+',
      'i'
    ) AS people
  FROM pos_sales
),
expanded AS (
  SELECT
    sale_id,
    sale_date,
    location,
    grand_total,
    profit,
    total_finance_amt,
    finance_fee,
    finance_balance,
    NULLIF(trim(p.person), '') AS salesperson,
    array_length(people, 1) AS people_count
  FROM base
  CROSS JOIN LATERAL unnest(people) AS p(person)
)
SELECT
  sale_id,
  sale_date,
  location,
  salesperson,
  grand_total / NULLIF(people_count, 0) AS grand_total_split,
  profit / NULLIF(people_count, 0) AS profit_split,
  total_finance_amt / NULLIF(people_count, 0) AS total_finance_amt_split,
  finance_fee / NULLIF(people_count, 0) AS finance_fee_split,
  finance_balance / NULLIF(people_count, 0) AS finance_balance_split
FROM expanded;

-- Simple shared task board (used by frontend Tasks page)
CREATE TABLE IF NOT EXISTS tasks (
  id         BIGSERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  assignee   TEXT NOT NULL DEFAULT 'Unassigned',
  status     TEXT NOT NULL DEFAULT 'TODO',
  priority   TEXT NOT NULL DEFAULT 'medium',
  deadline   DATE NULL,
  sort_index INT NOT NULL DEFAULT 0,
  responded_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist for older DB volumes (safe no-ops when already present)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_index INT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Defaults (safe to re-run)
ALTER TABLE tasks ALTER COLUMN assignee SET DEFAULT 'Unassigned';
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'TODO';
ALTER TABLE tasks ALTER COLUMN priority SET DEFAULT 'medium';
ALTER TABLE tasks ALTER COLUMN sort_index SET DEFAULT 0;
ALTER TABLE tasks ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE tasks ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_tasks_status_sort ON tasks(status, sort_index, id);
