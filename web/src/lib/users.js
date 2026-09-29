// Account-level nicknames, stored separately from trip documents so the same
// nickname follows a user across every trip they're a member of.
import { doc, getDoc, setDoc, getDocs, onSnapshot, collection, query, where, documentId } from "firebase/firestore";
import { db } from "./firebase";

export const DEFAULT_NICKNAME = "이름 없는 동행자";
export const NICKNAME_MAX = 20;

const cache = new Map();

export async function fetchNickname(uid) {
  if (!uid) return "";
  if (cache.has(uid)) return cache.get(uid);
  const snap = await getDoc(doc(db, "users", uid));
  const nickname = snap.exists() ? snap.data().nickname || "" : "";
  cache.set(uid, nickname);
  return nickname;
}

/** Batched lookup for displaying several uids at once (member lists, item
 * authors). Firestore's `in` filter caps at 30 ids per query, so chunk. */
export async function fetchNicknames(uids) {
  const unique = [...new Set(uids.filter(Boolean))];
  const missing = unique.filter((uid) => !cache.has(uid));
  for (let i = 0; i < missing.length; i += 30) {
    const chunk = missing.slice(i, i + 30);
    const snap = await getDocs(query(collection(db, "users"), where(documentId(), "in", chunk)));
    const found = new Set();
    snap.forEach((d) => { cache.set(d.id, d.data().nickname || ""); found.add(d.id); });
    chunk.forEach((uid) => { if (!found.has(uid)) cache.set(uid, ""); });
  }
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
  const unsubs = [];
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    unsubs.push(onSnapshot(
      query(collection(db, "users"), where(documentId(), "in", chunk)),
      (snap) => {
        const found = new Set();
        snap.forEach((d) => { cache.set(d.id, d.data().nickname || ""); found.add(d.id); });
        chunk.forEach((uid) => { if (!found.has(uid)) cache.set(uid, ""); });
        emit();
      },
      () => { /* keep whatever is cached */ }
    ));
  }
  if (unique.every((uid) => cache.has(uid))) emit();
  return () => unsubs.forEach((u) => u());
}

export function setNickname(uid, nickname) {
  cache.set(uid, nickname);
  return setDoc(doc(db, "users", uid), { nickname, updatedAt: Date.now() }, { merge: true });
}
