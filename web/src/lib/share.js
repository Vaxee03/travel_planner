import { isNativeApp } from "./platform";

/** Shares a link through the device's own share sheet (on phones that's
 * where KakaoTalk, Messages etc. show up) and falls back to copying the link
 * where the Web Share API isn't available (most desktop browsers).
 * Resolves "shared" | "copied" | "cancelled" | "failed". */
export async function shareLink({ title, text, url }) {
  if (isNativeApp) {
    // The Android WebView has no Web Share API; the app's own share sheet.
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, url, dialogTitle: title });
      return "shared";
    } catch (err) {
      if (/cancel/i.test(String(err?.message))) return "cancelled";
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled"; // user closed the sheet
      // anything else (e.g. not allowed here) → fall back to copying
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    // Some in-app browsers (KakaoTalk's included) block the async clipboard
    // API; the old select-and-copy route still works in most of them.
    return legacyCopy(url) ? "copied" : "failed";
  }
}

function legacyCopy(text) {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
  document.body.appendChild(el);
  el.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  el.remove();
  return ok;
}

/** The label the share button should show on this device. */
export const shareButtonLabel = () => (isNativeApp || (typeof navigator !== "undefined" && navigator.share) ? "📤 공유하기" : "🔗 링크 복사");
