import React, { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ref, uploadBytes } from "firebase/storage";
import {
  CheckCircle,
  Database,
  DollarSign,
  FileSpreadsheet,
  Loader2,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { isConfigured, storage } from "../services/firebase";
import {
  checkPosBackendHealthy,
  fetchAvailableYears,
  fetchLeaderboard,
  fetchFinanceSummary,
  fetchLowMargin,
  fetchSalesByLocation,
  fetchSalesDaily,
  fetchSummary,
  getPosApiBaseUrl,
} from "../services/posBackendApi";
import { SalesData, StoreData } from "../types";

type CompareMode = "TWO_WEEKS" | "TWO_MONTHS" | "TWO_YEARS";

type SalespersonPoint = SalesData & {
  fullName: string;
};

type Summary = {
  sales: number;
  profit: number;
  lines: number;
};

type LowMarginRow = {
  saleId: string;
  saleDate: string;
  salesperson: string;
  location: string;
  receiptNo: string;
  customerName: string;
  grandTotal: number;
  profit: number;
  marginPct: number | null;
  totalFinanceAmt: number;
  financeBalance: number;
  financeFee: number;
  rawSourceFile: string;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const addDaysYmd = (dateYmd: string, days: number) => {
  const d = new Date(`${dateYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
};

const addMonthsYm = (yearMonth: string, monthsDelta: number) => {
  const [y, m] = yearMonth.split("-").map((n) => Number(n));
  if (!y || !m) return yearMonth;
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + monthsDelta);
  return d.toISOString().slice(0, 7);
};

const startOfMonthYmd = (year: number, monthIndex0: number) =>
  ymd(new Date(Date.UTC(year, monthIndex0, 1)));

const getIsoWeekStart = (isoWeek: string): string | null => {
  // input: "YYYY-Www" (from <input type="week" />)
  const m = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) return null;

  // ISO week 1 is the week with Jan 4th in it.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay(); // 0 Sun .. 6 Sat
  const diffToMonday = (day + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - diffToMonday);

  const d = new Date(week1Monday);
  d.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return ymd(d);
};

const currentIsoWeek = () => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() + 6) % 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const getMonthRange = (yearMonth: string): { start: string; endExclusive: string } => {
  const [y, m] = yearMonth.split("-").map((n) => Number(n));
  const start = startOfMonthYmd(y, m - 1);
  const endExclusive = startOfMonthYmd(y, m);
  return { start, endExclusive };
};

const getYearRange = (year: number): { start: string; endExclusive: string } => {
  const start = ymd(new Date(Date.UTC(year, 0, 1)));
  const endExclusive = ymd(new Date(Date.UTC(year + 1, 0, 1)));
  return { start, endExclusive };
};

const pctChange = (current: number, previous: number) => {
  if (!Number.isFinite(current)) return 0;
  if (!Number.isFinite(previous) || previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
};

const isValidYm = (v: string) => /^\d{4}-\d{2}$/.test(v);
const isValidIsoWeek = (v: string) => /^\d{4}-W\d{2}$/.test(v);

const safeDiv = (n: number, d: number) => (Number.isFinite(n) && Number.isFinite(d) && d !== 0 ? n / d : 0);

const salespersonLabel = (fullName: string) => {
  const s = String(fullName || "").trim();
  if (!s) return "";
  if (s.includes(",")) return s.split(",")[0].trim();
  const parts = s.split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : s;
};

const SalesDashboard: React.FC = () => {
  const [salesData, setSalesData] = useState<SalespersonPoint[]>([]);
  const [storeData, setStoreData] = useState<StoreData[]>([]);
  const [trendData, setTrendData] = useState<Array<{ day: string; sales: number; profit: number }>>([]);
  const [summary, setSummary] = useState<Summary>({ sales: 0, profit: 0, lines: 0 });
  const [summaryCompare, setSummaryCompare] = useState<Summary>({ sales: 0, profit: 0, lines: 0 });
  const [compareMode, setCompareMode] = useState<CompareMode>("TWO_MONTHS");
  const [compareHint, setCompareHint] = useState("");
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [yearA, setYearA] = useState<number>(() => new Date().getFullYear());
  const [yearB, setYearB] = useState<number | null>(() => new Date().getFullYear() - 1);
  const [selectedWeek, setSelectedWeek] = useState<string>(() => currentIsoWeek());
  const [compareWeek, setCompareWeek] = useState<string>(() => currentIsoWeek());
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [compareMonth, setCompareMonth] = useState<string>(() => {
    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return addMonthsYm(current, -1);
  });
  const [salespersonQuery, setSalespersonQuery] = useState("");
  const [trendStart, setTrendStart] = useState<string>(() => {
    const now = new Date();
    return ymd(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)));
  });
  const [trendEnd, setTrendEnd] = useState<string>(() => ymd(new Date()));
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finance, setFinance] = useState({
    financedLines: 0,
    financedAmount: 0,
    financeFee: 0,
    financeBalance: 0,
  });
  const [financeCompare, setFinanceCompare] = useState({
    financedLines: 0,
    financedAmount: 0,
    financeFee: 0,
    financeBalance: 0,
  });
  const [lowMargin, setLowMargin] = useState<{
    totalCount: number;
    rows: LowMarginRow[];
  }>({ totalCount: 0, rows: [] });
  const [lowMarginOpen, setLowMarginOpen] = useState(false);
  const [posBackendOk, setPosBackendOk] = useState<boolean | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let stopped = false;
    const run = async () => {
      const ok = await checkPosBackendHealthy();
      if (!stopped) setPosBackendOk(ok);
    };
    void run();
    const id = window.setInterval(run, 10000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    fetchAvailableYears()
      .then((years) => {
        if (!years.length) return;
        setAvailableYears(years);
        const maxYear = years[years.length - 1];
        const prevYear = years.length > 1 ? years[years.length - 2] : null;
        setYearA(maxYear);
        setYearB(prevYear);
      })
      .catch(() => {
        // ignore; UI still works with manual year values
      });
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      let currentRange: { start: string; endExclusive: string };
      let compareRange: { start: string; endExclusive: string } | null = null;

      const salesperson = salespersonQuery.trim() ? salespersonQuery.trim() : undefined;

      if (compareMode === "TWO_WEEKS") {
        const weekA = getIsoWeekStart(selectedWeek);
        const weekB = getIsoWeekStart(compareWeek);
        if (!weekA) throw new Error("Invalid Week A");
        currentRange = { start: weekA, endExclusive: addDaysYmd(weekA, 7) };
        if (weekB) {
          compareRange = { start: weekB, endExclusive: addDaysYmd(weekB, 7) };
          setCompareHint(`vs ${compareWeek}`);
        } else {
          setCompareHint("");
        }
      } else if (compareMode === "TWO_YEARS") {
        if (!Number.isFinite(yearA)) throw new Error("Invalid Year A");
        currentRange = getYearRange(yearA);
        if (yearB !== null && Number.isFinite(yearB)) {
          compareRange = getYearRange(yearB);
          setCompareHint(`vs ${yearB}`);
        } else {
          setCompareHint("");
        }
      } else {
        if (!isValidYm(selectedMonth)) throw new Error("Invalid Month A");
        currentRange = getMonthRange(selectedMonth);
        if (isValidYm(compareMonth)) {
          compareRange = getMonthRange(compareMonth);
          setCompareHint(`vs ${compareMonth}`);
        } else {
          setCompareHint("");
        }
      }

      const [leaderRows, locationRows, curSummary, financeSummary, prevSummary, prevFinanceSummary] = await Promise.all([
        fetchLeaderboard({
          start: currentRange.start,
          end: currentRange.endExclusive,
          limit: salesperson ? 100 : 20,
          salesperson,
        }),
        fetchSalesByLocation({ start: currentRange.start, end: currentRange.endExclusive, salesperson }),
        fetchSummary({ start: currentRange.start, end: currentRange.endExclusive, salesperson }),
        fetchFinanceSummary({ start: currentRange.start, end: currentRange.endExclusive, salesperson }),
        compareRange
          ? fetchSummary({ start: compareRange.start, end: compareRange.endExclusive, salesperson })
          : Promise.resolve(null),
        compareRange
          ? fetchFinanceSummary({ start: compareRange.start, end: compareRange.endExclusive, salesperson })
          : Promise.resolve(null),
      ]);

      setSalesData(
        leaderRows
          .map((r) => ({
            name: salespersonLabel(r.salesperson),
            fullName: r.salesperson,
            sales: Number.isFinite(r.sales) ? r.sales : 0,
            margin: Number.isFinite(r.profit) ? r.profit : 0,
            itemsSold: Number.isFinite(r.lines) ? r.lines : 0,
          }))
          .filter((r) => r.fullName)
      );

      setStoreData(
        locationRows
          .map((r) => ({
            storeName: r.location || "(unknown)",
            revenue: Number.isFinite(r.sales) ? r.sales : 0,
            profit: Number.isFinite(r.profit) ? r.profit : 0,
          }))
          .filter((r) => r.storeName)
      );

      setSummary({
        sales: Number.isFinite(curSummary.sales) ? curSummary.sales : 0,
        profit: Number.isFinite(curSummary.profit) ? curSummary.profit : 0,
        lines: Number.isFinite(curSummary.lines) ? curSummary.lines : 0,
      });
      if (prevSummary) {
        setSummaryCompare({
          sales: Number.isFinite(prevSummary.sales) ? prevSummary.sales : 0,
          profit: Number.isFinite(prevSummary.profit) ? prevSummary.profit : 0,
          lines: Number.isFinite(prevSummary.lines) ? prevSummary.lines : 0,
        });
      } else {
        // No comparison selected: keep charts for A and hide comparison UI bits.
        setSummaryCompare({
          sales: Number.isFinite(curSummary.sales) ? curSummary.sales : 0,
          profit: Number.isFinite(curSummary.profit) ? curSummary.profit : 0,
          lines: Number.isFinite(curSummary.lines) ? curSummary.lines : 0,
        });
      }

      setFinance({
        financedLines: Number.isFinite(financeSummary.financedLines) ? financeSummary.financedLines : 0,
        financedAmount: Number.isFinite(financeSummary.financedAmount) ? financeSummary.financedAmount : 0,
        financeFee: Number.isFinite(financeSummary.financeFee) ? financeSummary.financeFee : 0,
        financeBalance: Number.isFinite(financeSummary.financeBalance) ? financeSummary.financeBalance : 0,
      });
      if (prevFinanceSummary) {
        setFinanceCompare({
          financedLines: Number.isFinite(prevFinanceSummary.financedLines) ? prevFinanceSummary.financedLines : 0,
          financedAmount: Number.isFinite(prevFinanceSummary.financedAmount) ? prevFinanceSummary.financedAmount : 0,
          financeFee: Number.isFinite(prevFinanceSummary.financeFee) ? prevFinanceSummary.financeFee : 0,
          financeBalance: Number.isFinite(prevFinanceSummary.financeBalance) ? prevFinanceSummary.financeBalance : 0,
        });
      } else {
        setFinanceCompare({
          financedLines: Number.isFinite(financeSummary.financedLines) ? financeSummary.financedLines : 0,
          financedAmount: Number.isFinite(financeSummary.financedAmount) ? financeSummary.financedAmount : 0,
          financeFee: Number.isFinite(financeSummary.financeFee) ? financeSummary.financeFee : 0,
          financeBalance: Number.isFinite(financeSummary.financeBalance) ? financeSummary.financeBalance : 0,
        });
      }

    } catch (e) {
      console.error(e);
      setSalesData([]);
      setStoreData([]);
      setSummary({ sales: 0, profit: 0, lines: 0 });
      setSummaryCompare({ sales: 0, profit: 0, lines: 0 });
      setFinance({ financedLines: 0, financedAmount: 0, financeFee: 0, financeBalance: 0 });
      setFinanceCompare({ financedLines: 0, financedAmount: 0, financeFee: 0, financeBalance: 0 });
      setLowMargin({ totalCount: 0, rows: [] });
      setError("Couldn’t load POS data. Confirm the backend API is running on http://127.0.0.1:5055.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [compareMode, selectedWeek, compareWeek, selectedMonth, compareMonth, yearA, yearB, salespersonQuery]);

  const loadTrend = async () => {
    const salesperson = salespersonQuery.trim() ? salespersonQuery.trim() : undefined;

    if (!trendStart || !trendEnd) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trendStart) || !/^\d{4}-\d{2}-\d{2}$/.test(trendEnd)) return;

    // API treats `end` as exclusive; date input is inclusive.
    const endExclusive = addDaysYmd(trendEnd, 1);

    try {
      const dailyRows = await fetchSalesDaily({ start: trendStart, end: endExclusive, salesperson });
      setTrendData(
        dailyRows
          .filter((r) => r.day)
          .map((r) => ({
            day: String(r.day).includes("T") ? String(r.day).slice(0, 10) : String(r.day),
            sales: Number.isFinite(r.sales) ? r.sales : 0,
            profit: Number.isFinite(r.profit) ? r.profit : 0,
          }))
      );
    } catch (e) {
      console.error(e);
      setTrendData([]);
    }
  };

  const loadLowMargin = async () => {
    const salesperson = salespersonQuery.trim() ? salespersonQuery.trim() : undefined;
    if (!trendStart || !trendEnd) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trendStart) || !/^\d{4}-\d{2}-\d{2}$/.test(trendEnd)) return;
    const endExclusive = addDaysYmd(trendEnd, 1);

    try {
      const r = await fetchLowMargin({
        start: trendStart,
        end: endExclusive,
        limitPer: 5,
        limitTotal: 300,
        salesperson,
      });
      setLowMargin({
        totalCount: Number.isFinite(r.totalCount) ? r.totalCount : 0,
        rows: r.rows,
      });
    } catch (e) {
      console.error(e);
      setLowMargin({ totalCount: 0, rows: [] });
    }
  };

  useEffect(() => {
    loadTrend();
  }, [trendStart, trendEnd, salespersonQuery]);

  useEffect(() => {
    loadLowMargin();
  }, [trendStart, trendEnd, salespersonQuery]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !storage) return;

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      alert("Please upload a valid Excel file (.xlsx or .xls)");
      return;
    }

    setUploading(true);
    setUploadSuccess(false);

    try {
      const storageRef = ref(storage, `sales/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);

      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 5000);
    } catch (uploadError) {
      console.error("Upload failed", uploadError);
      alert("Failed to upload file. Check console for details.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const revenuePct = pctChange(summary.sales, summaryCompare.sales);
  const profitPct = pctChange(summary.profit, summaryCompare.profit);
  const linesPct = pctChange(summary.lines, summaryCompare.lines);

  const revenueUp = revenuePct >= 0;
  const profitUp = profitPct >= 0;
  const linesUp = linesPct >= 0;
  const financePenetration = summary.lines > 0 ? (finance.financedLines / summary.lines) * 100 : 0;
  const hasCompare = compareHint.trim().length > 0;
  const financedLinesPct = pctChange(finance.financedLines, financeCompare.financedLines);
  const financedAmountPct = pctChange(finance.financedAmount, financeCompare.financedAmount);
  const financeFeePct = pctChange(finance.financeFee, financeCompare.financeFee);
  const financeBalancePct = pctChange(finance.financeBalance, financeCompare.financeBalance);

  const financedLinesUp = financedLinesPct >= 0;
  const financedAmountUp = financedAmountPct >= 0;
  const financeFeeUp = financeFeePct >= 0;
  const financeBalanceUp = financeBalancePct >= 0;

  const avgTicket = safeDiv(summary.sales, summary.lines);
  const avgProfitPerSale = safeDiv(summary.profit, summary.lines);
  const marginPct = safeDiv(summary.profit, summary.sales) * 100;

  const avgTicketCompare = safeDiv(summaryCompare.sales, summaryCompare.lines);
  const avgProfitPerSaleCompare = safeDiv(summaryCompare.profit, summaryCompare.lines);
  const marginPctCompare = safeDiv(summaryCompare.profit, summaryCompare.sales) * 100;

  const avgTicketPct = pctChange(avgTicket, avgTicketCompare);
  const avgProfitPerSalePct = pctChange(avgProfitPerSale, avgProfitPerSaleCompare);
  const marginPp = marginPct - marginPctCompare;

  const avgTicketUp = avgTicketPct >= 0;
  const avgProfitPerSaleUp = avgProfitPerSalePct >= 0;
  const marginUp = marginPp >= 0;

  if (loading && salesData.length === 0) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="animate-spin mb-2" size={32} />
        <p>Loading business analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* Configuration & Action Area */}
      {isConfigured && (
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="flex items-center gap-3">
            {uploadSuccess && (
              <span className="text-xs text-green-600 font-medium flex items-center animate-fade-in">
                <CheckCircle size={14} className="mr-1" />
                Sent to Cloud Processor
              </span>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg flex items-center text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 size={18} className="animate-spin mr-2" /> : <FileSpreadsheet size={18} className="mr-2" />}
              {uploading ? "Uploading..." : "Upload POS Data"}
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-700 shadow-sm">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 text-xs font-semibold px-2 py-1 rounded-full ${
                  posBackendOk === null
                    ? "bg-slate-100 text-slate-600"
                    : posBackendOk
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current opacity-60" />
                POS Backend {posBackendOk === null ? "Checking" : posBackendOk ? "Connected" : "Offline"}
              </span>
              <span className="text-xs text-slate-500">{getPosApiBaseUrl()}</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Tasks storage: {posBackendOk ? "Postgres (shared)" : "Browser-only fallback"}
            </div>
          </div>
        </div>
      )}

      {!isConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3 text-sm text-amber-800">
          <Database size={16} />
          <span>
            <strong>Demo Mode:</strong> Firebase is not configured; dashboard uses the local POS backend if available.
          </span>
        </div>
      )}

      {!isConfigured && (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-700 shadow-sm">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 text-xs font-semibold px-2 py-1 rounded-full ${
                posBackendOk === null
                  ? "bg-slate-100 text-slate-600"
                  : posBackendOk
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current opacity-60" />
              POS Backend {posBackendOk === null ? "Checking" : posBackendOk ? "Connected" : "Offline"}
            </span>
            <span className="text-xs text-slate-500">{getPosApiBaseUrl()}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">Tasks storage: {posBackendOk ? "Postgres (shared)" : "Browser-only fallback"}</div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Total Sales</p>
            <h3 className="text-2xl font-bold text-slate-800">${summary.sales.toLocaleString()}</h3>
            {hasCompare && (
              <div className={`flex items-center text-sm mt-1 ${revenueUp ? "text-green-600" : "text-red-500"}`}>
                {revenueUp ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
                <span className="font-medium">{Math.abs(revenuePct).toFixed(1)}%</span>
                <span className="text-slate-400 ml-1">{compareHint}</span>
              </div>
            )}
          </div>
          <div className="p-3 bg-blue-50 rounded-full text-blue-600">
            <ShoppingBag size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Total Profit</p>
            <h3 className="text-2xl font-bold text-slate-800">${summary.profit.toLocaleString()}</h3>
            {hasCompare && (
              <div className={`flex items-center text-sm mt-1 ${profitUp ? "text-green-600" : "text-red-500"}`}>
                {profitUp ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
                <span className="font-medium">{Math.abs(profitPct).toFixed(1)}%</span>
                <span className="text-slate-400 ml-1">{compareHint}</span>
              </div>
            )}
          </div>
          <div className="p-3 bg-indigo-50 rounded-full text-indigo-600">
            <DollarSign size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Transactions</p>
            <h3 className="text-2xl font-bold text-slate-800">{summary.lines.toLocaleString()}</h3>
            {hasCompare && (
              <div className={`flex items-center text-sm mt-1 ${linesUp ? "text-green-600" : "text-red-500"}`}>
                {linesUp ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
                <span className="font-medium">{Math.abs(linesPct).toFixed(1)}%</span>
                <span className="text-slate-400 ml-1">{compareHint}</span>
              </div>
            )}
          </div>
          <div className="p-3 bg-slate-50 rounded-full text-slate-700">
            <Database size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center">
          <label className="text-sm font-medium text-slate-500 mb-2">Compare</label>
          <select
            value={compareMode}
            onChange={(e) => setCompareMode(e.target.value as CompareMode)}
            className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
          >
            <option value="TWO_MONTHS">Compare Two Months</option>
            <option value="TWO_WEEKS">Compare Two Weeks</option>
            <option value="TWO_YEARS">Compare Two Years</option>
          </select>
          {compareMode === "TWO_WEEKS" ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Week A</label>
                <input
                  type="week"
                  value={selectedWeek}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return; // don't allow clearing Week A
                    if (!isValidIsoWeek(v)) return;
                    setSelectedWeek(v);
                  }}
                  className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Week B (optional)</label>
                <input
                  type="week"
                  value={compareWeek}
                  onChange={(e) => setCompareWeek(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                />
              </div>
            </div>
          ) : compareMode === "TWO_YEARS" ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Year A</label>
                <select
                  value={String(yearA)}
                  onChange={(e) => setYearA(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                >
                  {(availableYears.length ? availableYears : [yearA]).map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Year B (optional)</label>
                <select
                  value={yearB === null ? "" : String(yearB)}
                  onChange={(e) => setYearB(e.target.value ? Number(e.target.value) : null)}
                  className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                >
                  <option value="">—</option>
                  {(availableYears.length ? availableYears : yearB === null ? [] : [yearB]).map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Month A</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return; // don't allow clearing Month A
                    if (!isValidYm(v)) return;
                    setSelectedMonth(v);
                  }}
                  className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Month B (optional)</label>
                <input
                  type="month"
                  value={compareMonth}
                  onChange={(e) => setCompareMonth(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Finance */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500">Financed Amount</p>
          <h3 className="text-2xl font-bold text-slate-800">${finance.financedAmount.toLocaleString()}</h3>
          <p className="text-sm text-slate-400 mt-1">{financePenetration.toFixed(1)}% of transactions financed</p>
          {hasCompare && (
            <div className={`flex items-center text-sm mt-2 ${financedAmountUp ? "text-green-600" : "text-red-500"}`}>
              {financedAmountUp ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
              <span className="font-medium">{Math.abs(financedAmountPct).toFixed(1)}%</span>
              <span className="text-slate-400 ml-1">{compareHint}</span>
            </div>
          )}
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500">Finance Fees</p>
          <h3 className="text-2xl font-bold text-slate-800">${finance.financeFee.toLocaleString()}</h3>
          <p className="text-sm text-slate-400 mt-1">Sum of Finance Fee</p>
          {hasCompare && (
            <div className={`flex items-center text-sm mt-2 ${financeFeeUp ? "text-green-600" : "text-red-500"}`}>
              {financeFeeUp ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
              <span className="font-medium">{Math.abs(financeFeePct).toFixed(1)}%</span>
              <span className="text-slate-400 ml-1">{compareHint}</span>
            </div>
          )}
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500">Finance Balance</p>
          <h3 className="text-2xl font-bold text-slate-800">${finance.financeBalance.toLocaleString()}</h3>
          <p className="text-sm text-slate-400 mt-1">Sum of Finance Balance</p>
          {hasCompare && (
            <div className={`flex items-center text-sm mt-2 ${financeBalanceUp ? "text-green-600" : "text-red-500"}`}>
              {financeBalanceUp ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
              <span className="font-medium">{Math.abs(financeBalancePct).toFixed(1)}%</span>
              <span className="text-slate-400 ml-1">{compareHint}</span>
            </div>
          )}
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500">Financed Transactions</p>
          <h3 className="text-2xl font-bold text-slate-800">{finance.financedLines.toLocaleString()}</h3>
          <p className="text-sm text-slate-400 mt-1">Count where finance &gt; 0</p>
          {hasCompare && (
            <div className={`flex items-center text-sm mt-2 ${financedLinesUp ? "text-green-600" : "text-red-500"}`}>
              {financedLinesUp ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
              <span className="font-medium">{Math.abs(financedLinesPct).toFixed(1)}%</span>
              <span className="text-slate-400 ml-1">{compareHint}</span>
            </div>
          )}
        </div>
      </div>

      {/* Extra KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500">Average Ticket</p>
          <h3 className="text-2xl font-bold text-slate-800">${avgTicket.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
          <p className="text-sm text-slate-400 mt-1">Sales ÷ transactions (A)</p>
          {hasCompare && (
            <div className={`flex items-center text-sm mt-2 ${avgTicketUp ? "text-green-600" : "text-red-500"}`}>
              {avgTicketUp ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
              <span className="font-medium">{Math.abs(avgTicketPct).toFixed(1)}%</span>
              <span className="text-slate-400 ml-1">{compareHint}</span>
            </div>
          )}
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500">Margin %</p>
          <h3 className="text-2xl font-bold text-slate-800">{marginPct.toFixed(1)}%</h3>
          <p className="text-sm text-slate-400 mt-1">Profit ÷ sales (A)</p>
          {hasCompare && (
            <div className={`flex items-center text-sm mt-2 ${marginUp ? "text-green-600" : "text-red-500"}`}>
              {marginUp ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
              <span className="font-medium">{Math.abs(marginPp).toFixed(1)}pp</span>
              <span className="text-slate-400 ml-1">{compareHint}</span>
            </div>
          )}
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500">Avg Profit / Sale</p>
          <h3 className="text-2xl font-bold text-slate-800">${avgProfitPerSale.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
          <p className="text-sm text-slate-400 mt-1">Profit ÷ transactions (A)</p>
          {hasCompare && (
            <div className={`flex items-center text-sm mt-2 ${avgProfitPerSaleUp ? "text-green-600" : "text-red-500"}`}>
              {avgProfitPerSaleUp ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
              <span className="font-medium">{Math.abs(avgProfitPerSalePct).toFixed(1)}%</span>
              <span className="text-slate-400 ml-1">{compareHint}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Salesperson Performance */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-800">Salesperson Performance</h3>
            <p className="text-sm text-slate-500">Revenue vs Profit by Associate</p>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={salesData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b" }}
                  tickFormatter={(v: number) => `$${Number(v).toLocaleString()}`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  labelFormatter={(_label: any, payload: any[]) => {
                    const p = payload?.[0]?.payload as SalespersonPoint | undefined;
                    return p?.fullName || _label;
                  }}
                  formatter={(value: number) => [`$${Number(value).toLocaleString()}`, undefined]}
                />
                <Legend iconType="circle" />
                <Bar dataKey="sales" name="Total Sales" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                <Line
                  type="monotone"
                  dataKey="margin"
                  name="Profit"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#10b981", strokeWidth: 2, stroke: "#fff" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Store Location Breakdown */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-800">Store Performance</h3>
            <p className="text-sm text-slate-500">Revenue and profit by location</p>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={storeData} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid stroke="#f1f5f9" horizontal={true} vertical={false} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="storeName"
                  type="category"
                  width={120}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 13 }}
                />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  formatter={(value: number) => [`$${Number(value).toLocaleString()}`, undefined]}
                />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="profit" name="Profit" fill="#a5b4fc" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Trend */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Sales Trend</h3>
            <p className="text-sm text-slate-500">Pick a date range (independent of compare)</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Start</label>
              <input
                type="date"
                value={trendStart}
                onChange={(e) => setTrendStart(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">End</label>
              <input
                type="date"
                value={trendEnd}
                onChange={(e) => setTrendEnd(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
              />
            </div>
          </div>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickFormatter={(v: string) => (String(v).includes("T") ? String(v).slice(0, 10) : String(v))}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#64748b" }}
                tickFormatter={(v: number) => `$${Number(v).toLocaleString()}`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                labelFormatter={(label: string) => (String(label).includes("T") ? String(label).slice(0, 10) : String(label))}
                formatter={(value: number) => [`$${Number(value).toLocaleString()}`, undefined]}
              />
              <Legend iconType="circle" />
              <Line type="monotone" dataKey="sales" name="Sales" stroke="#3b82f6" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={3} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="text-sm font-semibold text-slate-800">Filters</div>
        <div className="flex-1 max-w-xl">
          <input
            value={salespersonQuery}
            onChange={(e) => setSalespersonQuery(e.target.value)}
            placeholder="Search salesperson (e.g. Lynn, Underwood)…"
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
          />
          <div className="mt-1 text-xs text-slate-500">Applies to totals, charts, trend, and low-margin results.</div>
        </div>
      </div>

      {/* Lowest margin tickets */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Lowest Margin Tickets</h3>
            <p className="text-sm text-slate-500">
              Lowest 5 margin % tickets per salesperson for {trendStart} → {trendEnd} (uses the Sales Trend range).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLowMarginOpen((v) => !v)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
          >
            {lowMarginOpen ? "Hide" : "Show"} ({lowMargin.totalCount})
          </button>
        </div>

        {lowMarginOpen && (
          <div className="mt-4 overflow-x-auto">
            {lowMargin.rows.length === 0 ? (
              <div className="text-sm text-slate-500">No low-margin results (or not enough rows).</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Salesperson</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3">Sale ID</th>
                    <th className="py-2 pr-3">Sales</th>
                    <th className="py-2 pr-3">Profit</th>
                    <th className="py-2 pr-3">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {lowMargin.rows.map((r) => (
                    <tr key={`${r.saleId}-${r.saleDate}-${r.salesperson}`} className="border-b last:border-b-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{String(r.saleDate).slice(0, 10)}</td>
                      <td className="py-2 pr-3">{r.salesperson}</td>
                      <td className="py-2 pr-3">{r.location}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.saleId}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">${Number(r.grandTotal).toLocaleString()}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">${Number(r.profit).toLocaleString()}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {r.marginPct === null || !Number.isFinite(r.marginPct) ? "—" : `${Number(r.marginPct).toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesDashboard;
