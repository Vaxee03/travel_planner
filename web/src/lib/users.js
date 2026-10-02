// Account-level nicknames, stored separately from trip documents so the same
// nickname follows a user across every trip they're a member of.
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "./db";

export { DEFAULT_NICKNAME, NICKNAME_MAX } from "./nickname";

const cache = new Map();

export async function fetchNickname(uid) {
  if (!uid) return "";
  if (cache.has(uid)) return cache.get(uid);
  const snap = await getDoc(doc(db, "users", uid));
  const nickname = snap.exists() ? snap.data().nickname || "" : "";
  cache.set(uid, nickname);
  return nickname;
}

/** Lookup for displaying several uids at once (member lists, item
 * authors). One document read per uid: the security rules only allow
 * reading user documents individually, never querying the collection. */
export async function fetchNicknames(uids) {
  const unique = [...new Set(uids.filter(Boolean))];
  const missing = unique.filter((uid) => !cache.has(uid));
  await Promise.all(missing.map(async (uid) => {
    const snap = await getDoc(doc(db, "users", uid));
    cache.set(uid, snap.exists() ? snap.data().nickname || "" : "");
  }));
  const result = {};
  unique.forEach((uid) => { result[uid] = cache.get(uid) || ""; });
  return result;
}

/** Live version of fetchNicknames: calls onChange({ uid: nickname }) now and
 * again whenever any of these users changes their nickname, so a companion
 * who sets or edits theirs shows up by name without anyone refreshing.
 * Returns an unsubscribe function. */
export function watchNicknames(uids, onChange) {
  const unique = [...new Set(uids.filter(Boolean))];
  const emit = () => onChange(Object.fromEntries(unique.map((uid) => [uid, cache.get(uid) || ""])));
  // One listener per user document (see fetchNicknames on why not a query).
  const unsubs = unique.map((uid) => onSnapshot(
    doc(db, "users", uid),
    (snap) => {
      cache.set(uid, snap.exists() ? snap.data().nickname || "" : "");
      emit();
    },
    () => { /* keep whatever is cached */ }
  ));
  if (unique.every((uid) => cache.has(uid))) emit();
  return () => unsubs.forEach((u) => u());
}

/** The signed-in user's own profile: nickname and which terms version they
 * agreed to (see lib/terms.js). */
export async function fetchProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? snap.data() : {};
  cache.set(uid, data.nickname || "");
  return { nickname: data.nickname || "", termsVersion: data.termsVersion || null };
}

export function agreeToTerms(uid, termsVersion) {
  return setDoc(doc(db, "users", uid), { termsVersion, termsAgreedAt: serverTimestamp() }, { merge: true });
}

export function setNickname(uid, nickname) {
  cache.set(uid, nickname);
  return setDoc(doc(db, "users", uid), { nickname, updatedAt: Date.now() }, { merge: true });
}
