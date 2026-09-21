export default function Checklist({ trip, openModal, requestDelete, toggleCheck }) {
  const items = trip.checklist || [];
  return (
    <section>
      <div className="section-head">
        <h2>준비물 체크리스트</h2>
        <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: "add-check" })}>+ 항목 추가</button>
      </div>
      {items.length === 0 ? (
        <div className="empty">아직 등록된 준비물이 없어요.</div>
      ) : (
        <div className="checklist">
          {items.map((it, idx) => (
            <div className={"check-item" + (it.done ? " done" : "")} key={idx}>
              <button className="box-btn" onClick={() => toggleCheck(idx)}>
                <span className="box">{it.done ? "✓" : ""}</span>
              </button>
              <span className="check-text">{it.text}</span>
              <button className="btn-ghost btn-sm btn-danger" onClick={() => requestDelete("delete-check", "이 항목을 삭제할까요?", { idx })}>삭제</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
