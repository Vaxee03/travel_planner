// In-app replacements for window.confirm / window.alert. In the Android app
// those show the system's own dialog (with English "CANCEL / OK" buttons on
// some phones); these use the app's look instead. Rendered by
// components/DialogLayer.jsx, which App mounts once.
let current = null; // { message, confirmLabel, cancelLabel, tone, resolve }
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(current));

export function subscribeDialog(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

function open(options) {
  // One at a time: a new one answers the previous as "cancel".
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...options, resolve };
    emit();
  });
}

/** Resolves true when the user confirms, false on cancel / Esc / back. */
export function confirmDialog(message, { confirmLabel = "확인", cancelLabel = "취소", tone = "primary" } = {}) {
  return open({ message, confirmLabel, cancelLabel, tone });
}

/** A message with a single "확인" button; resolves when it's dismissed. */
export function alertDialog(message) {
  return open({ message, confirmLabel: "확인", cancelLabel: null, tone: "primary" }).then(() => undefined);
}

export function answerDialog(ok) {
  if (!current) return;
  const { resolve } = current;
  current = null;
  emit();
  resolve(ok);
}
