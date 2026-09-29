import { useEffect, useRef, useState } from "react";
import { fmtDate, mapUrl, outsideTrip, routeStops, splitItems, stableStringify } from "../lib/utils";
import { mutateTrip } from "../lib/tripsApi";

export default function Itinerary({ trip, dayIdx, setDayIdx, openModal, requestDelete, reorderDayItems, canEdit }) {
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
        canEdit={canEdit}
      />
    );
  }

  return (
    <>
      <section>
        <div className="section-head">
          <h2>일자별 일정</h2>
          {canEdit && (
            <span className="btn-row">
              <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: "add-day" })}>+ 날짜 추가</button>
            </span>
          )}
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
                      <span className="btn-row" style={{ gap: 6 }}>
                        {outsideTrip(trip, d.date) && <span className="status open" style={{ color: "var(--danger)" }} title="여행 기간 밖의 날짜예요">기간 밖</span>}
                        <span className={"status " + cls}>{cls === "confirmed" ? "확정" : "자유일정"}</span>
                      </span>
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

      <ItineraryMemo trip={trip} canEdit={canEdit} />
    </>
  );
}

/** A free-form scratchpad for the whole trip (packing ideas, things to check,
 * changes to remember) — shared by every member, autosaved on blur so it
 * doesn't need its own save button. Read-only for members without itinerary
 * permission (same gate as the rest of this tab). */
