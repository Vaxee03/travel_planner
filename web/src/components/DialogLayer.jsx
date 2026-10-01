// Shows the confirm / alert dialogs from lib/dialogs.js above everything
// else, including an open form (whose own Esc handling steps aside while a
// second .modal-overlay is on screen). Esc and the Android back button
// (which sends Esc while an overlay is open) answer "cancel".
import { useEffect, useRef, useState } from "react";
import { answerDialog, subscribeDialog } from "../lib/dialogs";

export default function DialogLayer() {
  const [dialog, setDialog] = useState(null);
  const okRef = useRef(null);
  useEffect(() => subscribeDialog(setDialog), []);

  useEffect(() => {
    if (!dialog) return undefined;
    const previous = document.activeElement;
    okRef.current?.focus();
    function onKey(e) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      answerDialog(false);
    }
    // Capture phase, so it runs before the form dialog's own Esc handler.
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [dialog]);

  if (!dialog) return null;
  const danger = dialog.tone === "danger";
  return (
    <div className="modal-overlay dialog-layer" onClick={(e) => { if (e.target === e.currentTarget) answerDialog(false); }}>
      <div className="modal dialog-box" role="alertdialog" aria-modal="true" aria-describedby="app-dialog-msg">
        <p id="app-dialog-msg" className="dialog-msg">{dialog.message}</p>
        <div className="modal-actions">
          {dialog.cancelLabel && <button type="button" className="btn" onClick={() => answerDialog(false)}>{dialog.cancelLabel}</button>}
          <button
            ref={okRef}
            type="button"
            className="btn btn-primary"
            style={danger ? { background: "var(--danger)", borderColor: "var(--danger)" } : undefined}
            onClick={() => answerDialog(true)}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
