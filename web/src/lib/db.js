// Firestore, split out of firebase.js so the landing page / login screen
// don't download it: only modules that actually read or write trip data
// import this file, and App reaches them through lib/data.js (loaded once a
// user is signed in).
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, connectFirestoreEmulator } from "firebase/firestore";
import { app, firebaseReady, useEmulators } from "./firebase";

let db;
if (firebaseReady) {
  // Named Firestore database (Firebase console lets you create one with a
  // custom id instead of "(default)" — set VITE_FIREBASE_DATABASE_ID if so).
  const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;
  // Persists reads to IndexedDB so trips already opened once are still
  // readable offline (PWA offline support relies on this, not just the
  // service worker caching static assets).
  // Single-tab, not multi-tab: with a shared multi-tab cache only one "primary"
  // tab talks to the server, using *its* sign-in — so when "로그인 상태 유지"
  // is off and two tabs are signed in to different accounts, the other tab's
  // reads/writes went out under the wrong account and failed with
  // permission-denied. Now the first tab owns the offline cache and any other
  // tab falls back to an in-memory cache with its own connection.
  const firestoreSettings = { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) };
  db = databaseId
    ? initializeFirestore(app, firestoreSettings, databaseId)
    : initializeFirestore(app, firestoreSettings);
  if (useEmulators) connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export { db };
