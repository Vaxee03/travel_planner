import { useEffect, useRef, useState } from "react";
import { drawInviteCard, canvasToBlob, inviteJoinUrl } from "../lib/inviteCard";
import { saveBlobAsFile } from "../lib/utils";

function CopyField({ label, value, copyKey, onCopy, inputRef, mono }) {
  return (
    <div className="field" style={{ marginTop: 14 }}>
      <label>{label}</label>
      <div className="btn-row" style={{ flexWrap: "nowrap" }}>
        <input
          key={copyKey}
          ref={inputRef}
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
          className={copyKey ? "copy-flash" : undefined}
          style={{ flex: 1, width: "auto", minWidth: 0, ...(mono ? { fontFamily: '"JetBrains Mono", monospace' } : null) }}
        />
        <button type="button" className="btn btn-sm" style={{ flexShrink: 0, whiteSpace: "nowrap" }} onClick={onCopy}>
          복사
        </button>
      </div>
    </div>
  );
}

export default function InviteCard({ trip, onClose }) {
  const canvasRef = useRef(null);
  const codeInputRef = useRef(null);
  const linkInputRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [codeCopyKey, setCodeCopyKey] = useState(0);
  const [linkCopyKey, setLinkCopyKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    drawInviteCard(canvasRef.current, trip).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, [trip]);

  async function handleDownload() {
    const blob = await canvasToBlob(canvasRef.current);
    saveBlobAsFile(`${trip.title} 초대장.png`, blob);
  }

  async function copyText(text, inputRef, setCopyKey) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Clipboard API needs a secure context and can still be denied by
      // browser/embedded-webview policy — fall back to the older
      // select-and-execCommand copy, which works in more places.
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
        try { ok = document.execCommand("copy"); } catch { ok = false; }
      }
    }
    if (ok) {
      // A fresh key remounts the field so its copy-flash animation restarts
      // from the beginning even if it's still fading out from a previous copy.
      setCopyKey(Date.now());
      setTimeout(() => setCopyKey(0), 2000);
    } else {
      window.alert("자동 복사에 실패했어요. 입력창의 텍스트가 선택되어 있으니 Ctrl+C(또는 Cmd+C)로 직접 복사해주세요.");
    }
  }

  return (
    <>
      <h3 style={{ marginBottom: 14 }}>동행자 초대</h3>
      <div style={{ borderRadius: 16, overflow: "hidden", lineHeight: 0, opacity: ready ? 1 : 0.4, transition: "opacity .2s" }}>
        <canvas ref={canvasRef} style={{ width: "100%", display: "block" }} />
      </div>
      <CopyField
        label="참여 코드"
        value={trip.id}
        copyKey={codeCopyKey}
        inputRef={codeInputRef}
        mono
        onCopy={() => copyText(trip.id, codeInputRef, setCodeCopyKey)}
      />
      <CopyField
        label="초대 링크"
        value={inviteJoinUrl(trip.id)}
        copyKey={linkCopyKey}
        inputRef={linkInputRef}
        onCopy={() => copyText(inviteJoinUrl(trip.id), linkInputRef, setLinkCopyKey)}
      />
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>닫기</button>
        <button type="button" className="btn btn-primary" onClick={handleDownload} disabled={!ready}>이미지 다운로드</button>
      </div>
    </>
  );
}
