// Phone-width header menu: the nickname and the account buttons that sit in
// the header on wider screens (see .top-actions-full / .top-menu in app.css).
import { useEffect, useRef, useState } from "react";
import { addBackHandler } from "../lib/backHandlers";

export default function HeaderMenu({ nickname, onEditNickname, onPushSettings, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    const removeBack = addBackHandler(() => { setOpen(false); return true; });
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
      removeBack();
    };
  }, [open]);

  const pick = (fn) => () => { setOpen(false); fn(); };
  return (
    <div className="top-menu" ref={ref}>
      <button type="button" className="btn btn-sm top-menu-btn" aria-haspopup="menu" aria-expanded={open} aria-label="메뉴" onClick={() => setOpen((v) => !v)}>
        <span className="top-menu-nick">{nickname || "닉네임 없음"}</span>
        <span aria-hidden="true">☰</span>
      </button>
      {open && (
        <div className="top-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={pick(onEditNickname)}>닉네임 수정</button>
          {onPushSettings && <button type="button" role="menuitem" onClick={pick(onPushSettings)}>알림 설정</button>}
          <button type="button" role="menuitem" onClick={pick(onSignOut)}>로그아웃</button>
        </div>
      )}
    </div>
  );
}
