import { useEffect, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import { itemKind } from "../lib/utils";
import { MAPS_LOADER_OPTIONS } from "../lib/mapsLoader";
import { fetchCitySuggestions, INTERNATIONAL_REGION_CODES } from "../lib/placeSearch";
import { EXTRA_INTERNATIONAL_DESTINATIONS } from "../lib/extraDestinations";
import MapPicker from "./MapPicker";
import InviteCard from "./InviteCard";
import LocationViewer from "./LocationViewer";
import { useNicknames } from "../lib/useNicknames";
import { DEFAULT_NICKNAME } from "../lib/users";
import { PERMISSION_CATEGORIES } from "../lib/permissions";

function Field({ name, label, type = "text", placeholder, required, defaultValue, min }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue} min={min} />
    </div>
  );
}

/** Optional "담당자" picker — only rendered when there's actually more than
 * one member to assign to, since a solo trip has no one to tag. Left
 * unselected by default; the checklist item only ever shows a nickname tag
 * when someone explicitly picks a name here. */
function AssigneeField({ trip }) {
  const memberIds = trip?.memberIds || [];
  const nicknames = useNicknames(memberIds);
  if (memberIds.length <= 1) return null;
  return (
    <div className="field">
      <label>담당자 (선택)</label>
      <select name="assignedTo" defaultValue="">
        <option value="">선택 안 함</option>
        {memberIds.map((uid) => (
          <option key={uid} value={uid}>{nicknames[uid] || DEFAULT_NICKNAME}</option>
        ))}
      </select>
    </div>
  );
}

/** 방장 only — lets them grant individual permission categories to each
 * other member. Checkbox names are perm_<uid>_<category>; App.jsx's
 * handleModalSubmit reconstructs the memberPermissions map from whichever
 * ones came back checked in the submitted FormData. */
