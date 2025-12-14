import { db, isConfigured } from './firebase';
import { collection, getDocs, writeBatch, doc, query, where } from 'firebase/firestore';
import { SALES_PERSON_DATA, SALES_PERSON_DATA_LAST_YEAR, STORE_DATA } from '../constants';
import { SalesData, StoreData, SalesPeriod } from '../types';

// Collection Names
const COLL_SALES = 'sales_data';
const COLL_STORES = 'store_data';

export const getSalesData = async (period: SalesPeriod): Promise<SalesData[]> => {
  // Fallback to mock data if DB not ready
  if (!db || !isConfigured) {
    // Simulate network delay for realism
    await new Promise(resolve => setTimeout(resolve, 600)); 
    return period === SalesPeriod.THIS_WEEK ? SALES_PERSON_DATA : SALES_PERSON_DATA_LAST_YEAR;
  }

  try {
    const q = query(collection(db, COLL_SALES), where("period", "==", period));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return []; // Return empty to trigger "Seed Data" option in UI
    }

    return querySnapshot.docs.map(doc => doc.data() as SalesData);
  } catch (error) {
    console.error("Error fetching sales data:", error);
    return [];
  }
};

export const getStoreData = async (): Promise<StoreData[]> => {
  if (!db || !isConfigured) {
     await new Promise(resolve => setTimeout(resolve, 600));
     return STORE_DATA;
  }

  try {
    const querySnapshot = await getDocs(collection(db, COLL_STORES));
    if (querySnapshot.empty) return [];
    return querySnapshot.docs.map(doc => doc.data() as StoreData);
  } catch (error) {
    console.error("Error fetching store data:", error);
    return [];
  }
};

/**
 * One-click setup function for the user.
 * Uploads the mock data from constants.ts into the real database.
 */
export const seedDatabase = async () => {
  if (!db) throw new Error("Database not initialized");

  const batch = writeBatch(db);

  // 1. Add Sales Data (This Week)
  SALES_PERSON_DATA.forEach((item) => {
    const docRef = doc(collection(db, COLL_SALES));
    batch.set(docRef, { ...item, period: SalesPeriod.THIS_WEEK });
  });

  // 2. Add Sales Data (Last Year)
  SALES_PERSON_DATA_LAST_YEAR.forEach((item) => {
    const docRef = doc(collection(db, COLL_SALES));
    batch.set(docRef, { ...item, period: SalesPeriod.LAST_YEAR });
  });

  // 3. Add Store Data
  STORE_DATA.forEach((item) => {
    const docRef = doc(collection(db, COLL_STORES));
    batch.set(docRef, item);
  });

  await batch.commit();
  console.log("Database seeded successfully!");
};
