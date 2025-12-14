import { db, isConfigured } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { SalesData, StoreData, SalesPeriod } from '../types';
import { fetchLeaderboard, fetchSalesByLocation } from "./posBackendApi";

// Collection Names
const COLL_SALES = 'sales_transactions';

// Helper to get date range for filtering
const getDateRange = (period: SalesPeriod): { startDate: string; endDate: string } => {
  const today = new Date();
  let startDate = new Date();
  let endDate = new Date();

  const getMonday = (d: Date) => {
    d = new Date(d);
    const day = d.getDay(),
        diff = d.getDate() - day + (day == 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff));
  }

  const formatYMD = (date: Date) => date.toISOString().slice(0, 10);

  if (period === SalesPeriod.THIS_WEEK) {
    startDate = getMonday(today);
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6); // End of week
  } else if (period === SalesPeriod.LAST_YEAR) {
    // For simplicity, let's compare the same week last year
    // This is a placeholder and can be made more sophisticated
    const lastYear = new Date(today);
    lastYear.setFullYear(today.getFullYear() - 1);
    startDate = getMonday(lastYear);
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
  }
  
  // Ensure we are comparing dates only, without time
  startDate.setHours(0,0,0,0);
  endDate.setHours(23,59,59,999);

  return { startDate: formatYMD(startDate), endDate: formatYMD(endDate) };
};

const addDaysYmd = (ymd: string, days: number): string => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const getSalesData = async (period: SalesPeriod): Promise<SalesData[]> => {
  try {
    const { startDate, endDate } = getDateRange(period);

    // Prefer local POS backend API when available (works even if Firebase is configured).
    try {
      const endExclusiveYmd = addDaysYmd(endDate, 1);

      const rows = await fetchLeaderboard({ start: startDate, end: endExclusiveYmd, limit: 20 });

      return rows
        .map((r) => {
          const profit = Number.isFinite(r.profit) ? r.profit : 0;
          return {
            name: r.salesperson,
            sales: Number.isFinite(r.sales) ? r.sales : 0,
            margin: profit,
            itemsSold: Number.isFinite(r.lines) ? r.lines : 0,
          };
        })
        .filter((r) => r.name);
    } catch {
      // fall back to Firebase below
    }

    if (!db || !isConfigured) return [];
    
    // Query transactions within the date range
    const q = query(
      collection(db, COLL_SALES),
      where("date", ">=", startDate),
      where("date", "<=", endDate)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) return [];

    // Aggregate data by salesperson
    const salesByPerson: { [key: string]: { sales: number; margin: number } } = {};

    querySnapshot.docs.forEach(doc => {
      const transaction = doc.data();
      const salespeople = transaction.salespeople || [];
      
      salespeople.forEach((person: string) => {
        if (!salesByPerson[person]) {
          salesByPerson[person] = { sales: 0, margin: 0 };
        }
        // Credit each person with the full amount of the sale
        salesByPerson[person].sales += transaction.grandTotal || 0;
        salesByPerson[person].margin += transaction.profit || 0;
      });
    });
    
    // Format the aggregated data for the chart
    const result: SalesData[] = Object.entries(salesByPerson).map(([name, data]) => ({
      name: name,
      sales: data.sales,
      margin: data.margin,
      itemsSold: 0,
    }));

    return result;

  } catch (error) {
    console.error("Error fetching sales data:", error);
    return [];
  }
};

export const getStoreData = async (period: SalesPeriod): Promise<StoreData[]> => {
  try {
    // Prefer local POS backend API when available.
    try {
      const { startDate, endDate } = getDateRange(period);
      const endExclusiveYmd = addDaysYmd(endDate, 1);

      const rows = await fetchSalesByLocation({ start: startDate, end: endExclusiveYmd });
      return rows
        .map((r) => ({
          storeName: r.location || "(unknown)",
          revenue: Number.isFinite(r.sales) ? r.sales : 0,
          profit: Number.isFinite(r.profit) ? r.profit : 0,
        }))
        .filter((r) => r.storeName);
    } catch {
      // fall back to Firebase below
    }

    if (!db || !isConfigured) return [];

    const { startDate, endDate } = getDateRange(period);
    const q = query(
      collection(db, COLL_SALES),
      where("date", ">=", startDate),
      where("date", "<=", endDate)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) return [];

    // Aggregate data by store name
    const salesByStore: { [key: string]: { revenue: number; profit: number } } = {};

    querySnapshot.docs.forEach(doc => {
      const transaction = doc.data();
      const storeName = transaction.storeName;
      
      if (storeName) {
        if (!salesByStore[storeName]) {
          salesByStore[storeName] = { revenue: 0, profit: 0 };
        }
        salesByStore[storeName].revenue += transaction.grandTotal || 0;
        salesByStore[storeName].profit += transaction.profit || 0;
      }
    });
    
    // Format the aggregated data for the chart
    const result: StoreData[] = Object.entries(salesByStore).map(([name, data]) => ({
      storeName: name,
      revenue: data.revenue,
      profit: data.profit,
    }));

    return result;

  } catch (error) {
    console.error("Error fetching store data:", error);
    return [];
  }
};
