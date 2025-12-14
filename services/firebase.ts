import { initializeApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

// --- INSTRUCTIONS FOR THE OWNER ---
// 1. Go to console.firebase.google.com
// 2. Create a new project (e.g., "furniture-dashboard")
// 3. Register a web app (</> icon)
// 4. Copy the config values below replacing the placeholders
// 5. Go to Firestore Database in the sidebar -> Create Database -> Start in Test Mode
// 6. Go to Storage in the sidebar -> Get Started -> Start in Test Mode

const firebaseConfig = {
  // Replace these with your actual values from Firebase Console
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let isConfigured = false;

// Check if config is actually set (simple check to see if user replaced defaults)
if (firebaseConfig.apiKey !== "YOUR_API_KEY_HERE") {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
    isConfigured = true;
    console.log("Firebase initialized successfully");
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
} else {
  console.warn("Firebase not configured. Using Mock Data Mode.");
}

export { db, storage, isConfigured };
