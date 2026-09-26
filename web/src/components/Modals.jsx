import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useJsApiLoader } from "@react-google-maps/api";
import { fmtDate, itemKind } from "../lib/utils";
import { MAPS_LOADER_OPTIONS } from "../lib/mapsLoader";
import { fetchCitySuggestions, findPlaceLocation, INTERNATIONAL_REGION_CODES } from "../lib/placeSearch";
import { EXTRA_INTERNATIONAL_DESTINATIONS } from "../lib/extraDestinations";
import MapPicker from "./MapPicker";
import InviteCard from "./InviteCard";
import LocationViewer from "./LocationViewer";
import RouteMapViewer from "./RouteMapViewer";
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

/** 정산 inputs for a budget item: who paid and who splits it. Hidden on a
 * solo trip. A new item defaults to "I paid, everyone splits"; an existing
 * item without a payer (from before 정산 existed) starts on "미지정" so
 * editing its amount doesn't silently assign it to whoever opened the form. */
function SplitFields({ trip, item, uid }) {
  const memberIds = trip?.memberIds || [];
  const nicknames = useNicknames(memberIds);
  if (memberIds.length <= 1) return null;
  const paidBy = item ? item.paidBy || "" : uid;
  const splitAmong = item?.splitAmong?.length ? item.splitAmong : memberIds;
  const checkboxLabel = { display: "flex", alignItems: "center", gap: 6, fontWeight: 400, color: "var(--ink)", whiteSpace: "nowrap" };
  return (
    <>
      <div className="field">
        <label>결제한 사람 (정산용)</label>
        <select name="paidBy" defaultValue={paidBy}>
          <option value="">미지정 (정산에서 제외)</option>
          {memberIds.map((id) => (
            <option key={id} value={id}>{nicknames[id] || DEFAULT_NICKNAME}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>나눌 사람</label>
        <div className="btn-row" style={{ gap: 14 }}>
          {memberIds.map((id) => (
            <label key={id} style={checkboxLabel}>
              <input type="checkbox" name={`split_${id}`} defaultChecked={splitAmong.includes(id)} style={{ width: "auto", flexShrink: 0 }} />
              {nicknames[id] || DEFAULT_NICKNAME}
            </label>
          ))}
        </div>
      </div>
    </>
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

/** 회원 탈퇴 — typed confirmation, since this can't be undone. Keeps its own
 * pending/error state because the server-side cleanup takes a few seconds. */
function DeleteAccountForm({ modal, onSubmit, onClose }) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (confirmText.trim() !== "탈퇴") return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(modal, {});
    } catch {
      setError("탈퇴 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h3>회원 탈퇴</h3>
      <ul style={{ margin: "0 0 16px", paddingLeft: 18, color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.7 }}>
        <li>혼자 쓰던 여행은 사진까지 모두 삭제돼요.</li>
        <li>동행자가 있는 여행에서 내가 방장이면, 가장 먼저 참여한 동행자에게 방장이 넘어가요.</li>
        <li>참여 중인 여행에서는 빠지고, 내가 쓴 후기와 사진은 삭제돼요.</li>
        <li>계정과 닉네임이 삭제되며 <b>되돌릴 수 없어요.</b></li>
      </ul>
      <div className="field">
        <label>확인을 위해 "탈퇴"라고 입력해주세요</label>
        <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="탈퇴" autoComplete="off" />
      </div>
      <FormNote message={error} />
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>취소</button>
        <button
          type="submit"
          className="btn btn-primary"
          style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
          disabled={busy || confirmText.trim() !== "탈퇴"}
        >
          {busy ? "처리 중…" : "탈퇴하기"}
        </button>
      </div>
    </form>
  );
}

/** 방장 only — turns the read-only public itinerary link on/off. */
function ShareLinkForm({ trip, onSubmit, onClose }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const url = trip.publicShareId ? `${window.location.origin}/share/${trip.publicShareId}` : "";

  async function toggle(action) {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ type: "share-link" }, { action });
    } catch (err) {
      console.error("[share-link]", err);
      const what = action === "on" ? "링크를 만들지 못했어요" : "링크를 끄지 못했어요";
      // Say *why*, so a failure can be told apart from a bug: a blocked or
      // dropped connection (ad blockers often block Firestore) vs. the
      // security rules refusing the write.
      const why =
        err?.code === "permission-denied" ? "방장만 공개 링크를 바꿀 수 있어요. 새로고침 후 다시 시도해주세요."
        : err?.code === "unavailable" || !navigator.onLine ? "서버에 연결하지 못했어요. 인터넷 연결이나 광고 차단 확장 프로그램을 확인해주세요."
        : `잠시 후 다시 시도해주세요.${err?.code ? ` (${err.code})` : ""}`;
      setError(`${what}. ${why}`);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <h3>🔗 공개 링크</h3>
      <p style={{ margin: "0 0 16px", color: "var(--ink-soft)", fontSize: 13.5 }}>
        링크를 가진 사람은 로그인 없이 <b>일정만</b> 볼 수 있어요(수정 불가). 예산·예약번호·체크리스트·동행자 정보는 공개되지 않아요.
      </p>
      {url ? (
        <>
          <div className="field">
            <label>공유 링크</label>
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
          </div>
          <FormNote message={error} />
          <div className="modal-actions" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => toggle("off")}>링크 끄기</button>
            <span className="btn-row">
              <button type="button" className="btn" onClick={onClose}>닫기</button>
              <button type="button" className="btn btn-primary" onClick={copy}>{copied ? "복사됨 ✓" : "링크 복사"}</button>
            </span>
          </div>
        </>
      ) : (
        <>
          <FormNote message={error} />
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>닫기</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => toggle("on")}>{busy ? "만드는 중…" : "공개 링크 만들기"}</button>
          </div>
        </>
      )}
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
export default function ModalHost({ modal, trip, trips, uid, onClose, onSubmit }) {
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
            {modal.confirmLabel || "삭제"}
          </button>
        </div>
      </>
    );
  } else if (modal.type === "add-trip" || modal.type === "edit-trip") {
    const isEdit = modal.type === "edit-trip";
    const t = isEdit ? trip : {};
    content = <TripForm isEdit={isEdit} t={t} trips={trips} onSubmit={handleSubmit} onClose={onClose} />;
  } else if (modal.type === "duplicate-trip") {
    content = (
      <form onSubmit={handleSubmit} noValidate>
        <h3>여행 복제</h3>
        <p style={{ margin: "0 0 16px", color: "var(--ink-soft)", fontSize: 13.5 }}>
          일정·메모·체크리스트를 복사해 내가 방장인 새 여행을 만들어요. 날짜는 새 출발일에 맞춰 옮겨지고, 동행자·예산·예약·후기는 복사되지 않아요.
        </p>
        <Field name="title" label="새 여행 이름" required defaultValue={`${trip.title} (복사본)`} />
        <Field name="startDate" label="새 출발일" type="date" required defaultValue={trip.startDate} />
        <FormNote message={formError} />
        <Actions submitLabel="복제" onClose={onClose} />
      </form>
    );
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
  } else if (modal.type === "add-budget" || modal.type === "edit-budget") {
    const isEdit = modal.type === "edit-budget";
    const b = isEdit ? trip.budgetItems[modal.idx] : { category: "", amount: "", memo: "" };
    content = (
      <form onSubmit={handleSubmit} noValidate>
        <h3>{isEdit ? "지출 항목 수정" : "지출 항목 추가"}</h3>
        <Field name="category" label="카테고리" placeholder="예: 숙박 / 교통 / 식비 / 쇼핑" required defaultValue={b.category} />
        <Field name="amount" label="금액 (원)" type="number" placeholder="예: 150000" required defaultValue={b.amount} />
        <Field name="memo" label="메모" placeholder="선택" defaultValue={b.memo} />
        <SplitFields trip={trip} item={isEdit ? b : null} uid={uid} />
        <FormNote message={formError} />
        <Actions submitLabel={isEdit ? "저장" : "추가"} onClose={onClose} />
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
  } else if (modal.type === "delete-account") {
    content = <DeleteAccountForm modal={modal} onSubmit={onSubmit} onClose={onClose} />;
  } else if (modal.type === "add-restaurant") {
    content = <RestaurantItemForm trip={trip} restaurant={modal.restaurant} onSubmit={handleSubmit} onClose={onClose} />;
  } else if (modal.type === "share-link") {
    content = <ShareLinkForm trip={trip} onSubmit={onSubmit} onClose={onClose} />;
  } else if (modal.type === "view-route") {
    content = <RouteMapViewer day={trip.days[modal.dayIdx]} onClose={onClose} />;
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

  const isWide = modal.type === "add-item" || modal.type === "edit-item" || modal.type === "add-restaurant" || modal.type === "invite" || modal.type === "view-location" || modal.type === "view-route" || modal.type === "manage-permissions";
  return (
    <div className="modal-overlay">
      <div className={"modal" + (isWide ? " modal-wide" : "")} onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}

function TripForm({ isEdit, t, trips, onSubmit, onClose }) {
  const checklistSources = (trips || []).filter((tr) => (tr.checklist || []).length > 0);
  const [startDate, setStartDate] = useState(t.startDate || "");
  const [endDate, setEndDate] = useState(t.endDate || "");
  const [tripType, setTripType] = useState(t.tripType || "international");
  const [error, setError] = useState(null);

  function handleSubmit(e) {
    const destInput = e.target.querySelector("input[name=destination]");
    if (destInput?.dataset.unconfirmed || !destInput?.value.trim()) {
      e.preventDefault();
      setError("목적지는 검색한 뒤 목록에서 선택해주세요.");
      return;
    }
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
      {!isEdit && checklistSources.length > 0 && (
        <div className="field">
          <label>체크리스트</label>
          <select name="checklistFrom" defaultValue="">
            <option value="">기본 준비물 목록으로 시작</option>
            {checklistSources.map((tr) => (
              <option key={tr.id} value={tr.id}>“{tr.title}”의 체크리스트 가져오기 ({tr.checklist.length}개)</option>
            ))}
          </select>
        </div>
      )}
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
  // The (trimmed) query the current `suggestions` were fetched for — lets
  // Enter tell a list that matches what's typed from one still showing
  // results for an earlier, shorter query.
  const [suggestionsFor, setSuggestionsFor] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1); // keyboard-highlighted suggestion
  const [noMatch, setNoMatch] = useState(false);
  const [listPos, setListPos] = useState(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const fetchSeqRef = useRef(0);
  // Query the user pressed Enter on before its results arrived; the first
  // result for exactly that query gets picked as soon as it lands.
  const pendingEnterRef = useRef(null);
  const skipNextFetchRef = useRef(false);
  const prevTripTypeRef = useRef(tripType);

  // A fresh result list starts with nothing highlighted.
  useEffect(() => { setActiveIdx(-1); }, [suggestions]);

  // The list is portaled to <body> and pinned under the input with
  // position:fixed, so it can hang past the bottom of the modal instead of
  // being clipped by (and adding a scrollbar to) the modal's own scroll box.
  // Re-anchored whenever anything scrolls (capture catches the modal too)
  // or the window resizes.
  const listShown = open && suggestions.length > 0;
  useLayoutEffect(() => {
    if (!listShown) { setListPos(null); return; }
    function place() {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      const top = r.bottom + 4;
      setListPos({ top, left: r.left, width: r.width, maxHeight: Math.max(160, window.innerHeight - top - 12) });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [listShown]);

  // Domestic vs international search completely different regions, so a
  // destination picked under one no longer makes sense after switching —
  // clear it rather than silently keeping a now-mismatched value.
  useEffect(() => {
    if (prevTripTypeRef.current === tripType) return;
    prevTripTypeRef.current = tripType;
    setQuery("");
    setSelected("");
    setSuggestions([]);
    setSuggestionsFor("");
  }, [tripType]);

  useEffect(() => {
    if (skipNextFetchRef.current) { skipNextFetchRef.current = false; return; }
    if (!isLoaded) return;
    clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setSuggestions([]); setSuggestionsFor(""); return; }

    debounceRef.current = setTimeout(async () => {
      const seq = ++fetchSeqRef.current;
      let apiResults = [];
      try {
        const regionCodes = tripType === "domestic" ? ["kr"] : INTERNATIONAL_REGION_CODES;
        apiResults = await fetchCitySuggestions(q, { regionCodes });
      } catch {
        apiResults = [];
      }
      // A slower response for an older query must not overwrite newer results.
      if (seq !== fetchSeqRef.current) return;
      let results = apiResults;
      if (tripType !== "domestic") {
        const seen = new Set(apiResults.map((r) => `${r.city}|${r.sub}`));
        const extraResults = EXTRA_INTERNATIONAL_DESTINATIONS.flatMap((g) =>
          g.cities
            .filter((city) => city.includes(q) && !seen.has(`${city}|${g.country}`))
            .map((city) => ({ city, sub: g.country }))
        );
        results = [...apiResults, ...extraResults];
      }
      if (pendingEnterRef.current === q) {
        pendingEnterRef.current = null;
        if (results.length) { pick(results[0]); return; }
        setNoMatch(true);
      }
      setSuggestions(results);
      setSuggestionsFor(q);
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
    setSuggestionsFor("");
    setNoMatch(false);
    setOpen(false);
  }

  // ↑/↓ move the highlight, Esc closes the list. Enter only ever submits the
  // trip form when the box holds a destination actually picked from the list;
  // otherwise it picks instead:
  //   - an item highlighted with the arrow keys → that item
  //   - results already in for exactly what's typed → the first one
  //   - results still loading (or showing an older query's) → waits, and
  //     picks the first result for this query when it arrives
  //   - no results → shows a hint, stays put
  // Enter pressed mid-composition (a Korean syllable not yet committed) is
  // swallowed, since what's on screen doesn't reflect that syllable yet.
  function handleKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!suggestions.length) return;
      e.preventDefault();
      setOpen(true);
      const n = suggestions.length;
      setActiveIdx((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === "Enter") {
      const q = query.trim();
      if (q === selected) return; // a real pick (or empty) — let the form submit
      e.preventDefault();
      if (e.nativeEvent.isComposing) return;
      if (!q) { setSelected(""); return; }
      if (listShown && activeIdx >= 0) { pick(suggestions[activeIdx]); return; }
      if (suggestionsFor === q) {
        if (suggestions.length) pick(suggestions[0]);
        else setNoMatch(true);
        return;
      }
      pendingEnterRef.current = q;
    } else if (e.key === "Escape" && listShown) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
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
        ref={inputRef}
        name="destination"
        required
        placeholder={tripType === "domestic" ? "예: 부산 (검색해서 목록에서 선택)" : "예: 오사카 (검색해서 목록에서 선택)"}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setNoMatch(false); pendingEnterRef.current = null; }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={listShown}
        aria-activedescendant={activeIdx >= 0 ? `dest-opt-${activeIdx}` : undefined}
        // Read by TripForm's submit check: set while the box holds text that
        // wasn't picked from the list (covers mobile "go" keys that don't
        // send a normal Enter keydown).
        data-unconfirmed={query.trim() && query.trim() !== selected ? "1" : undefined}
      />
      {noMatch && (
        <div className="section-note" style={{ marginTop: 6, color: "var(--danger)" }}>
          검색 결과가 없어요. 다른 이름으로 검색해보세요.
        </div>
      )}
      {listShown && listPos && createPortal(
        <div
          role="listbox"
          style={{
            position: "fixed", top: listPos.top, left: listPos.left, width: listPos.width,
            maxHeight: listPos.maxHeight, overflowY: "auto", zIndex: 60,
            background: "var(--surface)",
            border: "1px solid var(--line)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,.25)",
          }}
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.city}-${i}`}
              id={`dest-opt-${i}`}
              type="button"
              role="option"
              aria-selected={i === activeIdx}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => pick(s)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                background: i === activeIdx ? "var(--accent-soft)" : "none",
                border: "none", borderBottom: i < suggestions.length - 1 ? "1px solid var(--line)" : "none",
                padding: "10px 12px", cursor: "pointer", color: "var(--ink)", font: "inherit",
              }}
            >
              <div>{s.city}</div>
              {s.sub && <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{s.sub}</div>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

/** 맛집 추천 → 일정: looks up the restaurant's pin once (a single billed
 * Places call, only because the user asked to add it), then opens the
 * regular item form pre-filled with a day picker, "식사" label, the name
 * and that pin — any of which the user can still change. */
function RestaurantItemForm({ trip, restaurant, onSubmit, onClose }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: apiKey || "", ...MAPS_LOADER_OPTIONS });
  const [location, setLocation] = useState(undefined); // undefined = still looking
  const days = trip.days || [];

  useEffect(() => {
    if (!days.length) return;
    if (!apiKey || loadError) { setLocation(null); return; }
    if (!isLoaded) return;
    let cancelled = false;
    findPlaceLocation(restaurant.name, restaurant.address, trip.destination).then((loc) => { if (!cancelled) setLocation(loc); });
    return () => { cancelled = true; };
  }, [isLoaded, loadError]);

  if (!days.length) {
    return (
      <div>
        <h3>일정에 추가</h3>
        <div className="empty">먼저 일정 탭에서 날짜를 추가해주세요.</div>
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>닫기</button></div>
      </div>
    );
  }
  if (location === undefined) {
    return (
      <div>
        <h3>일정에 추가</h3>
        <div className="empty">"{restaurant.name}" 위치를 찾는 중이에요…</div>
      </div>
    );
  }

  const prefill = { kind: "label", time: "식사", text: `🍽 ${restaurant.name}` };
  let notice = "위치를 자동으로 찾지 못했어요. 필요하면 아래 \"지도에서 위치 찍기\"로 직접 찍어주세요.";
  if (location) {
    const { placeName, ...pin } = location;
    prefill.location = pin;
    notice = placeName
      ? `지도에서 "${placeName}"(으)로 위치를 찾았어요. 다른 곳이면 아래 "다시 찍기"로 고쳐주세요.`
      : "주소로 위치를 찾았어요. 다른 곳이면 아래 \"다시 찍기\"로 고쳐주세요.";
  }
  return (
    <ItemForm
      title={`"${restaurant.name}" 일정에 추가`}
      it={prefill}
      prefilled
      notice={notice}
      dayOptions={days}
      destination={trip.destination}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
}

function ItemForm({ isEdit, it, prefilled, title, notice, dayOptions, destination, onSubmit, onClose }) {
  const initialKind = isEdit || prefilled ? itemKind(it) : "time";
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
      <h3>{title || (isEdit ? "항목 수정" : "항목 추가")}</h3>
      {notice && <p style={{ margin: "-6px 0 14px", color: "var(--ink-soft)", fontSize: 13.5 }}>{notice}</p>}
      {dayOptions && (
        <div className="field">
          <label>날짜</label>
          <select name="dayIdx" defaultValue="0">
            {dayOptions.map((d, i) => (
              <option key={i} value={i}>{fmtDate(d.date)}{d.summary ? ` · ${d.summary}` : ""}</option>
            ))}
          </select>
        </div>
      )}
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
