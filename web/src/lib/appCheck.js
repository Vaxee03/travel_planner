// Firebase App Check: every request to Firestore, Storage and the Cloud
// Functions carries a token proving it comes from this app — the website
// (reCAPTCHA Enterprise, invisible) or the Android app (Play Integrity) —
// rather than from a script reusing the public Firebase config.
//
// Only collects tokens until enforcement is switched on (Firebase console →
// App Check → APIs, and APP_CHECK_ENFORCED in functions/index.js), so nothing
// breaks while the metrics are checked. Skipped against the emulators.
//   - website: needs VITE_RECAPTCHA_ENTERPRISE_KEY (a public site key) in the
//     build env; local `npm run dev` uses the debug provider instead, whose
//     token is printed in the browser console to register in the console.
//   - Android: a debug build (window.Capacitor.DEBUG) uses the debug provider
//     — its token shows in logcat ("DebugAppCheckProvider") — and a release
//     build Play Integrity.
import { initializeAppCheck, ReCaptchaEnterpriseProvider, CustomProvider } from "firebase/app-check";
import { isNativeApp } from "./platform";

export function startAppCheck(app) {
  if (isNativeApp) {
    // Resolves to a wrapper, never the plugin itself: a Capacitor plugin is a
    // proxy that answers any method name, so a promise resolving to it would
    // call its (missing) native "then".
    const ready = import("@capacitor-firebase/app-check").then(async ({ FirebaseAppCheck }) => {
      await FirebaseAppCheck.initialize({ debugToken: Boolean(window.Capacitor?.DEBUG), isTokenAutoRefreshEnabled: true });
      return { plugin: FirebaseAppCheck };
    });
    const provider = new CustomProvider({
      getToken: async () => {
        const { plugin } = await ready;
        const { token, expireTimeMillis } = await plugin.getToken();
        return { token, expireTimeMillis };
      },
    });
    return initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
  }
  if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  const siteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_KEY;
  if (!siteKey) return null;
  return initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
}
