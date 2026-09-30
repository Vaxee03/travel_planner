// In-page "back" steps that aren't part of the URL (e.g. an open day inside
// the itinerary tab). The Android back button (lib/useNativeShell.js) asks
// the most recently added handler first; a handler returns true if it
// handled the press.
const handlers = [];

/** Adds a handler; returns a function that removes it. */
export function addBackHandler(fn) {
  handlers.push(fn);
  return () => {
    const i = handlers.lastIndexOf(fn);
    if (i >= 0) handlers.splice(i, 1);
  };
}

export function runBackHandlers() {
  for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i]()) return true;
  return false;
}