function ItineraryMemo({ trip, canEdit }) {
  const [text, setText] = useState(trip.itineraryMemo || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedAt, setSavedAt] = useState(0);
  // "저장됨 ✓" shows for a couple of seconds after each save.
  useEffect(() => {
    if (!savedAt) return undefined;
    const t = setTimeout(() => setSavedAt(0), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) setText(trip.itineraryMemo || "");
  }, [trip.itineraryMemo]);

  async function handleBlur() {
    if (text === (trip.itineraryMemo || "")) { dirtyRef.current = false; return; }
    setSaving(true);
    setSaveError(null);
    try {
      await mutateTrip(trip.id, (t) => { t.itineraryMemo = text; });
      dirtyRef.current = false;
      setSavedAt(Date.now());
    } catch {
      // Keep the typed text (still marked dirty, so incoming updates don't
      // overwrite it); leaving the box again retries.
      setSaveError("메모를 저장하지 못했어요. 인터넷 연결을 확인한 뒤 메모 칸을 한 번 눌렀다가 빠져나오면 다시 저장해요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ marginTop: 28 }}>
      <div className="section-head">
        <h2>📝 메모</h2>
        {saving ? <span className="section-note">저장 중…</span>
          : savedAt ? <span className="section-note" style={{ color: "var(--confirmed)" }}>저장됨 ✓</span>
          : canEdit ? <span className="section-note">입력을 마치면 자동으로 저장돼요</span> : null}
      </div>
      {saveError && <div className="note" style={{ marginTop: 0, marginBottom: 10 }}><span className="dot" /><span>{saveError}</span></div>}
      <textarea
        className="itinerary-memo"
        rows={9}
        placeholder="자유롭게 메모를 남겨보세요 (준비물, 아이디어, 변경사항 등)"
        value={text}
        disabled={!canEdit}
        onChange={(e) => { dirtyRef.current = true; setText(e.target.value); }}
        onBlur={handleBlur}
      />
    </section>
  );
}

function ItemBody({ trip, entry, dayIdx, openModal, requestDelete, canEdit }) {
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
      {canEdit && (
        <span className="plan-actions">
          <button className="btn-ghost btn-sm" onClick={() => openModal({ type: "edit-item", dayIdx, idx: entry.idx })}>수정</button>
          <button className="btn-ghost btn-sm btn-danger" onClick={() => requestDelete("delete-item", "이 항목을 삭제할까요?", { dayIdx, idx: entry.idx })}>삭제</button>
        </span>
      )}
    </>
  );
}

/** Drag-to-reorder list for items with no set time ("시간 미정" / label
 * items). Time-based items stay chronologically auto-sorted elsewhere, so
 * dragging only makes sense here where nothing else decides the order.
 * Reordering is done with Pointer Events (not native HTML5 drag-and-drop,
 * which iOS/Android browsers don't support for touch) so it works on phones. */
function ReorderableItemList({ trip, dayIdx, entries, openModal, requestDelete, onReorder, canEdit }) {
  const [draggingIdx, setDraggingIdx] = useState(null);
  const rowRefs = useRef({});
  const dragRef = useRef(null);
  const byIdx = Object.fromEntries(entries.map((e) => [e.idx, e]));

  // The list is normally drawn straight from the data. A locally dragged
  // order is shown only while it still applies to exactly the data it was
  // made from (same items at the same positions): during the drag, and after
  // the drop until the saved reorder comes back. Any change to the items —
  // the saved reorder itself, or an add/delete/edit from anyone — drops it,
  // so the screen can never show a stale order or point at a removed item.
  const signature = entries.map((e) => `${e.idx}:${stableStringify(e.it)}`).join("|");
  const [local, setLocal] = useState(null); // { order, signature }
  const dataOrder = entries.map((e) => e.idx);
  const order = local && local.signature === signature ? local.order : dataOrder;
  const setOrder = (next) => setLocal({ order: next, signature });

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
    if (!drag.active) return;
    // If the save is refused (someone changed this day meanwhile), go back to
    // showing the data's order right away.
    Promise.resolve(onReorder(drag.lastOrder)).then((ok) => { if (ok === false) setLocal(null); });
  }

  return (
    <ul className="plan-list">
      {order.map((originalIdx) => (
        <li
          key={originalIdx}
          ref={(el) => { rowRefs.current[originalIdx] = el; }}
          className={draggingIdx === originalIdx ? "dragging" : undefined}
        >
          {canEdit && (
            <span
              className="drag-handle"
              onPointerDown={(e) => onPointerDown(e, originalIdx)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              ⠿
            </span>
          )}
          <ItemBody trip={trip} entry={byIdx[originalIdx]} dayIdx={dayIdx} openModal={openModal} requestDelete={requestDelete} canEdit={canEdit} />
        </li>
      ))}
    </ul>
  );
}

function DayDetail({ trip, idx, setDayIdx, openModal, requestDelete, reorderDayItems, canEdit }) {
  const d = trip.days[idx];
  const cls = d.status === "confirmed" ? "confirmed" : "open";
  const { timeEntries, labelEntries } = splitItems(d.items);

  function handleReorderLabels(newOrder) {
    const slots = [...newOrder].sort((a, b) => a - b);
    const newItems = [...d.items];
    slots.forEach((slot, i) => { newItems[slot] = d.items[newOrder[i]]; });
    return reorderDayItems(idx, newItems);
  }

  return (
    <div>
      <button className="back-link" onClick={() => setDayIdx(null)}>← 일정 목록으로</button>
      <div className="detail-head">
        <h2>{fmtDate(d.date)}</h2>
        <div className="btn-row">
          <span className={"status " + cls}>{cls === "confirmed" ? "확정" : "자유일정"}</span>
          {canEdit && (
            <>
              <button className="btn btn-sm" onClick={() => openModal({ type: "edit-day", idx })}>날짜 수정</button>
              <button className="btn btn-sm btn-danger" onClick={() => requestDelete("delete-day", "이 날짜를 삭제할까요?", { idx })}>삭제</button>
            </>
          )}
        </div>
      </div>
      <div className="detail-sub">{d.summary || "세부 계획 미정"}</div>
      {routeStops(d).length > 0 && (
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button className="btn btn-sm" onClick={() => openModal({ type: "view-route", dayIdx: idx })}>🗺 동선 보기</button>
        </div>
      )}

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
                      <ItemBody trip={trip} entry={e} dayIdx={idx} openModal={openModal} requestDelete={requestDelete} canEdit={canEdit} />
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
                canEdit={canEdit}
              />
            </div>
          )}
        </>
      )}
      {canEdit && (
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn btn-sm" onClick={() => openModal({ type: "add-item", dayIdx: idx })}>+ 항목 추가</button>
        </div>
      )}
    </div>
  );
}
