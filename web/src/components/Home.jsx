import { tripStatus, statusLabel, ddayLabel, fmtMoney } from "../lib/utils";

export default function Home({ trips, onOpenTrip, onAddTrip }) {
  const sorted = [...trips].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));

  return (
    <section>
      <div className="section-head">
        <h2>내 여행</h2>
        <button className="btn btn-primary" onClick={onAddTrip}>+ 새 여행</button>
      </div>

      <div className="note" style={{ marginBottom: 18 }}>
        <span className="dot" />
        <span>이 링크의 URL 뒤에 <code>?join=여행ID</code>를 붙여서 동행자에게 공유하면 같은 여행을 실시간으로 같이 보고 수정할 수 있어요.</span>
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
