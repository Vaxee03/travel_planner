// The invite card: what an invite link (/join/<tripId>) or a typed join code
// opens. Shows which trip it is and asks before joining — modelled on
// Discord's "You've been invited to join a server" screen. The preview comes
// from the getInvitePreview function (non-members can't read the trip).
import { useEffect, useState } from "react";
import { callFunction } from "../lib/firebase";
import { fmtDate } from "../lib/utils";
import { DEFAULT_NICKNAME } from "../lib/nickname";

const MESSAGES = {
  "not-found": ["초대 코드를 찾을 수 없어요", "코드가 맞는지 확인하거나, 방장에게 새 초대 링크를 받아주세요."],
  blocked: ["이 여행에는 참여할 수 없어요", "방장이 이 계정을 내보낸 여행이에요. 다시 참여하려면 방장에게 '다시 참여 허용'을 요청해주세요."],
  error: ["초대 정보를 불러오지 못했어요", "인터넷 연결을 확인한 뒤 다시 시도해주세요."],
};

export default function JoinInvite({ tripId, onJoin, onOpen, onClose }) {
  const [preview, setPreview] = useState(null); // null = loading
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    callFunction("getInvitePreview", { tripId }, { region: "asia-northeast3" })
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch(() => { if (!cancelled) setPreview({ status: "error" }); });
    return () => { cancelled = true; };
  }, [tripId, attempt]);

  async function join() {
    setJoining(true);
    setJoinError(null);
    try {
      await onJoin();
    } catch {
      setJoinError("참여하지 못했어요. 잠시 후 다시 시도하거나 방장에게 문의해주세요.");
      setJoining(false);
    }
  }

  if (!preview) {
    return <div className="invite-page"><div className="invite-card"><p className="invite-sub">초대 정보를 불러오는 중이에요…</p></div></div>;
  }

  const problem = MESSAGES[preview.status];
  if (problem) {
    return (
      <div className="invite-page">
        <div className="invite-card" role="alert">
          <div className="invite-emoji" aria-hidden="true">{preview.status === "error" ? "📡" : "🔒"}</div>
          <h2 className="invite-title">{problem[0]}</h2>
          <p className="invite-sub">{problem[1]}</p>
          <div className="invite-actions">
            {preview.status === "error" && <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>다시 시도</button>}
            <button type="button" className="btn btn-primary" onClick={onClose}>내 여행으로</button>
          </div>
        </div>
      </div>
    );
  }

  const host = preview.ownerNickname || DEFAULT_NICKNAME;
  const names = preview.memberNicknames.map((n) => n || DEFAULT_NICKNAME);
  const more = preview.memberCount - 1 - names.length;
  const period = preview.startDate ? `${fmtDate(preview.startDate)} ~ ${fmtDate(preview.endDate)}` : "";
  const member = preview.status === "member";
  return (
    <div className="invite-page">
      <div className="invite-card">
        <div className="invite-emoji" aria-hidden="true">✈️</div>
        <p className="invite-kicker">{member ? "이미 참여 중인 여행이에요" : `${host}님이 여행에 초대했어요`}</p>
        <h2 className="invite-title">{preview.title || "제목 없는 여행"}</h2>
        <ul className="invite-facts">
          {preview.destination && <li><span aria-hidden="true">📍</span> {preview.destination}</li>}
          {period && <li><span aria-hidden="true">📅</span> {period}</li>}
          <li>
            <span aria-hidden="true">👥</span> 동행자 {preview.memberCount}명
            <span className="invite-names"> · 방장 {host}{names.length ? `, ${names.join(", ")}` : ""}{more > 0 ? ` 외 ${more}명` : ""}</span>
          </li>
        </ul>
        {joinError && <p className="invite-error" role="alert">{joinError}</p>}
        <div className="invite-actions">
          {member ? (
            <>
              <button type="button" className="btn" onClick={onClose}>닫기</button>
              <button type="button" className="btn btn-primary" onClick={onOpen}>여행 열기</button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={onClose} disabled={joining}>나중에</button>
              <button type="button" className="btn btn-primary" onClick={join} disabled={joining}>{joining ? "참여하는 중…" : "참여하기"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
