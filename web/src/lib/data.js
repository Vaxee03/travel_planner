// The trip/nickname data functions App needs, with the same names and
// signatures as tripsApi.js / users.js — but the Firestore code behind them
// is only downloaded on first call. App always imports from here, so the
// landing page and login screen (no user yet → no calls) never load it.
const load = () => import("./dataImpl");

const lazy = (name) => async (...args) => (await load())[name](...args);

export const createTrip = lazy("createTrip");
export const mutateTrip = lazy("mutateTrip");
export const deleteTrip = lazy("deleteTrip");
export const joinTrip = lazy("joinTrip");
export const removeMember = lazy("removeMember");
export const setChecklistDone = lazy("setChecklistDone");
export const setPublicShareId = lazy("setPublicShareId");
export const fetchNickname = lazy("fetchNickname");
export const setNickname = lazy("setNickname");
export const fetchProfile = lazy("fetchProfile");
export const agreeToTerms = lazy("agreeToTerms");

/** Same as tripsApi.subscribeTrips (returns an unsubscribe function right
 * away), with the listener attached once the module has loaded. */
export function subscribeTrips(uid, onChange, onError) {
  let unsub = null;
  let stopped = false;
  load().then(
    (m) => { if (!stopped) unsub = m.subscribeTrips(uid, onChange, onError); },
    (err) => onError?.(err)
  );
  return () => { stopped = true; unsub?.(); };
}
