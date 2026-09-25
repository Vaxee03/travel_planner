// Single point of contact for all trip data access. Components never touch
// the Firestore/Storage SDKs directly — swapping this file's internals for
// REST calls to a real backend later shouldn't require touching any component.

import {
  collection, doc, onSnapshot, setDoc, addDoc, deleteDoc, updateDoc,
  arrayUnion, arrayRemove, deleteField, serverTimestamp, query, where,
} from "firebase/firestore";
import {
  ref, uploadBytes, getDownloadURL, deleteObject,
} from "firebase/storage";
import { db, storage } from "./firebase";
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

export function saveTrip(trip) {
  const { id, ...data } = trip;
  return setDoc(doc(db, "trips", id), data);
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

/** A targeted field update (not the usual read-whole-trip/mutate/saveTrip
 * pattern) so that toggling a checklist box — the one action every member is
 * always allowed to do regardless of permissions — can never get rejected by
 * the security rules just because some other unrelated field in this
 * member's local trip snapshot happened to be stale relative to the server. */
export function setChecklistDone(tripId, itemId, done) {
  return updateDoc(doc(db, "trips", tripId), { [`checklistDone.${itemId}`]: done });
}

export async function uploadReviewPhoto(tripId, file) {
  const path = `trips/${tripId}/review/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, path };
}

export function deleteReviewPhoto(path) {
  return deleteObject(ref(storage, path)).catch(() => {});
}
