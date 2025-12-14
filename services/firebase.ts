import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
// Analytics is optional + browser-only
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDcn4_ZrQRUVfYwLI0iRd32A-Vnb7S8gU4",
  authDomain: "furniture-distributors.firebaseapp.com",
  projectId: "furniture-distributors",
  storageBucket: "furniture-distributors.firebasestorage.app",
  messagingSenderId: "186176183478",
  appId: "1:186176183478:web:535caceed0a8ee77561a17",
  measurementId: "G-9HL3595VR6",
};

let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let isConfigured = false;

// Simple “is it configured” check
const looksConfigured =
  !!firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "YOUR_API_KEY_HERE" &&
  !!firebaseConfig.projectId;

if (looksConfigured) {
  try {
    // Initialize only once (or reuse if already initialized)
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

    db = getFirestore(app);
    storage = getStorage(app);
    isConfigured = true;

    // Analytics: only if supported (browser env, correct context)
    isSupported()
      .then((ok) => {
        if (ok) getAnalytics(app);
      })
      .catch(() => {
        // ignore analytics failures
      });

    console.log("Firebase initialized successfully");
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
} else {
  console.warn("Firebase not configured. Using Mock Data Mode.");
}

export { db, storage, isConfigured };
