import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, connectAuthEmulator, signInWithCustomToken, signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithCredential,
  setPersistence, browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail,
} from "firebase/auth";
import { isNativeApp } from "./platform";

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

export const useEmulators = import.meta.env.VITE_USE_EMULATORS === "1";

// Firestore lives in ./db.js (loaded only once someone is signed in).
let app, auth;
if (firebaseReady) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Local-only: `VITE_USE_EMULATORS=1 npm run dev` points everything at the
  // Firebase emulators (firebase emulators:start) instead of production.
  if (useEmulators) {
    connectAuthEmulator(auth, "http://127.0.0.1:9299", { disableWarnings: true });
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

export { app, auth };

// Cloud Functions and Storage SDKs are only needed for a few actions (AI
// recs, photos, public links, account deletion, error reports), so they're
// loaded on first use instead of weighing down the initial page load.
let functionsModule;
function loadFunctions() {
  functionsModule ||= import("firebase/functions").then((m) => {
    const region = (r) => {
      const instance = m.getFunctions(app, r);
      if (useEmulators) m.connectFunctionsEmulator(instance, "127.0.0.1", 5001);
      return instance;
    };
    return { instances: { "us-central1": region("us-central1"), "asia-northeast3": region("asia-northeast3") }, httpsCallable: m.httpsCallable };
  });
  return functionsModule;
}

/** Calls a callable Cloud Function; resolves its `data`. Most functions run
 * in us-central1; pass `region` for the ones that don't. */
export async function callFunction(name, data, { region = "us-central1" } = {}) {
  const { instances, httpsCallable } = await loadFunctions();
  const res = await httpsCallable(instances[region], name)(data);
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

const cancelled = () => Object.assign(new Error("sign-in cancelled"), { code: "auth/popup-closed-by-user" });

// In the app, Google blocks its sign-in page inside the app's WebView, so the
// phone's own account picker runs instead; its ID token then signs in *this*
// (JS) Firebase Auth — the same account as on the website.
async function nativeGoogleSignIn() {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  try {
    const { credential } = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    return await signInWithCredential(auth, GoogleAuthProvider.credential(credential?.idToken, credential?.accessToken));
  } catch (err) {
    if (!String(err?.code || "").startsWith("auth/") && /cancel|closed/i.test(String(err?.message))) throw cancelled();
    throw err;
  }
}

// Kakao in the app: Kakao's login page in the browser, back into the app via
// kr.tripplanner.app://auth/kakao, then the id_token the server parked for
// this attempt's random `state` (see kakaoCallback in functions/index.js)
// signs in as the same oidc.kakao account the website uses.
const KAKAO_REST_KEY = "ff139dec181f0ffcdd2d64bad5987cba";
// The function's own address, not tripplanner.kr/...: a browser that has
// visited the website has its service worker, which would answer that path
// with the web app itself instead of letting the request reach the function.
const KAKAO_REGION = "asia-northeast3"; // Seoul — see kakaoCallback in functions/index.js
const KAKAO_REDIRECT_URI = `https://${KAKAO_REGION}-travel-planner-bb32d.cloudfunctions.net/kakaoCallback`;

async function nativeKakaoSignIn() {
  // Wake both server functions now, while the user is on Kakao's login
  // page, so neither has to start up on the way back into the app.
  fetch(`${KAKAO_REDIRECT_URI}?warm=1`, { mode: "no-cors" }).catch(() => {});
  callFunction("claimKakaoLogin", { warm: true }, { region: KAKAO_REGION }).catch(() => {});
  const [{ App }, { Browser }] = await Promise.all([import("@capacitor/app"), import("@capacitor/browser")]);
  const state = [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const url = "https://kauth.kakao.com/oauth/authorize?" + new URLSearchParams({
    client_id: KAKAO_REST_KEY, redirect_uri: KAKAO_REDIRECT_URI, response_type: "code", scope: "openid", state,
  });

  // Settles when the browser sends the user back, or when they close it.
  const result = await new Promise((resolve) => {
    const subs = [];
    const done = (value) => { subs.forEach((s) => Promise.resolve(s).then((h) => h.remove())); resolve(value); };
    subs.push(App.addListener("appUrlOpen", ({ url: back }) => {
      if (!back.startsWith("kr.tripplanner.app://auth/kakao")) return;
      Browser.close().catch(() => {});
      done(new URL(back.replace("kr.tripplanner.app://", "https://x/")).searchParams.get("result") || "failed");
    }));
    // Closed by hand — which also happens when KakaoTalk finished the login
    // in another tab and the return link was missed; try the claim anyway.
    subs.push(Browser.addListener("browserFinished", () => setTimeout(() => done("closed"), 800)));
    Browser.open({ url }).catch(() => done("failed"));
  });

  if (result === "cancelled") throw cancelled();
  let idToken;
  try {
    ({ idToken } = await callFunction("claimKakaoLogin", { state }, { region: KAKAO_REGION }));
  } catch (err) {
    if (result === "closed") throw cancelled();
    throw Object.assign(new Error("kakao sign-in failed"), { code: "auth/internal-error", cause: err });
  }
  return signInWithCredential(auth, new OAuthProvider(KAKAO_OIDC_PROVIDER_ID).credential({ idToken }));
}

export function signInWithGoogle() {
  if (isNativeApp) return nativeGoogleSignIn();
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signInWithKakao() {
  if (isNativeApp) return nativeKakaoSignIn();
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
