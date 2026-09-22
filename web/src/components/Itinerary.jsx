import { useEffect, useRef, useState } from "react";
import { fmtDate, mapUrl, splitItems } from "../lib/utils";

export default function Itinerary({ trip, dayIdx, setDayIdx, openModal, requestDelete, reorderDayItems }) {
  const days = trip.days || [];

  if (dayIdx !== null && dayIdx < days.length) {
    return (
      <DayDetail
        trip={trip}
        idx={dayIdx}
        setDayIdx={setDayIdx}
        openModal={openModal}
        requestDelete={requestDelete}
        reorderDayItems={reorderDayItems}
      />
    );
  }

  return (
    <section>
      <div className="section-head">
        <h2>일자별 일정</h2>
        <span className="btn-row">
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

function ItemBody({ trip, entry, dayIdx, openModal, requestDelete }) {
  const it = entry.it;
  return (
    <>
      <span className="plan-time">{it.time || ""}</span>
      <span className="plan-text">
        {it.text}{" "}
        {it.location ? (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => openModal({ type: "view-location", location: it.location, label: it.text })}
            style={{ fontSize: 12, whiteSpace: "nowrap", padding: 0, textDecoration: "underline", color: "var(--accent)" }}
          >
            📍 {it.location.address ? "지도" : "위치"}
          </button>
        ) : (
          <a href={mapUrl(it.text + " " + (trip.destination || ""))} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            🗺️ 지도
          </a>
        )}
      </span>
      <span className="plan-actions">
        <button className="btn-ghost btn-sm" onClick={() => openModal({ type: "edit-item", dayIdx, idx: entry.idx })}>수정</button>
        <button className="btn-ghost btn-sm btn-danger" onClick={() => requestDelete("delete-item", "이 항목을 삭제할까요?", { dayIdx, idx: entry.idx })}>삭제</button>
      </span>
    </>
  );
}

/** Drag-to-reorder list for items with no set time ("시간 미정" / label
 * items). Time-based items stay chronologically auto-sorted elsewhere, so
 * dragging only makes sense here where nothing else decides the order.
 * Reordering is done with Pointer Events (not native HTML5 drag-and-drop,
 * which iOS/Android browsers don't support for touch) so it works on phones. */
function ReorderableItemList({ trip, dayIdx, entries, openModal, requestDelete, onReorder }) {
  const [order, setOrder] = useState(entries.map((e) => e.idx));
  const [draggingIdx, setDraggingIdx] = useState(null);
  const rowRefs = useRef({});
  const dragRef = useRef(null);
  const byIdx = Object.fromEntries(entries.map((e) => [e.idx, e]));

  useEffect(() => {
    setOrder(entries.map((e) => e.idx));
  }, [entries.map((e) => e.idx).join(",")]);

  // Snapshot every other row's position once, at drag start, and compute the
  // target slot purely from the pointer's Y against that fixed snapshot —
  // recomputing against the live (already-reordered) DOM on every move was
  // order-dependent and produced a different result depending on how many
  // intermediate pointermove events fired for the same drag.
  function onPointerDown(e, originalIdx) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const others = order.filter((idx) => idx !== originalIdx);
    const rects = {};
    others.forEach((idx) => {
      const el = rowRefs.current[idx];
      if (el) rects[idx] = el.getBoundingClientRect();
    });
    dragRef.current = { originalIdx, others, rects, lastOrder: order, startY: e.clientY, active: false };
  }

  // A plain click (mouse button down+up with no real movement) still fires a
  // pointermove or two from ordinary mouse jitter — and the handle sits right
  // at the top edge of its row (flex-start aligned), practically on the
  // boundary with the row above, so without a threshold even that jitter was
  // enough to trigger a reorder. Require a few pixels of real movement first.
  function onPointerMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.active) {
      if (Math.abs(e.clientY - drag.startY) < 6) return;
      drag.active = true;
      setDraggingIdx(drag.originalIdx);
    }
    let newPos = 0;
    drag.others.forEach((idx) => {
      const rect = drag.rects[idx];
      if (!rect) return;
      if (e.clientY > rect.top + rect.height / 2) newPos += 1;
    });
    const newOrder = [...drag.others];
    newOrder.splice(newPos, 0, drag.originalIdx);
    drag.lastOrder = newOrder;
    setOrder(newOrder);
  }

  function onPointerUp() {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDraggingIdx(null);
    if (drag.active) onReorder(drag.lastOrder);
  }

  return (
    <ul className="plan-list">
      {order.map((originalIdx) => (
        <li
          key={originalIdx}
          ref={(el) => { rowRefs.current[originalIdx] = el; }}
          className={draggingIdx === originalIdx ? "dragging" : undefined}
        >
          <span
            className="drag-handle"
            onPointerDown={(e) => onPointerDown(e, originalIdx)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            ⠿
          </span>
          <ItemBody trip={trip} entry={byIdx[originalIdx]} dayIdx={dayIdx} openModal={openModal} requestDelete={requestDelete} />
        </li>
      ))}
    </ul>
  );
}

function DayDetail({ trip, idx, setDayIdx, openModal, requestDelete, reorderDayItems }) {
  const d = trip.days[idx];
  const cls = d.status === "confirmed" ? "confirmed" : "open";
  const { timeEntries, labelEntries } = splitItems(d.items);

  function handleReorderLabels(newOrder) {
    const slots = [...newOrder].sort((a, b) => a - b);
    const newItems = [...d.items];
    slots.forEach((slot, i) => { newItems[slot] = d.items[newOrder[i]]; });
    reorderDayItems(idx, newItems);
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
                ? timeEntries.map((e) => (
                    <li key={e.idx}>
                      <ItemBody trip={trip} entry={e} dayIdx={idx} openModal={openModal} requestDelete={requestDelete} />
                    </li>
                  ))
                : <li style={{ color: "var(--ink-soft)", fontStyle: "italic" }}>시간이 정해진 항목이 없어요.</li>}
            </ul>
          </div>
          {labelEntries.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="section-note" style={{ marginBottom: 10 }}>시간 미정 / 기타 · 드래그해서 순서 변경</div>
              <ReorderableItemList
                trip={trip}
                dayIdx={idx}
                entries={labelEntries}
                openModal={openModal}
                requestDelete={requestDelete}
                onReorder={handleReorderLabels}
              />
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
