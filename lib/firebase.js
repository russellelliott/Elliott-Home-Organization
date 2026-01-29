import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_API,
  authDomain: process.env.REACT_APP_AUTH,
  projectId: process.env.REACT_APP_PROJ,
  storageBucket: process.env.REACT_APP_STOR,
  messagingSenderId: process.env.REACT_APP_MESS,
  appId: process.env.REACT_APP_APP,
  measurementId: process.env.REACT_APP_MEAS
};

console.log("Firebase Config Storage Bucket:", firebaseConfig.storageBucket);

// Initialize Firebase (Singleton pattern)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };