import { fmtDate, mapUrl, splitItems, buildItineraryText, buildItineraryImageBlob, saveBlobAsFile } from "../lib/utils";

export default function Itinerary({ trip, dayIdx, setDayIdx, openModal, requestDelete }) {
  const days = trip.days || [];

  if (dayIdx !== null && dayIdx < days.length) {
    return <DayDetail trip={trip} idx={dayIdx} setDayIdx={setDayIdx} openModal={openModal} requestDelete={requestDelete} />;
  }

  async function handleExport(kind) {
    if (kind === "text") {
      saveBlobAsFile(`${trip.title} 일정.txt`, buildItineraryText(trip));
    } else {
      const blob = await buildItineraryImageBlob(trip);
      saveBlobAsFile(`${trip.title} 일정.png`, blob);
    }
  }

  return (
    <section>
      <div className="section-head">
        <h2>일자별 일정</h2>
        <span className="btn-row">
          <button className="btn btn-sm" onClick={() => handleExport("text")}>📄 텍스트로 내보내기</button>
          <button className="btn btn-sm" onClick={() => handleExport("image")}>🖼️ 이미지로 내보내기</button>
          <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: "add-day" })}>+ 날짜 추가</button>
        </span>
      </div>

      {days.length === 0 ? (
        <div className="empty">아직 일정이 없어요. "날짜 추가"로 첫 날짜를 만들어보세요.</div>
      ) : (
        <div className="timeline">
          {days.map((d, idx) => {
            const cls = d.status === "confirmed" ? "confirmed" : "open";
            return (
              <div className={"day " + cls} key={idx}>
                <button className="day-summary" onClick={() => setDayIdx(idx)}>
                  <div className="day-top">
                    <div className="day-title"><span className="day-date nums">{fmtDate(d.date)}</span></div>
                    <span className={"status " + cls}>{cls === "confirmed" ? "확정" : "자유일정"}</span>
                  </div>
                  <div className="day-summary-body">
                    <span className={"day-summary-text" + (d.summary ? "" : " muted")}>{d.summary || "세부 계획 미정"}</span>
                    <span className="day-arrow">자세히 →</span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DayDetail({ trip, idx, setDayIdx, openModal, requestDelete }) {
  const d = trip.days[idx];
  const cls = d.status === "confirmed" ? "confirmed" : "open";
  const { timeEntries, labelEntries } = splitItems(d.items);

  function ItemLi({ entry }) {
    const it = entry.it;
    return (
      <li>
        <span className="plan-time">{it.time || ""}</span>
        <span className="plan-text">
          {it.text}{" "}
          {it.location ? (
            <a href={`https://www.google.com/maps/search/?api=1&query=${it.location.lat},${it.location.lng}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
              📍 {it.location.address ? "지도" : "위치"}
            </a>
          ) : (
            <a href={mapUrl(it.text + " " + (trip.destination || ""))} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
              🗺️ 지도
            </a>
          )}
        </span>
        <span className="plan-actions">
          <button className="btn-ghost btn-sm" onClick={() => openModal({ type: "edit-item", dayIdx: idx, idx: entry.idx })}>수정</button>
          <button className="btn-ghost btn-sm btn-danger" onClick={() => requestDelete("delete-item", "이 항목을 삭제할까요?", { dayIdx: idx, idx: entry.idx })}>삭제</button>
        </span>
      </li>
    );
  }

  return (
    <div>
      <button className="back-link" onClick={() => setDayIdx(null)}>← 일정 목록으로</button>
      <div className="detail-head">
        <h2>{fmtDate(d.date)}</h2>
        <div className="btn-row">
          <span className={"status " + cls}>{cls === "confirmed" ? "확정" : "자유일정"}</span>
          <button className="btn btn-sm" onClick={() => openModal({ type: "edit-day", idx })}>날짜 수정</button>
          <button className="btn btn-sm btn-danger" onClick={() => requestDelete("delete-day", "이 날짜를 삭제할까요?", { idx })}>삭제</button>
        </div>
      </div>
      <div className="detail-sub">{d.summary || "세부 계획 미정"}</div>

      {(d.items || []).length === 0 ? (
        <div className="card" style={{ color: "var(--ink-soft)", fontStyle: "italic" }}>아직 등록된 세부 항목이 없어요.</div>
      ) : (
        <>
          <div className="card">
            <div className="section-note" style={{ marginBottom: 10 }}>타임라인</div>
            <ul className="plan-list">
              {timeEntries.length
                ? timeEntries.map((e) => <ItemLi entry={e} key={e.idx} />)
                : <li style={{ color: "var(--ink-soft)", fontStyle: "italic" }}>시간이 정해진 항목이 없어요.</li>}
            </ul>
          </div>
          {labelEntries.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="section-note" style={{ marginBottom: 10 }}>시간 미정 / 기타</div>
              <ul className="plan-list">
                {labelEntries.map((e) => <ItemLi entry={e} key={e.idx} />)}
              </ul>
            </div>
          )}
        </>
      )}
      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn btn-sm" onClick={() => openModal({ type: "add-item", dayIdx: idx })}>+ 항목 추가</button>
      </div>
    </div>
  );
}
