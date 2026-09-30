// Push notifications (Android/iOS app only; the website doesn't register).
//
// Each phone's FCM token lives in users/{uid}/devices/{token}, readable and
// writable only by that user (firestore.rules). The server functions in
// functions/index.js send to those tokens:
//   - notifyTripChange: a companion changed the trip (called after saves)
//   - tripReminders:    the day before a trip starts, 9am KST
// Per-user on/off switches live in users/{uid}/private/prefs.
import { doc, setDoc, deleteDoc, getDoc } from "firebase/firestore";
import { db } from "./db";
import { isNativeApp } from "./platform";

export const PUSH_CHANNEL_ID = "trip_updates";
export const DEFAULT_PUSH_PREFS = { tripChanges: true, reminders: true };

let currentToken = null;
let listeners = [];

const deviceRef = (uid, token) => doc(db, "users", uid, "devices", token);
const prefsRef = (uid) => doc(db, "users", uid, "private", "prefs");

/** After sign-in in the app: ask for permission (once — Android shows its
 * own dialog), save this phone's token, and route notification taps. */
export async function startPush(uid, navigate) {
  if (!isNativeApp) return;
  const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
  stopListeners();
  let { receive } = await FirebaseMessaging.checkPermissions();
  if (receive === "prompt" || receive === "prompt-with-rationale") {
    ({ receive } = await FirebaseMessaging.requestPermissions());
  }
  if (receive !== "granted") return;

  await FirebaseMessaging.createChannel({
    id: PUSH_CHANNEL_ID, name: "여행 알림", description: "동행자의 변경 사항과 출발 전 알림", importance: 4,
  }).catch(() => {});

  const save = async (token) => {
    if (!token) return;
    if (currentToken && currentToken !== token) await deleteDoc(deviceRef(uid, currentToken)).catch(() => {});
    currentToken = token;
    await setDoc(deviceRef(uid, token), { platform: "android", updatedAt: Date.now() });
  };
  listeners = [
    FirebaseMessaging.addListener("tokenReceived", ({ token }) => save(token)),
    FirebaseMessaging.addListener("notificationActionPerformed", ({ notification }) => {
      const path = notification?.data?.path;
      if (typeof path === "string" && path.startsWith("/")) navigate(path);
    }),
  ];
  const { token } = await FirebaseMessaging.getToken();
  await save(token);
}

function stopListeners() {
  listeners.forEach((l) => Promise.resolve(l).then((h) => h.remove()).catch(() => {}));
  listeners = [];
}

/** Before signing out: this phone should stop getting that account's
 * notifications. Needs the user still signed in (the rules check it). */
export async function stopPush(uid) {
  if (!isNativeApp) return;
  stopListeners();
  const token = currentToken;
  currentToken = null;
  if (uid && token) await deleteDoc(deviceRef(uid, token)).catch(() => {});
  const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
  await FirebaseMessaging.deleteToken().catch(() => {});
}

export async function pushPermitted() {
  if (!isNativeApp) return false;
  const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
  return (await FirebaseMessaging.checkPermissions()).receive === "granted";
}

export async function loadPushPrefs(uid) {
  const snap = await getDoc(prefsRef(uid));
  return { ...DEFAULT_PUSH_PREFS, ...(snap.exists() ? snap.data() : {}) };
}

export function savePushPrefs(uid, prefs) {
  return setDoc(prefsRef(uid), {
    tripChanges: Boolean(prefs.tripChanges), reminders: Boolean(prefs.reminders), updatedAt: Date.now(),
  });
}
