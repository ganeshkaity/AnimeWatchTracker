import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Retrieve Firebase credentials, guarding for server-side execution
export function getFirebaseConfig() {
  if (typeof window === 'undefined') {
    return null; // Return null on server-side rendering
  }

  const localConfig = localStorage.getItem("firebase_config");
  if (localConfig) {
    try {
      return JSON.parse(localConfig);
    } catch (e) {
      console.error("Failed to parse local Firebase config:", e);
    }
  }

  // Fallback to Next.js public environment variables
  if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    return {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
  }

  return null;
}

export function saveFirebaseConfig(config) {
  if (typeof window !== 'undefined') {
    localStorage.setItem("firebase_config", JSON.stringify(config));
    window.location.reload(); 
  }
}

export function clearFirebaseConfig() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem("firebase_config");
    window.location.reload();
  }
}

let app = null;
let auth = null;
let db = null;

const config = getFirebaseConfig();

if (config && config.apiKey) {
  try {
    app = getApps().length === 0 ? initializeApp(config) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("Firebase client loaded successfully.");
  } catch (err) {
    console.error("Firebase client initialization failed:", err);
  }
}

export { app, auth, db };
export const isFirebaseConfigured = () => !!(auth && db);