function PermissionsForm({ trip, onSubmit, onClose }) {
  const memberIds = (trip?.memberIds || []).filter((uid) => uid !== trip?.ownerId);
  const nicknames = useNicknames(memberIds);
  const current = trip?.memberPermissions || {};

  return (
    <form onSubmit={onSubmit} noValidate>
      <h3>권한 관리</h3>
      <p style={{ margin: "0 0 16px", color: "var(--ink-soft)", fontSize: 13.5 }}>
        방장 외 동행자는 기본적으로 체크리스트 체크, 맛집 추천, 후기 작성만 가능해요. 아래에서 동행자별로 추가 권한을 열어줄 수 있어요.
      </p>
      {memberIds.length === 0 ? (
        <div className="empty">아직 방장 외 동행자가 없어요.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {memberIds.map((uid) => {
            const granted = current[uid] || [];
            return (
              <div className="card" key={uid}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{nicknames[uid] || DEFAULT_NICKNAME}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {PERMISSION_CATEGORIES.map((c) => (
                    <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, color: "var(--ink)" }}>
                      <input type="checkbox" name={`perm_${uid}_${c.key}`} defaultChecked={granted.includes(c.key)} style={{ width: "auto", flexShrink: 0 }} />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Actions submitLabel="저장" onClose={onClose} />
    </form>
  );
}

/** 방장 only — hands ownerId to another member. The outgoing 방장 immediately
 * drops to a regular member (no permission category is auto-granted to
 * them), so they keep only the baseline actions until the new 방장 grants
 * more via 권한 관리. */
function TransferOwnershipForm({ trip, onSubmit, onClose }) {
  const memberIds = (trip?.memberIds || []).filter((uid) => uid !== trip?.ownerId);
  const nicknames = useNicknames(memberIds);

  return (
    <form onSubmit={onSubmit} noValidate>
      <h3>방장 위임</h3>
      <p style={{ margin: "0 0 16px", color: "var(--ink-soft)", fontSize: 13.5 }}>
        선택한 동행자가 새 방장이 되고, 나는 일반 동행자가 돼요(권한 관리는 새 방장이 다시 해줘야 해요). 되돌릴 수 없으니 신중하게 선택해주세요.
      </p>
      {memberIds.length === 0 ? (
        <div className="empty">위임할 동행자가 없어요.</div>
      ) : (
        <div className="field">
          <label>새 방장</label>
          <select name="newOwnerId" defaultValue={memberIds[0]}>
            {memberIds.map((uid) => (
              <option key={uid} value={uid}>{nicknames[uid] || DEFAULT_NICKNAME}</option>
            ))}
          </select>
        </div>
      )}
      <Actions submitLabel="위임" onClose={onClose} />
    </form>
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

/** A form's own required/min/type constraints are checked silently via
 * checkValidity() and reported through this box instead of the browser's
 * native validation bubble, so every "필수 항목" error looks the same. */
function FormNote({ message }) {
  if (!message) return null;
  return (
    <div className="note" style={{ marginTop: -4, marginBottom: 12 }}>
      <span className="dot" />
      <span>{message}</span>
    </div>
  );
}

/** Renders the overlay + the right form for `modal.type`. Submits call
 * onSubmit(modal.type, values) so App.jsx can own all the write logic. */
export default function ModalHost({ modal, trip, onClose, onSubmit }) {
  const [formError, setFormError] = useState(null);
  useEffect(() => { setFormError(null); }, [modal]);

  if (!modal) return null;

  function handleSubmit(e) {
    e.preventDefault();
    if (!e.target.checkValidity()) {
      setFormError("모든 필수 항목을 입력해주세요.");
      return;
    }
    setFormError(null);
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
    content = <TripForm isEdit={isEdit} t={t} onSubmit={handleSubmit} onClose={onClose} />;
  } else if (modal.type === "add-day" || modal.type === "edit-day") {
    const isEdit = modal.type === "edit-day";
    const d = isEdit ? trip.days[modal.idx] : { date: "", status: "open", summary: "" };
    content = (
      <form onSubmit={handleSubmit} noValidate>
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
        <FormNote message={formError} />
        <Actions submitLabel={isEdit ? "저장" : "추가"} onClose={onClose} />
      </form>
    );
  } else if (modal.type === "add-item" || modal.type === "edit-item") {
    const isEdit = modal.type === "edit-item";
    const it = isEdit ? trip.days[modal.dayIdx].items[modal.idx] : { time: "", text: "" };
    content = <ItemForm isEdit={isEdit} it={it} destination={trip.destination} onSubmit={handleSubmit} onClose={onClose} />;
  } else if (modal.type === "add-budget") {
    content = (
      <form onSubmit={handleSubmit} noValidate>
        <h3>지출 항목 추가</h3>
        <Field name="category" label="카테고리" placeholder="예: 숙박 / 교통 / 식비 / 쇼핑" required />
        <Field name="amount" label="금액 (원)" type="number" placeholder="예: 150000" required />
        <Field name="memo" label="메모" placeholder="선택" />
        <FormNote message={formError} />
        <Actions submitLabel="추가" onClose={onClose} />
      </form>
    );
  } else if (modal.type === "add-check") {
    content = (
      <form onSubmit={handleSubmit} noValidate>
        <h3>준비물 추가</h3>
        <Field name="text" label="항목" placeholder="예: 온천용 수건" required />
        <AssigneeField trip={trip} />
        <FormNote message={formError} />
        <Actions submitLabel="추가" onClose={onClose} />
      </form>
    );
  } else if (modal.type === "add-booking" || modal.type === "edit-booking") {
    const isEdit = modal.type === "edit-booking";
    const isDomestic = trip.tripType === "domestic";
    const b = isEdit ? trip.bookings[modal.idx] : { type: isDomestic ? "교통" : "항공권", name: "", confirmNumber: "", link: "", memo: "" };
    content = (
      <form onSubmit={handleSubmit} noValidate>
        <h3>{isEdit ? "예약 정보 수정" : "예약 정보 추가"}</h3>
        <div className="field">
          <label>종류</label>
          <select name="type" defaultValue={b.type}>
            {isDomestic ? <option value="교통">교통</option> : <option value="항공권">항공권</option>}
            <option value="숙소">숙소</option>
            <option value="기타">기타</option>
          </select>
        </div>
        <Field name="name" label="이름" placeholder={isDomestic ? "예: KTX 부산행 / OO 호텔" : "예: 인천→나리타 KE001 / 스이메이소 호텔"} required defaultValue={b.name} />
        <Field name="confirmNumber" label="예약번호" placeholder="예: ABC123" defaultValue={b.confirmNumber} />
        <Field name="link" label="링크" placeholder="예: 체크인/예약 확인 URL" defaultValue={b.link} />
        <Field name="memo" label="메모" placeholder="선택" defaultValue={b.memo} />
        <FormNote message={formError} />
        <Actions submitLabel={isEdit ? "저장" : "추가"} onClose={onClose} />
      </form>
    );
  } else if (modal.type === "invite") {
    content = <InviteCard trip={trip} onClose={onClose} />;
  } else if (modal.type === "manage-permissions") {
    content = <PermissionsForm trip={trip} onSubmit={handleSubmit} onClose={onClose} />;
  } else if (modal.type === "transfer-ownership") {
    content = <TransferOwnershipForm trip={trip} onSubmit={handleSubmit} onClose={onClose} />;
  } else if (modal.type === "view-location") {
    content = <LocationViewer location={modal.location} label={modal.label} onClose={onClose} />;
  } else if (modal.type === "set-nickname" || modal.type === "edit-nickname") {
    const isEdit = modal.type === "edit-nickname";
    content = (
      <form onSubmit={handleSubmit} noValidate>
        <h3>{isEdit ? "닉네임 수정" : "닉네임을 설정해주세요"}</h3>
        {!isEdit && <p style={{ margin: "0 0 14px", color: "var(--ink-soft)", fontSize: 13.5 }}>동행자들에게 보여질 이름이에요. 마음에 안 들면 자유롭게 바꾸고, 나중에 언제든 다시 바꿀 수 있어요.</p>}
        <Field name="nickname" label="닉네임" placeholder="예: 여행러버" defaultValue={isEdit ? (modal.currentNickname || "") : modal.suggested || ""} />
        <FormNote message={formError} />
        {isEdit ? (
          <Actions submitLabel="저장" onClose={onClose} />
        ) : (
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => onSubmit(modal, { nickname: modal.suggested || "" })}>나중에 하기</button>
            <button type="submit" className="btn btn-primary">저장</button>
          </div>
        )}
      </form>
    );
  } else if (modal.type === "edit-review") {
    const myPost = (trip.reviews || []).find((r) => r.authorId === modal.uid);
    content = (
      <form onSubmit={handleSubmit}>
        <h3>내 여행 후기</h3>
        <div className="field">
          <label>후기</label>
          <textarea name="text" rows={7} placeholder="여행은 어땠나요?" defaultValue={myPost?.text || ""} />
        </div>
        <Actions submitLabel="저장" onClose={onClose} />
      </form>
    );
  }

  const isWide = modal.type === "add-item" || modal.type === "edit-item" || modal.type === "invite" || modal.type === "view-location" || modal.type === "manage-permissions";
  return (
    <div className="modal-overlay">
      <div className={"modal" + (isWide ? " modal-wide" : "")} onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}

function TripForm({ isEdit, t, onSubmit, onClose }) {
  const [startDate, setStartDate] = useState(t.startDate || "");
  const [endDate, setEndDate] = useState(t.endDate || "");
  const [tripType, setTripType] = useState(t.tripType || "international");
  const [error, setError] = useState(null);

  function handleSubmit(e) {
    if (startDate && endDate && endDate < startDate) {
      e.preventDefault();
      setError("종료일은 시작일보다 빠를 수 없어요.");
      return;
    }
    const travelers = Number(new FormData(e.target).get("travelers"));
    if (!travelers || travelers < 1) {
      e.preventDefault();
      setError("인원 수는 1명 이상이어야 해요.");
      return;
    }
    if (!e.target.checkValidity()) {
      e.preventDefault();
      setError("모든 필수 항목을 입력해주세요.");
      return;
    }
    setError(null);
    onSubmit(e);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h3>{isEdit ? "여행 정보 수정" : "새 여행 만들기"}</h3>
      <div className="field">
        <label>여행 유형</label>
        <div className="btn-row" style={{ gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, color: "var(--ink)", whiteSpace: "nowrap" }}>
            <input type="radio" name="tripType" value="domestic" checked={tripType === "domestic"} onChange={() => setTripType("domestic")} style={{ width: "auto", flexShrink: 0 }} /> 국내
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, color: "var(--ink)", whiteSpace: "nowrap" }}>
            <input type="radio" name="tripType" value="international" checked={tripType === "international"} onChange={() => setTripType("international")} style={{ width: "auto", flexShrink: 0 }} /> 해외
          </label>
        </div>
      </div>
      <Field name="title" label="여행 이름" placeholder={tripType === "domestic" ? "예: 부산 여행" : "예: 오사카 벚꽃 여행"} required defaultValue={t.title} />
      <DestinationField tripType={tripType} defaultValue={t.destination} />
      <div className="field-row">
        <div className="field">
          <label>시작일</label>
          <input name="startDate" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label>종료일</label>
          <input name="endDate" type="date" required value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <Field name="travelers" label="인원 수" type="number" placeholder="예: 2" min={1} required defaultValue={t.travelers || 1} />
        <Field name="budgetTotal" label="총 예산 (원)" type="number" placeholder="예: 1000000" defaultValue={t.budgetTotal} />
      </div>
      <FormNote message={error} />
      <Actions submitLabel={isEdit ? "저장" : "여행 만들기"} onClose={onClose} />
    </form>
  );
}

/** Destination as search-and-pick, backed by the New Places API (same one
 * MapPicker uses) plus a small curated fallback list for countries outside
 * its 15-country allowlist — between the two, nearly every real destination
 * is now covered, so free-text entry is intentionally NOT allowed here
 * anymore: a hand-typed destination could name a place outside what the
 * selected 여행 유형(국내/해외) actually searches (e.g. typing "오사카" on a
 * 국내 trip), which broke the map search bias and the restaurant AI's
 * region restriction. Only an actual pick from the dropdown is accepted;
 * an unconfirmed typed value snaps back to the last real selection on blur. */
function DestinationField({ tripType, defaultValue }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey || "", ...MAPS_LOADER_OPTIONS });
  const [query, setQuery] = useState(defaultValue || "");
  const [selected, setSelected] = useState(defaultValue || "");
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const skipNextFetchRef = useRef(false);
  const prevTripTypeRef = useRef(tripType);

  // Domestic vs international search completely different regions, so a
  // destination picked under one no longer makes sense after switching —
  // clear it rather than silently keeping a now-mismatched value.
  useEffect(() => {
    if (prevTripTypeRef.current === tripType) return;
    prevTripTypeRef.current = tripType;
    setQuery("");
    setSelected("");
    setSuggestions([]);
  }, [tripType]);

  useEffect(() => {
    if (skipNextFetchRef.current) { skipNextFetchRef.current = false; return; }
    if (!isLoaded) return;
    clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      let apiResults = [];
      try {
        const regionCodes = tripType === "domestic" ? ["kr"] : INTERNATIONAL_REGION_CODES;
        apiResults = await fetchCitySuggestions(q, { regionCodes });
      } catch {
        apiResults = [];
      }
      if (tripType === "domestic") {
        setSuggestions(apiResults);
        return;
      }
      const seen = new Set(apiResults.map((r) => `${r.city}|${r.sub}`));
      const extraResults = EXTRA_INTERNATIONAL_DESTINATIONS.flatMap((g) =>
        g.cities
          .filter((city) => city.includes(q) && !seen.has(`${city}|${g.country}`))
          .map((city) => ({ city, sub: g.country }))
      );
      setSuggestions([...apiResults, ...extraResults]);
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query, isLoaded, tripType]);

  function pick(s) {
    skipNextFetchRef.current = true;
    // Keep the country/region alongside the city (not just the bare name) so
    // downstream consumers (map search bias, the restaurant AI prompt) get
    // enough context to disambiguate same-named cities elsewhere in the world.
    const value = s.sub ? `${s.city}, ${s.sub}` : s.city;
    setQuery(value);
    setSelected(value);
    setSuggestions([]);
    setOpen(false);
  }

  function handleBlur() {
    setOpen(false);
    const trimmed = query.trim();
    if (!trimmed) { setSelected(""); return; }
    // Anything left in the box that wasn't actually picked from the list
    // isn't a valid destination anymore — revert instead of saving free text.
    if (trimmed !== selected) setQuery(selected);
  }

  return (
    <div className="field" style={{ position: "relative" }}>
      <label>목적지</label>
      <input
        name="destination"
        placeholder={tripType === "domestic" ? "예: 부산 (검색해서 목록에서 선택)" : "예: 오사카 (검색해서 목록에서 선택)"}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30,
            marginTop: 4, background: "var(--surface)",
            border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,.25)",
          }}
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.city}-${i}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              style={{
                display: "block", width: "100%", textAlign: "left", background: "none",
                border: "none", borderBottom: i < suggestions.length - 1 ? "1px solid var(--line)" : "none",
                padding: "10px 12px", cursor: "pointer", color: "var(--ink)", font: "inherit",
              }}
            >
              <div>{s.city}</div>
              {s.sub && <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{s.sub}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemForm({ isEdit, it, destination, onSubmit, onClose }) {
  const initialKind = isEdit ? itemKind(it) : "time";
  const [kind, setKind] = useState(initialKind);
  const [error, setError] = useState(null);

  function handleSubmit(e) {
    if (!e.target.checkValidity()) {
      e.preventDefault();
      setError("모든 필수 항목을 입력해주세요.");
      return;
    }
    setError(null);
    onSubmit(e);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h3>{isEdit ? "항목 수정" : "항목 추가"}</h3>
      <div className="field">
        <label>유형</label>
        <div className="btn-row" style={{ gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, color: "var(--ink)", whiteSpace: "nowrap" }}>
            <input type="radio" name="kind" value="time" checked={kind === "time"} onChange={() => setKind("time")} style={{ width: "auto", flexShrink: 0 }} /> 시간
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, color: "var(--ink)", whiteSpace: "nowrap" }}>
            <input type="radio" name="kind" value="label" checked={kind === "label"} onChange={() => setKind("label")} style={{ width: "auto", flexShrink: 0 }} /> 텍스트
          </label>
        </div>
      </div>
      {kind === "time" ? (
        <Field name="timeValue" label="시간" type="time" defaultValue={initialKind === "time" ? it.time : ""} />
      ) : (
        <Field name="labelValue" label="구분 텍스트" placeholder="예: 이동, 식사, 귀국" defaultValue={initialKind === "label" ? it.time : ""} />
      )}
      <Field name="text" label="내용" placeholder="예: 오와쿠다니 로프웨이" required defaultValue={it.text} />
      <ItemLocationField initial={it.location} destination={destination} />
      <FormNote message={error} />
      <Actions submitLabel={isEdit ? "저장" : "추가"} onClose={onClose} />
    </form>
  );
}

/** Lets the item form attach a picked map location. Stores it in a hidden
 * input so the surrounding <form> submit still captures it via FormData. */
function ItemLocationField({ initial, destination }) {
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
              destination={destination}
              onClose={() => setPicking(false)}
              onPick={(loc) => { setLocation(loc); setPicking(false); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
