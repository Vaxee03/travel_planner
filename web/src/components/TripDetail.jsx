import { ddayLabel, fmtMoney, tripStatus } from "../lib/utils";
import { downloadTripIcs } from "../lib/ics";
import { useNicknames } from "../lib/useNicknames";
import { DEFAULT_NICKNAME } from "../lib/users";
import Itinerary from "./Itinerary";
import Budget from "./Budget";
import Checklist from "./Checklist";
import Bookings from "./Bookings";
import Review from "./Review";
import Restaurants from "./Restaurants";

const TABS = [
  { key: "itinerary", label: "일정" },
  { key: "budget", label: "예산" },
  { key: "checklist", label: "체크리스트" },
  { key: "bookings", label: "예약정보" },
  { key: "restaurants", label: "맛집 추천" },
];

export default function TripDetail({ trip, uid, perms, tab, setTab, dayIdx, setDayIdx, openModal, requestDelete, toggleCheck, reorderDayItems, onBack, onEditTrip, onDeleteTrip }) {
  const st = tripStatus(trip);
  const dday = ddayLabel(trip);
  const canReview = st === "completed";
  const memberIds = trip.memberIds || [];
  const nicknames = useNicknames(memberIds);

  return (
    <>
      <div className="trip-head">
        <div className="trip-head-top">
          <h1>{trip.title}</h1>
          <button className="back-link" style={{ margin: 0 }} onClick={onBack}>← 여행 목록으로</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div className="chips">
            {dday && <span className="chip"><b>{dday}</b></span>}
            <span className="chip">{trip.tripType === "domestic" ? "🇰🇷 국내" : "✈️ 해외"}</span>
            <span className="chip">📍 {trip.destination || "-"}</span>
            <span className="chip nums">📅 {trip.startDate} – {trip.endDate}</span>
            {trip.budgetTotal ? <span className="chip">💴 예산 <b>{fmtMoney(trip.budgetTotal)}원</b></span> : null}
          </div>
          {perms.isOwner && (
            <div className="btn-row">
              <button className="btn btn-sm" onClick={onEditTrip}>여행 정보 수정</button>
              <button className="btn btn-sm btn-danger" onClick={onDeleteTrip}>삭제</button>
            </div>
          )}
        </div>
        <div className="btn-row">
          <button className="btn btn-sm" onClick={() => openModal({ type: "invite" })}>🎟 동행자 초대</button>
          <button className="btn btn-sm" onClick={() => downloadTripIcs(trip)}>📅 캘린더로 내보내기</button>
          <button className="btn btn-sm" onClick={() => openModal({ type: "duplicate-trip" })}>📋 여행 복제</button>
          {perms.isOwner && (
            <>
              <button className="btn btn-sm" onClick={() => openModal({ type: "manage-permissions" })}>🔑 권한 관리</button>
              <button className="btn btn-sm" onClick={() => openModal({ type: "share-link" })}>🔗 공개 링크{trip.publicShareId ? " (켜짐)" : ""}</button>
              <button className="btn btn-sm" onClick={() => openModal({ type: "transfer-ownership" })}>👑 방장 위임</button>
            </>
          )}
        </div>
        {memberIds.length > 0 && (
          <div className="section-note" style={{ marginTop: -11 }}>
            동행자: {memberIds.map((memberId, i) => (
              <span key={memberId}>
                {i > 0 ? ", " : ""}
                {nicknames[memberId] || DEFAULT_NICKNAME}
                {memberId === trip.ownerId ? " 👑 방장" : ""}
                {perms.isOwner && memberId !== trip.ownerId && (
                  <button
                    type="button"
                    className="btn-ghost"
                    title="내보내기"
                    style={{ padding: "0 4px", fontSize: 12, color: "var(--danger)" }}
                    onClick={() => requestDelete("remove-member", `${nicknames[memberId] || DEFAULT_NICKNAME}님을 이 여행에서 내보낼까요?`, { uid: memberId, confirmLabel: "내보내기" })}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
            {!perms.isOwner && (
              <button
                type="button"
                className="btn-ghost btn-sm btn-danger"
                style={{ marginLeft: 10 }}
                onClick={() => requestDelete("leave-trip", "이 여행에서 나갈까요? 다시 참여하려면 초대 링크가 필요해요.", { confirmLabel: "나가기" })}
              >
                여행 나가기
              </button>
            )}
          </div>
        )}
      </div>

      <div className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={"tab" + (tab === t.key ? " active" : "")}
            onClick={() => { setTab(t.key); setDayIdx(null); }}
          >
            {t.label}
          </button>
        ))}
        <span className="tab-tooltip-wrap">
          <button
            className={"tab" + (tab === "review" ? " active" : "")}
            disabled={!canReview}
            onClick={() => canReview && setTab("review")}
          >
            후기{canReview ? "" : " 🔒"}
          </button>
          {!canReview && <span className="tooltip">아직 완료되지 않은 일정입니다</span>}
        </span>
      </div>

      {tab === "itinerary" && <Itinerary trip={trip} dayIdx={dayIdx} setDayIdx={setDayIdx} openModal={openModal} requestDelete={requestDelete} reorderDayItems={reorderDayItems} canEdit={perms.itinerary} />}
      {tab === "budget" && <Budget trip={trip} openModal={openModal} requestDelete={requestDelete} canEdit={perms.budget} />}
      {tab === "checklist" && <Checklist trip={trip} openModal={openModal} requestDelete={requestDelete} toggleCheck={toggleCheck} canEdit={perms.checklist} />}
      {tab === "bookings" && <Bookings trip={trip} openModal={openModal} requestDelete={requestDelete} canEdit={perms.bookings} />}
      {tab === "restaurants" && <Restaurants trip={trip} />}
      {tab === "review" && <Review trip={trip} uid={uid} canReview={canReview} openModal={openModal} requestDelete={requestDelete} />}
    </>
  );
}
