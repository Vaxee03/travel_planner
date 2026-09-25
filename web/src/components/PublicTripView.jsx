import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { subscribePublicTrip } from "../lib/tripsApi";
import { fmtDate, splitItems } from "../lib/utils";

/** /share/:shareId — the read-only itinerary a 방장 shared publicly. Works
 * signed out; shows only what the syncPublicTrip function copied over. */
export default function PublicTripView({ shareId }) {
  const [trip, setTrip] = useState(undefined); // undefined = loading, null = not found
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setTrip(undefined);
    setSlow(false);
    // A just-enabled link can take a few seconds to appear, so don't call
    // it missing right away.
    const timer = setTimeout(() => setSlow(true), 6000);
    const unsub = subscribePublicTrip(shareId, setTrip, () => setTrip(null));
    return () => { clearTimeout(timer); unsub(); };
  }, [shareId]);

  if (trip === undefined || (trip === null && !slow)) {
    return <div className="empty">공유된 일정을 불러오는 중이에요…</div>;
  }
  if (trip === null) {
    return (
      <div className="empty">
        공유가 중지됐거나 없는 링크예요.
        <div style={{ marginTop: 12 }}><Link className="btn" to="/">여행 플래너로 가기</Link></div>
      </div>
    );
  }

  const days = trip.days || [];
  return (
    <>
      <div className="trip-head">
        <div className="trip-head-top"><h1>{trip.title}</h1></div>
        <div className="chips">
          <span className="chip">{trip.tripType === "domestic" ? "🇰🇷 국내" : "✈️ 해외"}</span>
          <span className="chip">📍 {trip.destination || "-"}</span>
          <span className="chip nums">📅 {trip.startDate} – {trip.endDate}</span>
          <span className="chip">👀 읽기 전용 공유 일정</span>
        </div>
      </div>

      {days.length === 0 ? (
        <div className="empty">아직 등록된 일정이 없어요.</div>
      ) : (
        days.map((d, i) => {
          const { timeEntries, labelEntries } = splitItems(d.items);
          const entries = [...timeEntries, ...labelEntries];
          return (
            <section key={i}>
              <div className="section-head">
                <h2 className="nums">{fmtDate(d.date)}</h2>
                <span className={"status " + (d.status === "confirmed" ? "confirmed" : "open")}>{d.status === "confirmed" ? "확정" : "자유일정"}</span>
              </div>
              {d.summary && <div className="detail-sub">{d.summary}</div>}
              {entries.length > 0 && (
                <div className="card">
                  <ul className="plan-list">
                    {entries.map(({ it, idx }) => (
                      <li key={idx}>
                        <span className="plan-time">{it.time || ""}</span>
                        <span className="plan-text">
                          {it.text}{" "}
                          {it.location && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${it.location.lat},${it.location.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 12, whiteSpace: "nowrap" }}
                            >
                              📍 지도
                            </a>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })
      )}

      <div className="section-note" style={{ marginTop: 24, textAlign: "center" }}>
        나도 여행 계획을 세워볼까요? <Link to="/">여행 플래너 시작하기 →</Link>
      </div>
    </>
  );
}
