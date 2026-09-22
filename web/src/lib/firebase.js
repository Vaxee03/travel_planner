import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, EmailAuthProvider, linkWithCredential,
  signOut, GoogleAuthProvider, OAuthProvider, signInWithPopup, linkWithPopup,
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

let app, db, storage, auth, functions;
if (firebaseReady) {
  app = initializeApp(firebaseConfig);
  // Named Firestore database (Firebase console lets you create one with a
  // custom id instead of "(default)" — set VITE_FIREBASE_DATABASE_ID if so).
  const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;
  // Persists reads to IndexedDB so trips already opened once are still
  // readable offline (PWA offline support relies on this, not just the
  // service worker caching static assets).
  const firestoreSettings = { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) };
  db = databaseId
    ? initializeFirestore(app, firestoreSettings, databaseId)
    : initializeFirestore(app, firestoreSettings);
  storage = getStorage(app);
  auth = getAuth(app);
  functions = getFunctions(app, "us-central1");
} else {
  console.warn(
    "[firebase] 설정값이 없어 Firebase를 초기화하지 않았어요. web/.env.local에 VITE_FIREBASE_* 값을 채워주세요."
  );
}

export { db, storage, auth, functions };

/** Subscribes to auth state; fires with the current user (or null) on every change. */
export function watchAuth(onChange) {
  if (!firebaseReady) { onChange(null); return () => {}; }
  return onAuthStateChanged(auth, onChange);
}

export function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Creates an account for email/password. If the browser already holds an
 * anonymous session (e.g. from trying the app before signing up), this
 * LINKS the new credential to that same uid instead of minting a fresh one
 * — any trips already owned by that anonymous session carry over as-is,
 * rather than becoming orphaned under a uid nobody can sign back into.
 */
export function signUp(email, password) {
  const current = auth.currentUser;
  if (current && current.isAnonymous) {
    const credential = EmailAuthProvider.credential(email, password);
    return linkWithCredential(current, credential);
  }
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signOutUser() {
  return signOut(auth);
}

/**
 * Sign in (or, if currently anonymous, upgrade-in-place via linkWithPopup so
 * existing trips carry over — same rationale as signUp's email/password path)
 * with a popup-based provider.
 */
function socialSignIn(provider) {
  const current = auth.currentUser;
  if (current && current.isAnonymous) {
    return linkWithPopup(current, provider);
  }
  return signInWithPopup(auth, provider);
}

export function signInWithGoogle() {
  return socialSignIn(new GoogleAuthProvider());
}

export function signInWithKakao() {
  return socialSignIn(new OAuthProvider(KAKAO_OIDC_PROVIDER_ID));
}

/** Korean messages for the Firebase Auth error codes users actually hit. */
export function authErrorMessage(err) {
  const map = {
    "auth/email-already-in-use": "이미 가입된 이메일이에요. 로그인해주세요.",
    "auth/invalid-email": "이메일 형식이 올바르지 않아요.",
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
