import { useState } from "react";
import { tripStatus, statusLabel, ddayLabel, fmtMoney } from "../lib/utils";

export default function Home({ trips, onOpenTrip, onAddTrip, onJoinByCode }) {
  const sorted = [...trips].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);

  async function handleJoin(e) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setJoining(true);
    setError(null);
    try {
      await onJoinByCode(trimmed);
      setCode("");
    } catch {
      setError("코드를 찾을 수 없어요. 다시 확인해주세요.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <section>
      <form className="btn-row" style={{ marginBottom: 18 }} onSubmit={handleJoin}>
        <input
          style={{ flex: 1, minWidth: 160 }}
          placeholder="동행자에게 받은 참여 코드 입력"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="btn btn-sm" type="submit" disabled={joining || !code.trim()}>
          {joining ? "참여하는 중…" : "코드로 참여하기"}
        </button>
        {error && <span className="section-note" style={{ color: "var(--danger)" }}>{error}</span>}
      </form>

      <div className="section-head">
        <h2>내 여행</h2>
        <button className="btn btn-primary" onClick={onAddTrip}>+ 새 여행</button>
      </div>

      {trips.length === 0 ? (
        <div className="empty">아직 등록된 여행이 없어요. "새 여행"으로 첫 여행을 만들어보세요.</div>
      ) : (
        <div className="trip-grid">
          {sorted.map((t) => {
            const st = tripStatus(t);
            const dday = ddayLabel(t);
            return (
              <button className="trip-card" key={t.id} onClick={() => onOpenTrip(t.id)}>
                <div className="trip-card-top">
                  <span className="trip-card-title">{t.title}</span>
                  <span className="btn-row" style={{ alignItems: "center" }}>
                    {dday && <span className="food-card-tag nums">{dday}</span>}
                    <span className={"status " + st}>{statusLabel(st)}</span>
                  </span>
                </div>
                <div className="trip-card-meta">
                  <span>📍 {t.destination || "-"}</span>
                  <span className="nums">📅 {t.startDate} ~ {t.endDate}</span>
                  {t.travelers ? <span className="nums">👥 {t.travelers}명</span> : null}
                  {t.budgetTotal ? <span className="nums">💴 {fmtMoney(t.budgetTotal)}원</span> : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
