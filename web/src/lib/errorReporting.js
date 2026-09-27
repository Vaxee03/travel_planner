// Sends errors that happen in users' browsers to the logClientError function
// (Cloud Logging), so a failure someone hits in production can be diagnosed
// without asking them for screenshots. Only active in real deployed builds —
// local dev and the emulator just keep logging to the console.
import { callFunction, firebaseReady } from "./firebase";

const enabled = import.meta.env.PROD && import.meta.env.VITE_USE_EMULATORS !== "1" && firebaseReady;
const MAX_PER_SESSION = 20;
const sent = new Set();

/** Reports an error once per session per distinct message; never throws. */
export function reportError(err, where = "") {
  console.error(`[${where || "error"}]`, err);
  if (!enabled || sent.size >= MAX_PER_SESSION) return;
  const message = err?.message || String(err);
  const key = `${where}|${err?.code || ""}|${message}`;
  if (sent.has(key)) return;
  sent.add(key);
  callFunction("logClientError", {
    where,
    message,
    name: err?.name,
    code: err?.code,
    stack: err?.stack,
    url: window.location.pathname,
    userAgent: navigator.userAgent,
    release: __APP_RELEASE__,
  }).catch(() => {});
}

/** Catches anything nobody else handled — uncaught errors and rejected
 * promises — anywhere in the app. */
export function installGlobalErrorHandlers() {
  window.addEventListener("error", (e) => reportError(e.error || e.message, "window.onerror"));
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason, "unhandledrejection"));
}
