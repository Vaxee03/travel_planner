import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, connectFirestoreEmulator } from "firebase/firestore";
import {
  getAuth, onAuthStateChanged, connectAuthEmulator, signInWithCustomToken, signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut, GoogleAuthProvider, OAuthProvider, signInWithPopup,
  setPersistence, browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail,
} from "firebase/auth";

// Firebase console → Authentication → Sign-in method → Add new provider →
// OpenID Connect. Must be created there with this exact Provider ID.
const KAKAO_OIDC_PROVIDER_ID = "oidc.kakao";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "1";

let app, db, auth;
if (firebaseReady) {
  app = initializeApp(firebaseConfig);
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
  auth = getAuth(app);
  // Local-only: `VITE_USE_EMULATORS=1 npm run dev` points everything at the
  // Firebase emulators (firebase emulators:start) instead of production.
  if (useEmulators) {
    connectAuthEmulator(auth, "http://127.0.0.1:9299", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    // Test hook: sign in as an arbitrary fake user via an unsigned custom
    // token, which only the Auth emulator accepts. Never exists in prod builds.
    window.__emulatorSignIn = (uid) => {
      const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "");
      const now = Math.floor(Date.now() / 1000);
      const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({
        iss: "emulator", sub: "emulator", uid, iat: now, exp: now + 3600,
        aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
      })}.`;
      return signInWithCustomToken(auth, token);
    };
  }
} else {
  console.warn(
    "[firebase] 설정값이 없어 Firebase를 초기화하지 않았어요. web/.env.local에 VITE_FIREBASE_* 값을 채워주세요."
  );
}

export { db, auth };

// Cloud Functions and Storage SDKs are only needed for a few actions (AI
// recs, photos, public links, account deletion, error reports), so they're
// loaded on first use instead of weighing down the initial page load.
let functionsModule;
function loadFunctions() {
  functionsModule ||= import("firebase/functions").then((m) => {
    const instance = m.getFunctions(app, "us-central1");
    if (useEmulators) m.connectFunctionsEmulator(instance, "127.0.0.1", 5001);
    return { instance, httpsCallable: m.httpsCallable };
  });
  return functionsModule;
}

/** Calls a callable Cloud Function; resolves its `data`. */
export async function callFunction(name, data) {
  const { instance, httpsCallable } = await loadFunctions();
  const res = await httpsCallable(instance, name)(data);
  return res.data;
}

let storageModule;
/** The Storage SDK plus this app's Storage instance, loaded on first use. */
export function loadStorage() {
  storageModule ||= import("firebase/storage").then((m) => {
    const instance = m.getStorage(app);
    if (useEmulators) m.connectStorageEmulator(instance, "127.0.0.1", 9199);
    return { ...m, instance };
  });
  return storageModule;
}

/** Subscribes to auth state; fires with the current user (or null) on every change. */
export function watchAuth(onChange) {
  if (!firebaseReady) { onChange(null); return () => {}; }
  return onAuthStateChanged(auth, onChange);
}

export function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/** "로그인 상태 유지" — kept: the session survives closing the browser
 * (Firebase's default); unchecked: it ends when the browser/tab closes.
 * Applies to the next sign-in, so call it right before signing in. */
export function setRememberMe(remember) {
  return setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
}

/** Sends Firebase's password-reset email (in Korean). With email-enumeration
 * protection on, this resolves even for addresses with no account. */
export function sendPasswordReset(email) {
  auth.languageCode = "ko";
  return sendPasswordResetEmail(auth, email);
}

export function signOutUser() {
  return signOut(auth);
}

/** 회원 탈퇴 — the deleteAccount function does the cleanup and deletes the
 * Auth account server-side; this just drops the now-dead local session. */
export async function deleteMyAccount() {
  await callFunction("deleteAccount");
  await signOut(auth).catch(() => {});
}

export function signInWithGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signInWithKakao() {
  return signInWithPopup(auth, new OAuthProvider(KAKAO_OIDC_PROVIDER_ID));
}

/** Korean messages for the Firebase Auth error codes users actually hit. */
export function authErrorMessage(err) {
  const map = {
    "auth/email-already-in-use": "이미 가입된 이메일이에요. 로그인해주세요.",
    "auth/invalid-email": "이메일 형식이 올바르지 않아요.",
    "auth/missing-email": "이메일을 입력해주세요.",
    "auth/weak-password": "비밀번호는 6자 이상이어야 해요.",
    "auth/wrong-password": "비밀번호가 올바르지 않아요.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않아요.",
    "auth/user-not-found": "가입되지 않은 이메일이에요.",
    "auth/too-many-requests": "시도가 너무 많아요. 잠시 후 다시 시도해주세요.",
    "auth/popup-closed-by-user": "로그인 창이 닫혔어요. 다시 시도해주세요.",
    "auth/cancelled-popup-request": "로그인 창이 닫혔어요. 다시 시도해주세요.",
    "auth/credential-already-in-use": "이미 다른 계정에 연결된 소셜 계정이에요.",
    "auth/account-exists-with-different-credential": "같은 이메일로 다른 방식(이메일/다른 소셜)에 이미 가입되어 있어요. 그 방식으로 로그인해주세요.",
    "auth/operation-not-allowed": "이 로그인 방식이 아직 Firebase 콘솔에서 켜지지 않았어요.",
  };
  return map[err?.code] || "오류가 발생했어요. 다시 시도해주세요.";
}
