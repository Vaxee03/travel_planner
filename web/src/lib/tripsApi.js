// Single point of contact for all trip data access. Components never touch
// the Firestore/Storage SDKs directly — swapping this file's internals for
// REST calls to a real backend later shouldn't require touching any component.

import {
  collection, doc, onSnapshot, addDoc, deleteDoc, updateDoc,
  arrayUnion, arrayRemove, deleteField, serverTimestamp, query, where, runTransaction,
} from "firebase/firestore";
import { db, callFunction, loadStorage } from "./firebase";
import { emptyTrip } from "./utils";

const tripsCol = () => collection(db, "trips");

export function subscribeTrips(uid, onChange, onError) {
  // The where() clause is required, not just an optimization: Firestore
  // rejects an entire unfiltered list query if it can't statically prove
  // every possible result satisfies the security rule, even when every
  // document actually in the collection would pass. Filtering here on the
  // same field the rule checks (memberIds) is what makes the rule provable.
  const q = query(tripsCol(), where("memberIds", "array-contains", uid));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export async function createTrip(uid, fields) {
  const trip = emptyTrip({
    ...fields,
    ownerId: uid,
    memberIds: [uid],
    createdAt: serverTimestamp(),
  });
  const ref_ = await addDoc(tripsCol(), trip);
  return ref_.id;
}

const isPlainData = (v) => Array.isArray(v) || (v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype);

/** Applies `mutate(draft)` to the trip's *latest server copy* inside a
 * transaction and writes back only the top-level fields it changed.
 *
 * This replaces the old "clone my local snapshot, edit, setDoc the whole
 * trip" pattern, which silently dropped another member's edit made in the
 * meantime (last write wins over the whole document). Here Firestore reruns
 * `mutate` on fresh data if someone else wrote first, and untouched fields
 * are never rewritten — so they also keep their stored types (the old
 * pattern turned createdAt's Timestamp into a plain map on every save).
 *
 * `mutate` may run more than once, so it must only edit the draft.
 * Needs a connection (transactions don't queue offline). */
export function mutateTrip(tripId, mutate) {
  const ref_ = doc(db, "trips", tripId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref_);
    if (!snap.exists()) throw new Error("trip-not-found");
    const current = snap.data();
    // Deep-copy only plain data; class instances (Timestamp) stay as-is so
    // they compare equal and never get rewritten.
    const draft = Object.fromEntries(
      Object.entries(current).map(([k, v]) => [k, isPlainData(v) ? structuredClone(v) : v])
    );
    mutate(draft);
    const changes = {};
    for (const k of new Set([...Object.keys(current), ...Object.keys(draft)])) {
      if (!(k in draft)) changes[k] = deleteField();
      else if (JSON.stringify(draft[k]) !== JSON.stringify(current[k])) changes[k] = draft[k];
    }
    if (Object.keys(changes).length) tx.update(ref_, changes);
  });
}

export function deleteTrip(tripId) {
  return deleteDoc(doc(db, "trips", tripId));
}

export function joinTrip(tripId, uid) {
  return updateDoc(doc(db, "trips", tripId), { memberIds: arrayUnion(uid) });
}

/** Drops a member from a trip along with any permissions they'd been
 * granted. Used both for leaving on your own (non-방장 only, see the
 * isLeavingSelf rule) and for the 방장 removing someone else. */
export function removeMember(tripId, uid) {
  return updateDoc(doc(db, "trips", tripId), {
    memberIds: arrayRemove(uid),
    [`memberPermissions.${uid}`]: deleteField(),
  });
}

/** A single-field update (not a mutateTrip transaction) so toggling a
 * checklist box — the one action every member is always allowed to do
 * regardless of permissions — is instant, works offline, and only ever
 * touches checklistDone. */
export function setChecklistDone(tripId, itemId, done) {
  return updateDoc(doc(db, "trips", tripId), { [`checklistDone.${itemId}`]: done });
}

/** Turns the public share link on (a new random id) or off — a single-field
 * update that never touches the rest of the trip. Resolves the new id (or
 * null when turned off). */
export async function setPublicShareId(tripId, on) {
  const shareId = on ? randomShareId() : null;
  await updateDoc(doc(db, "trips", tripId), { publicShareId: on ? shareId : deleteField() });
  return shareId;
}

function randomShareId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Read-only itinerary behind a public share link (no sign-in needed),
 * served by the getPublicTrip function. Resolves null when the link was
 * turned off or never existed. */
export async function fetchPublicTrip(shareId) {
  try {
    return await callFunction("getPublicTrip", { shareId });
  } catch (err) {
    if (err?.code === "functions/not-found") return null;
    throw err;
  }
}

/** Stored under the uploader's own folder — storage.rules only lets that
 * member delete it. */
export async function uploadReviewPhoto(tripId, uid, file) {
  const path = `trips/${tripId}/review/${uid}/${Date.now()}_${file.name}`;
  const { instance, ref, uploadBytes, getDownloadURL } = await loadStorage();
  const storageRef = ref(instance, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, path };
}

export async function deleteReviewPhoto(path) {
  const { instance, ref, deleteObject } = await loadStorage();
  return deleteObject(ref(instance, path)).catch(() => {});
}
