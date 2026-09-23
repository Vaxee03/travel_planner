// Account-level nicknames, stored separately from trip documents so the same
// nickname follows a user across every trip they're a member of.
import { doc, getDoc, setDoc, getDocs, collection, query, where, documentId } from "firebase/firestore";
import { db } from "./firebase";

export const DEFAULT_NICKNAME = "이름 없는 동행자";

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

export function setNickname(uid, nickname) {
  cache.set(uid, nickname);
  return setDoc(doc(db, "users", uid), { nickname, updatedAt: Date.now() }, { merge: true });
}
