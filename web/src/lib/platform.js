// Web vs. the Android/iOS app (Capacitor). The app bundles this same code and
// serves it from its own local origin (https://localhost), so anything that
// builds a link for other people must use the public site instead.
import { Capacitor } from "@capacitor/core";

export const isNativeApp = Capacitor.isNativePlatform();

/** Origin for links shared with others (invites, public trip pages). */
export const PUBLIC_ORIGIN = isNativeApp || typeof window === "undefined" ? "https://tripplanner.kr" : window.location.origin;
