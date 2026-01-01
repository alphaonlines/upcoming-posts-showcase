import "dotenv/config";
import express from "express";
import cors from "cors";
import { Pool } from "pg";

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

function parseDateParam(v: any, fallback: string) {
  if (!v || typeof v !== "string") return fallback;
  // Minimal safety: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return fallback;
  return v;
}

function parseTextParam(v: any): string | null {
  if (!v || typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function parseTaskStatus(v: any): "TODO" | "IN_PROGRESS" | "DONE" | null {
  if (!v || typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  if (t === "TODO" || t === "IN_PROGRESS" || t === "DONE") return t;
  return null;
}

function parseTaskPriority(v: any): "low" | "medium" | "high" | null {
  if (!v || typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (t === "low" || t === "medium" || t === "high") return t as any;
  return null;
}

function parseTaskDeadline(v: any): string | null {
  if (v === null) return null;
  if (v === undefined) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

function parseIntBody(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseTaskIdParam(v: any): number | null {
  if (!v || typeof v !== "string") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const id = Math.trunc(n);
  return id > 0 ? id : null;
}

const SAFE_GRAND_TOTAL = `
  CASE
    WHEN grand_total IS NULL OR grand_total <> grand_total THEN 0
    ELSE grand_total
  END
`;

const SAFE_PROFIT = `
  CASE
    WHEN profit IS NULL OR profit <> profit THEN 0
    ELSE profit
  END
`;

const SAFE_TOTAL_FINANCE_AMT = `
  CASE
    WHEN total_finance_amt IS NULL OR total_finance_amt <> total_finance_amt THEN 0
    ELSE total_finance_amt
  END
`;

const SAFE_FINANCE_FEE = `
  CASE
    WHEN finance_fee IS NULL OR finance_fee <> finance_fee THEN 0
    ELSE finance_fee
  END
`;

const SAFE_FINANCE_BALANCE = `
  CASE
    WHEN finance_balance IS NULL OR finance_balance <> finance_balance THEN 0
    ELSE finance_balance
  END
`;

// Health
app.get("/health", async (_req, res) => {
  const r = await pool.query("SELECT 1 AS ok");
  res.json({ ok: true, db: r.rows[0].ok });
});

// Available years present in data (for UI pickers)
app.get("/api/available-years", async (_req, res) => {
  const sql = `
    SELECT DISTINCT EXTRACT(YEAR FROM sale_date)::int AS year
    FROM pos_sales
    WHERE sale_date IS NOT NULL
    ORDER BY 1;
  `;
  const r = await pool.query(sql);
  res.json({ years: r.rows.map((x) => x.year) });
});

// Outlier sales (by grand_total) for a date range using IQR.
// Note: `end` is treated as exclusive.
app.get("/api/outliers", async (req, res) => {
  const start = parseDateParam(req.query.start, "1900-01-01");
  const end = parseDateParam(req.query.end, "2100-01-01");
  const limit = Math.min(Number(req.query.limit || 25), 200);
  const salespersonQ = parseTextParam(req.query.salesperson);
  const multiplier = Number(req.query.multiplier || 1.5);

  const sql = `
    WITH s AS (
      SELECT
        sale_id,
        sale_date,
        salesperson,
        location,
        receipt_no,
        customer_name,
        ${SAFE_GRAND_TOTAL}::numeric AS grand_total,
        ${SAFE_PROFIT}::numeric AS profit,
        ${SAFE_TOTAL_FINANCE_AMT}::numeric AS total_finance_amt,
        ${SAFE_FINANCE_BALANCE}::numeric AS finance_balance,
        ${SAFE_FINANCE_FEE}::numeric AS finance_fee,
        raw_source_file
      FROM pos_sales
      WHERE sale_date >= $1
        AND sale_date < $2
        AND ($4::text IS NULL OR salesperson ILIKE ('%' || $4 || '%'))
    ),
    stats AS (
      SELECT
        percentile_cont(0.25) WITHIN GROUP (ORDER BY grand_total) AS q1,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY grand_total) AS q3,
        COUNT(*)::int AS n
      FROM s
    ),
    bounds AS (
      SELECT
        q1,
        q3,
        (q3 - q1) AS iqr,
        (q3 + ($5::numeric * (q3 - q1))) AS hi,
        n
      FROM stats
    ),
    flagged AS (
      SELECT
        s.*,
        b.hi AS threshold_high,
        COUNT(*) OVER ()::int AS total_count
      FROM s
      CROSS JOIN bounds b
      WHERE b.n >= 20
        AND s.grand_total > b.hi
      ORDER BY s.grand_total DESC
      LIMIT $3
    )
    SELECT * FROM flagged;
  `;

  const r = await pool.query(sql, [start, end, limit, salespersonQ, Number.isFinite(multiplier) ? multiplier : 1.5]);
  const thresholdHigh = r.rows.length ? Number(r.rows[0].threshold_high ?? 0) : null;
  const totalCount = r.rows.length ? Number(r.rows[0].total_count ?? r.rows.length) : 0;
  const rows = r.rows.map((x: any) => ({
    sale_id: x.sale_id,
    sale_date: x.sale_date,
    salesperson: x.salesperson,
    location: x.location,
    receipt_no: x.receipt_no,
    customer_name: x.customer_name,
    grand_total: x.grand_total,
    profit: x.profit,
    total_finance_amt: x.total_finance_amt,
    finance_balance: x.finance_balance,
    finance_fee: x.finance_fee,
    raw_source_file: x.raw_source_file,
  }));
  res.json({ start, end, limit, threshold_high: thresholdHigh, total_count: totalCount, rows });
});

// Lowest margin tickets per salesperson for a date range.
// Uses pos_sales_people so split salespeople are handled fairly.
// Note: `end` is treated as exclusive.
app.get("/api/low-margin", async (req, res) => {
  const start = parseDateParam(req.query.start, "1900-01-01");
  const end = parseDateParam(req.query.end, "2100-01-01");
  const limitPer = Math.min(Number(req.query.limit_per || 5), 50);
  const limitTotal = Math.min(Number(req.query.limit_total || 200), 2000);
  const salespersonQ = parseTextParam(req.query.salesperson);

  const sql = `
    WITH s AS (
      SELECT
        p.sale_id,
        p.sale_date,
        p.salesperson,
        COALESCE(p.location, s.location) AS location,
        s.receipt_no,
        s.customer_name,
        p.grand_total_split::numeric AS grand_total,
        (CASE WHEN p.profit_split IS NULL OR p.profit_split <> p.profit_split THEN 0 ELSE p.profit_split END)::numeric AS profit,
        (
          CASE
            WHEN s.gross_margin IS NOT NULL AND s.gross_margin = s.gross_margin THEN s.gross_margin::numeric
            WHEN p.grand_total_split IS NULL OR p.grand_total_split = 0 OR p.grand_total_split <> p.grand_total_split THEN NULL
            ELSE ((CASE WHEN p.profit_split IS NULL OR p.profit_split <> p.profit_split THEN 0 ELSE p.profit_split END) / p.grand_total_split) * 100
          END
        )::numeric AS margin_pct,
        (CASE WHEN p.total_finance_amt_split IS NULL OR p.total_finance_amt_split <> p.total_finance_amt_split THEN 0 ELSE p.total_finance_amt_split END)::numeric AS total_finance_amt,
        (CASE WHEN p.finance_balance_split IS NULL OR p.finance_balance_split <> p.finance_balance_split THEN 0 ELSE p.finance_balance_split END)::numeric AS finance_balance,
        (CASE WHEN p.finance_fee_split IS NULL OR p.finance_fee_split <> p.finance_fee_split THEN 0 ELSE p.finance_fee_split END)::numeric AS finance_fee,
        s.raw_source_file
      FROM pos_sales_people p
      JOIN pos_sales s ON s.sale_id = p.sale_id
      WHERE p.sale_date >= $1
        AND p.sale_date < $2
        AND p.salesperson IS NOT NULL
        AND p.salesperson <> ''
        AND p.salesperson <> 'Sales, Store'
        AND ($3::text IS NULL OR p.salesperson ILIKE ('%' || $3 || '%'))
    ),
        ranked AS (
          SELECT
            s.*,
            ROW_NUMBER() OVER (PARTITION BY salesperson ORDER BY margin_pct ASC) AS rn
          FROM s
          WHERE margin_pct BETWEEN -100 AND 100
        ),
        filtered AS (
          SELECT
            ranked.*,
            COUNT(*) OVER ()::int AS total_count
          FROM ranked
          WHERE rn <= $4
          ORDER BY margin_pct ASC NULLS LAST, profit ASC, grand_total DESC
          LIMIT $5
        )
    SELECT * FROM filtered;
  `;

  const r = await pool.query(sql, [start, end, salespersonQ, limitPer, limitTotal]);
  const totalCount = r.rows.length ? Number(r.rows[0].total_count ?? r.rows.length) : 0;
  const rows = r.rows.map((x: any) => ({
    sale_id: x.sale_id,
    sale_date: x.sale_date,
    salesperson: x.salesperson,
    location: x.location,
    receipt_no: x.receipt_no,
    customer_name: x.customer_name,
    grand_total: x.grand_total,
    profit: x.profit,
    margin_pct: x.margin_pct,
    total_finance_amt: x.total_finance_amt,
    finance_balance: x.finance_balance,
    finance_fee: x.finance_fee,
    raw_source_file: x.raw_source_file,
  }));

  res.json({ start, end, limit_per: limitPer, limit_total: limitTotal, total_count: totalCount, rows });
});

// Summary totals for a date range
// Note: `end` is treated as exclusive to match common analytics behavior.
app.get("/api/summary", async (req, res) => {
  const start = parseDateParam(req.query.start, "1900-01-01");
  const end = parseDateParam(req.query.end, "2100-01-01");
  const salespersonQ = parseTextParam(req.query.salesperson);

  const sql = salespersonQ
    ? `
      SELECT
        COUNT(*)::int AS lines,
        ROUND(SUM(grand_total_split)::numeric, 2) AS sales,
        ROUND(SUM(CASE WHEN profit_split IS NULL OR profit_split <> profit_split THEN 0 ELSE profit_split END)::numeric, 2) AS profit
      FROM pos_sales_people
      WHERE sale_date >= $1
        AND sale_date < $2
        AND salesperson ILIKE ('%' || $3 || '%');
    `
    : `
      SELECT
        COUNT(*)::int AS lines,
        ROUND(SUM(${SAFE_GRAND_TOTAL})::numeric, 2) AS sales,
        ROUND(SUM(${SAFE_PROFIT})::numeric, 2) AS profit
      FROM pos_sales
      WHERE sale_date >= $1
        AND sale_date < $2;
    `;

  const r = salespersonQ ? await pool.query(sql, [start, end, salespersonQ]) : await pool.query(sql, [start, end]);
  res.json({ start, end, ...r.rows[0] });
});

// Finance summary for a date range
// Note: `end` is treated as exclusive.
app.get("/api/finance-summary", async (req, res) => {
  const start = parseDateParam(req.query.start, "1900-01-01");
  const end = parseDateParam(req.query.end, "2100-01-01");
  const salespersonQ = parseTextParam(req.query.salesperson);

  const sql = salespersonQ
    ? `
      SELECT
        COUNT(*)::int AS lines,
        SUM(CASE WHEN (total_finance_amt_split > 0 OR finance_balance_split > 0) THEN 1 ELSE 0 END)::int AS financed_lines,
        ROUND(SUM(total_finance_amt_split)::numeric, 2) AS financed_amount,
        ROUND(SUM(finance_fee_split)::numeric, 2) AS finance_fee,
        ROUND(SUM(finance_balance_split)::numeric, 2) AS finance_balance
      FROM pos_sales_people
      WHERE sale_date >= $1
        AND sale_date < $2
        AND salesperson ILIKE ('%' || $3 || '%');
    `
    : `
      SELECT
        COUNT(*)::int AS lines,
        SUM(CASE WHEN (${SAFE_TOTAL_FINANCE_AMT}) > 0 OR (${SAFE_FINANCE_BALANCE}) > 0 THEN 1 ELSE 0 END)::int AS financed_lines,
        ROUND(SUM(${SAFE_TOTAL_FINANCE_AMT})::numeric, 2) AS financed_amount,
        ROUND(SUM(${SAFE_FINANCE_FEE})::numeric, 2) AS finance_fee,
        ROUND(SUM(${SAFE_FINANCE_BALANCE})::numeric, 2) AS finance_balance
      FROM pos_sales
      WHERE sale_date >= $1
        AND sale_date < $2;
    `;

  const r = salespersonQ ? await pool.query(sql, [start, end, salespersonQ]) : await pool.query(sql, [start, end]);
  res.json({ start, end, ...r.rows[0] });
});

// Leaderboard (uses your split view)
app.get("/api/leaderboard", async (req, res) => {
  const start = parseDateParam(req.query.start, "1900-01-01");
  const end = parseDateParam(req.query.end, "2100-01-01");
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const salespersonQ = parseTextParam(req.query.salesperson);

  const sql = `
    SELECT
      salesperson,
      COUNT(*)::int AS lines,
      ROUND(SUM(grand_total_split)::numeric, 2) AS sales,
      ROUND(SUM(CASE WHEN profit_split IS NULL OR profit_split <> profit_split THEN 0 ELSE profit_split END)::numeric, 2) AS profit
    FROM pos_sales_people
    WHERE sale_date >= $1
      AND sale_date < $2
      AND salesperson IS NOT NULL
      AND salesperson <> 'Sales, Store'
      AND ($4::text IS NULL OR salesperson ILIKE ('%' || $4 || '%'))
    GROUP BY 1
    ORDER BY sales DESC
    LIMIT $3;
  `;

  const r = await pool.query(sql, [start, end, limit, salespersonQ]);
  res.json({ start, end, limit, rows: r.rows });
});

// Weekly trend (sales + profit)
app.get("/api/sales-weekly", async (req, res) => {
  const start = parseDateParam(req.query.start, "1900-01-01");
  const end = parseDateParam(req.query.end, "2100-01-01");

  const sql = `
    SELECT
      date_trunc('week', sale_date)::date AS week,
      ROUND(SUM(${SAFE_GRAND_TOTAL})::numeric, 2) AS sales,
      ROUND(SUM(${SAFE_PROFIT})::numeric, 2) AS profit
    FROM pos_sales
    WHERE sale_date >= $1
      AND sale_date < $2
    GROUP BY 1
    ORDER BY 1;
  `;

  const r = await pool.query(sql, [start, end]);
  res.json({ start, end, rows: r.rows });
});

// Daily trend (sales + profit)
app.get("/api/sales-daily", async (req, res) => {
  const start = parseDateParam(req.query.start, "1900-01-01");
  const end = parseDateParam(req.query.end, "2100-01-01");
  const salespersonQ = parseTextParam(req.query.salesperson);

  const sql = salespersonQ
    ? `
      SELECT
        sale_date::date AS day,
        COUNT(*)::int AS lines,
        ROUND(SUM(grand_total_split)::numeric, 2) AS sales,
        ROUND(SUM(CASE WHEN profit_split IS NULL OR profit_split <> profit_split THEN 0 ELSE profit_split END)::numeric, 2) AS profit
      FROM pos_sales_people
      WHERE sale_date >= $1
        AND sale_date < $2
        AND salesperson ILIKE ('%' || $3 || '%')
      GROUP BY 1
      ORDER BY 1;
    `
    : `
      SELECT
        sale_date::date AS day,
        COUNT(*)::int AS lines,
        ROUND(SUM(${SAFE_GRAND_TOTAL})::numeric, 2) AS sales,
        ROUND(SUM(${SAFE_PROFIT})::numeric, 2) AS profit
      FROM pos_sales
      WHERE sale_date >= $1
        AND sale_date < $2
      GROUP BY 1
      ORDER BY 1;
    `;

  const r = salespersonQ ? await pool.query(sql, [start, end, salespersonQ]) : await pool.query(sql, [start, end]);
  res.json({ start, end, rows: r.rows });
});

// Sales by location (bar chart)
app.get("/api/sales-by-location", async (req, res) => {
  const start = parseDateParam(req.query.start, "1900-01-01");
  const end = parseDateParam(req.query.end, "2100-01-01");
  const salespersonQ = parseTextParam(req.query.salesperson);

  const sql = salespersonQ
    ? `
      SELECT
        COALESCE(location,'(unknown)') AS location,
        ROUND(SUM(grand_total_split)::numeric, 2) AS sales,
        ROUND(SUM(CASE WHEN profit_split IS NULL OR profit_split <> profit_split THEN 0 ELSE profit_split END)::numeric, 2) AS profit
      FROM pos_sales_people
      WHERE sale_date >= $1
        AND sale_date < $2
        AND salesperson ILIKE ('%' || $3 || '%')
      GROUP BY 1
      ORDER BY sales DESC;
    `
    : `
      SELECT
        COALESCE(location,'(unknown)') AS location,
        ROUND(SUM(${SAFE_GRAND_TOTAL})::numeric, 2) AS sales,
        ROUND(SUM(${SAFE_PROFIT})::numeric, 2) AS profit
      FROM pos_sales
      WHERE sale_date >= $1
        AND sale_date < $2
      GROUP BY 1
      ORDER BY sales DESC;
    `;

  const r = salespersonQ ? await pool.query(sql, [start, end, salespersonQ]) : await pool.query(sql, [start, end]);
  res.json({ start, end, rows: r.rows });
});

// Tasks (shared, stored in local Postgres)
app.get("/api/tasks", async (_req, res) => {
  const sql = `
    SELECT
      id,
      title,
      assignee,
      status,
      priority,
      deadline,
      sort_index,
      responded_at,
      completed_at,
      created_at,
      updated_at
    FROM tasks
    ORDER BY status ASC, sort_index ASC, id ASC;
  `;
  const r = await pool.query(sql);
  res.json({
    rows: r.rows.map((x: any) => ({
      id: Number(x.id),
      title: x.title,
      assignee: x.assignee,
      status: x.status,
      priority: x.priority,
      deadline: x.deadline ? String(x.deadline).slice(0, 10) : null,
      sort_index: Number(x.sort_index ?? 0),
      responded_at: x.responded_at,
      completed_at: x.completed_at,
      created_at: x.created_at,
      updated_at: x.updated_at,
    })),
  });
});

app.post("/api/tasks", async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) return res.status(400).json({ error: "title is required" });

  const assignee =
    typeof req.body?.assignee === "string" && req.body.assignee.trim() ? req.body.assignee.trim() : "Unassigned";
  const status = parseTaskStatus(req.body?.status) ?? "TODO";
  const priority = parseTaskPriority(req.body?.priority) ?? "medium";
  const deadline = parseTaskDeadline(req.body?.deadline);
  const sortIndexExplicit = parseIntBody(req.body?.sort_index);

  const respondedAt = status === "IN_PROGRESS" ? new Date().toISOString() : null;
  const completedAt = status === "DONE" ? new Date().toISOString() : null;

  const sortIndex =
    sortIndexExplicit !== null
      ? sortIndexExplicit
      : (
          await pool.query("SELECT COALESCE(MAX(sort_index), -1) + 1 AS next FROM tasks WHERE status = $1", [status])
        ).rows[0]?.next ?? 0;

  const sql = `
    INSERT INTO tasks (title, assignee, status, priority, deadline, sort_index, responded_at, completed_at, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5::date, $6, $7::timestamptz, $8::timestamptz, now(), now())
    RETURNING id, title, assignee, status, priority, deadline, sort_index, responded_at, completed_at, created_at, updated_at;
  `;
  const r = await pool.query(sql, [title, assignee, status, priority, deadline, sortIndex, respondedAt, completedAt]);
  const row = r.rows[0];
  res.status(201).json({
    row: {
      id: Number(row.id),
      title: row.title,
      assignee: row.assignee,
      status: row.status,
      priority: row.priority,
      deadline: row.deadline ? String(row.deadline).slice(0, 10) : null,
      sort_index: Number(row.sort_index ?? 0),
      responded_at: row.responded_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  });
});

app.patch("/api/tasks/:id", async (req, res) => {
  const id = parseTaskIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const fields: string[] = [];
  const values: any[] = [];

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : null;
  if (title !== null) {
    if (!title) return res.status(400).json({ error: "title cannot be empty" });
    values.push(title);
    fields.push(`title = $${values.length}`);
  }

  const assignee = typeof req.body?.assignee === "string" ? req.body.assignee.trim() : null;
  if (assignee !== null) {
    values.push(assignee || "Unassigned");
    fields.push(`assignee = $${values.length}`);
  }

  const status = req.body?.status !== undefined ? parseTaskStatus(req.body?.status) : null;
  if (status !== null) {
    values.push(status);
    fields.push(`status = $${values.length}`);
  }

  const priority = req.body?.priority !== undefined ? parseTaskPriority(req.body?.priority) : null;
  if (priority !== null) {
    values.push(priority);
    fields.push(`priority = $${values.length}`);
  }

  const deadline =
    req.body?.deadline !== undefined ? (req.body?.deadline === "" ? null : parseTaskDeadline(req.body?.deadline)) : null;
  if (req.body?.deadline !== undefined) {
    if (req.body?.deadline !== "" && deadline === null) return res.status(400).json({ error: "invalid deadline" });
    values.push(deadline);
    fields.push(`deadline = $${values.length}::date`);
  }

  const sortIndex = req.body?.sort_index !== undefined ? parseIntBody(req.body?.sort_index) : null;
  if (sortIndex !== null) {
    values.push(sortIndex);
    fields.push(`sort_index = $${values.length}`);
  }

  if (!fields.length) return res.status(400).json({ error: "no fields to update" });

  if (status === "IN_PROGRESS") {
    fields.push(`responded_at = COALESCE(responded_at, now())`);
  }

  if (status === "DONE") {
    fields.push(`completed_at = now()`);
  } else if (status === "TODO" || status === "IN_PROGRESS") {
    // If a task is re-opened, clear completion timestamp.
    fields.push(`completed_at = NULL`);
  }

  values.push(id);
  const sql = `
    UPDATE tasks
    SET ${fields.join(", ")}, updated_at = now()
    WHERE id = $${values.length}
    RETURNING id, title, assignee, status, priority, deadline, sort_index, responded_at, completed_at, created_at, updated_at;
  `;
  const r = await pool.query(sql, values);
  if (!r.rows.length) return res.status(404).json({ error: "not found" });

  const row = r.rows[0];
  res.json({
    row: {
      id: Number(row.id),
      title: row.title,
      assignee: row.assignee,
      status: row.status,
      priority: row.priority,
      deadline: row.deadline ? String(row.deadline).slice(0, 10) : null,
      sort_index: Number(row.sort_index ?? 0),
      responded_at: row.responded_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  });
});

const port = Number(process.env.PORT || 5055);
app.listen(port, () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});
