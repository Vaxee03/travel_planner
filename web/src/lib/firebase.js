import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app, db, storage, auth;
if (firebaseReady) {
  app = initializeApp(firebaseConfig);
  // Named Firestore database (Firebase console lets you create one with a
  // custom id instead of "(default)" — set VITE_FIREBASE_DATABASE_ID if so).
  const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;
  db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  storage = getStorage(app);
  auth = getAuth(app);
} else {
  console.warn(
    "[firebase] 설정값이 없어 Firebase를 초기화하지 않았어요. web/.env.local에 VITE_FIREBASE_* 값을 채워주세요."
  );
}

export { db, storage, auth };

/** Resolves with the current user's uid once anonymous sign-in completes. */
export function ensureSignedIn() {
  if (!firebaseReady) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsub();
          resolve(user.uid);
        }
      },
      reject
    );
    signInAnonymously(auth).catch(reject);
  });
}
