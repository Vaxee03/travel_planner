import { useState } from "react";
import { itemKind } from "../lib/utils";
import MapPicker from "./MapPicker";

function Field({ name, label, type = "text", placeholder, required, defaultValue }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue} />
    </div>
  );
}

function Actions({ submitLabel, onClose }) {
  return (
    <div className="modal-actions">
      <button type="button" className="btn" onClick={onClose}>취소</button>
      <button type="submit" className="btn btn-primary">{submitLabel}</button>
    </div>
  );
}

function formValues(form) {
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

/** Renders the overlay + the right form for `modal.type`. Submits call
 * onSubmit(modal.type, values) so App.jsx can own all the write logic. */
export default function ModalHost({ modal, trip, onClose, onSubmit }) {
  if (!modal) return null;

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit(modal, formValues(e.target));
  }

  let content = null;

  if (modal.type === "confirm") {
    content = (
      <>
        <h3>확인</h3>
        <p style={{ margin: "0 0 4px" }}>{modal.message}</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
            onClick={() => onSubmit(modal, {})}
          >
            삭제
          </button>
        </div>
      </>
    );
  } else if (modal.type === "add-trip" || modal.type === "edit-trip") {
    const isEdit = modal.type === "edit-trip";
    const t = isEdit ? trip : {};
    content = (
      <form onSubmit={handleSubmit}>
        <h3>{isEdit ? "여행 정보 수정" : "새 여행 만들기"}</h3>
        <Field name="title" label="여행 이름" placeholder="예: 오사카 벚꽃 여행" required defaultValue={t.title} />
        <Field name="destination" label="목적지" placeholder="예: 오사카" defaultValue={t.destination} />
        <div className="field-row">
          <Field name="startDate" label="시작일" type="date" required defaultValue={t.startDate} />
          <Field name="endDate" label="종료일" type="date" required defaultValue={t.endDate} />
        </div>
        <div className="field-row">
          <Field name="travelers" label="인원 수" type="number" placeholder="예: 2" defaultValue={t.travelers || 1} />
          <Field name="budgetTotal" label="총 예산 (원)" type="number" placeholder="예: 1000000" defaultValue={t.budgetTotal} />
        </div>
        <Actions submitLabel={isEdit ? "저장" : "여행 만들기"} onClose={onClose} />
      </form>
    );
  } else if (modal.type === "add-day" || modal.type === "edit-day") {
    const isEdit = modal.type === "edit-day";
    const d = isEdit ? trip.days[modal.idx] : { date: "", status: "open", summary: "" };
    content = (
      <form onSubmit={handleSubmit}>
        <h3>{isEdit ? "날짜 수정" : "날짜 추가"}</h3>
        <Field name="date" label="날짜" type="date" required defaultValue={d.date} />
        <div className="field">
          <label>상태</label>
          <select name="status" defaultValue={d.status}>
            <option value="open">자유일정</option>
            <option value="confirmed">확정</option>
          </select>
        </div>
        <Field name="summary" label="한 줄 요약" placeholder="예: 아키하바라 관광 & 쇼핑" defaultValue={d.summary} />
        <Actions submitLabel={isEdit ? "저장" : "추가"} onClose={onClose} />
      </form>
    );
  } else if (modal.type === "add-item" || modal.type === "edit-item") {
    const isEdit = modal.type === "edit-item";
    const it = isEdit ? trip.days[modal.dayIdx].items[modal.idx] : { time: "", text: "" };
    content = <ItemForm isEdit={isEdit} it={it} onSubmit={handleSubmit} onClose={onClose} />;
  } else if (modal.type === "add-budget") {
    content = (
      <form onSubmit={handleSubmit}>
        <h3>지출 항목 추가</h3>
        <Field name="category" label="카테고리" placeholder="예: 숙박 / 교통 / 식비 / 쇼핑" required />
        <Field name="amount" label="금액 (원)" type="number" placeholder="예: 150000" required />
        <Field name="memo" label="메모" placeholder="선택" />
        <Actions submitLabel="추가" onClose={onClose} />
      </form>
    );
  } else if (modal.type === "add-check") {
    content = (
      <form onSubmit={handleSubmit}>
        <h3>준비물 추가</h3>
        <Field name="text" label="항목" placeholder="예: 온천용 수건" required />
        <Actions submitLabel="추가" onClose={onClose} />
      </form>
    );
  } else if (modal.type === "add-booking" || modal.type === "edit-booking") {
    const isEdit = modal.type === "edit-booking";
    const b = isEdit ? trip.bookings[modal.idx] : { type: "항공권", name: "", confirmNumber: "", link: "", memo: "" };
    content = (
      <form onSubmit={handleSubmit}>
        <h3>{isEdit ? "예약 정보 수정" : "예약 정보 추가"}</h3>
        <div className="field">
          <label>종류</label>
          <select name="type" defaultValue={b.type}>
            <option value="항공권">항공권</option>
            <option value="숙소">숙소</option>
            <option value="기타">기타</option>
          </select>
        </div>
        <Field name="name" label="이름" placeholder="예: 인천→나리타 KE001 / 스이메이소 호텔" required defaultValue={b.name} />
        <Field name="confirmNumber" label="예약번호" placeholder="예: ABC123" defaultValue={b.confirmNumber} />
        <Field name="link" label="링크" placeholder="예: 체크인/예약 확인 URL" defaultValue={b.link} />
        <Field name="memo" label="메모" placeholder="선택" defaultValue={b.memo} />
        <Actions submitLabel={isEdit ? "저장" : "추가"} onClose={onClose} />
      </form>
    );
  } else if (modal.type === "edit-review") {
    content = (
      <form onSubmit={handleSubmit}>
        <h3>여행 후기</h3>
        <div className="field">
          <label>후기</label>
          <textarea name="text" rows={7} placeholder="여행은 어땠나요?" defaultValue={trip.review?.text || ""} />
        </div>
        <Actions submitLabel="저장" onClose={onClose} />
      </form>
    );
  }

  const isWide = modal.type === "add-item" || modal.type === "edit-item";
  return (
    <div className="modal-overlay">
      <div className={"modal" + (isWide ? " modal-wide" : "")} onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}

function ItemForm({ isEdit, it, onSubmit, onClose }) {
  const initialKind = isEdit ? itemKind(it) : "time";
  const [kind, setKind] = useState(initialKind);
  return (
    <form onSubmit={onSubmit}>
      <h3>{isEdit ? "항목 수정" : "항목 추가"}</h3>
      <div className="field">
        <label>기준</label>
        <div className="btn-row" style={{ gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, color: "var(--ink)" }}>
            <input type="radio" name="kind" value="time" checked={kind === "time"} onChange={() => setKind("time")} /> 시간
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, color: "var(--ink)" }}>
            <input type="radio" name="kind" value="label" checked={kind === "label"} onChange={() => setKind("label")} /> 글자
          </label>
        </div>
      </div>
      {kind === "time" ? (
        <Field name="timeValue" label="시간" type="time" defaultValue={initialKind === "time" ? it.time : ""} />
      ) : (
        <Field name="labelValue" label="구분 글자" placeholder="예: 이동, 식사, 귀국" defaultValue={initialKind === "label" ? it.time : ""} />
      )}
      <Field name="text" label="내용" placeholder="예: 오와쿠다니 로프웨이" required defaultValue={it.text} />
      <ItemLocationField initial={it.location} />
      <Actions submitLabel={isEdit ? "저장" : "추가"} onClose={onClose} />
    </form>
  );
}

/** Lets the item form attach a picked map location. Stores it in a hidden
 * input so the surrounding <form> submit still captures it via FormData. */
function ItemLocationField({ initial }) {
  const [location, setLocation] = useState(initial || null);
  const [picking, setPicking] = useState(false);

  return (
    <div className="field">
      <label>위치 (선택)</label>
      {location ? (
        <div className="btn-row">
          <span className="location-chip">📍 {location.address || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}</span>
          <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>다시 찍기</button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => setLocation(null)}>제거</button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>📍 지도에서 위치 찍기</button>
      )}
      <input type="hidden" name="locationJson" value={location ? JSON.stringify(location) : ""} />
      {picking && (
        <div className="modal-overlay" onClick={() => setPicking(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>위치 찍기</h3>
            <MapPicker
              initialLocation={location}
              onClose={() => setPicking(false)}
              onPick={(loc) => { setLocation(loc); setPicking(false); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
