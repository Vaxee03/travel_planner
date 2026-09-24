import { useNicknames } from "../lib/useNicknames";
import { checklistItemId } from "../lib/utils";

export default function Checklist({ trip, openModal, requestDelete, toggleCheck, canEdit }) {
  const items = trip.checklist || [];
  const nicknames = useNicknames(items.map((it) => it.assignedTo));
  return (
    <section>
      <div className="section-head">
        <h2>준비물 체크리스트</h2>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: "add-check" })}>+ 항목 추가</button>}
      </div>
      {items.length === 0 ? (
        <div className="empty">아직 등록된 준비물이 없어요.</div>
      ) : (
        <div className="checklist">
          {items.map((it, idx) => {
            const done = trip.checklistDone?.[checklistItemId(it, idx)] ?? it.done ?? false;
            return (
              <div className={"check-item" + (done ? " done" : "")} key={checklistItemId(it, idx)}>
                <button className="box-btn" onClick={() => toggleCheck(idx)}>
                  <span className="box">{done ? "✓" : ""}</span>
                </button>
                <span className="check-text">{it.text}</span>
                {it.assignedTo && (
                  <span className="section-note" style={{ flexShrink: 0 }}>👤 {nicknames[it.assignedTo] || "이름 없는 동행자"}</span>
                )}
                {canEdit && (
                  <button className="btn-ghost btn-sm btn-danger" onClick={() => requestDelete("delete-check", "이 항목을 삭제할까요?", { idx })}>삭제</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
