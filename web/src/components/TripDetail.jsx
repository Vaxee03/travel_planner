import { ddayLabel, fmtMoney, tripStatus } from "../lib/utils";
import { downloadTripIcs } from "../lib/ics";
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

export default function TripDetail({ trip, tab, setTab, dayIdx, setDayIdx, openModal, requestDelete, toggleCheck, reorderDayItems, onBack, onEditTrip, onDeleteTrip }) {
  const st = tripStatus(trip);
  const dday = ddayLabel(trip);
  const canReview = st === "completed";

  return (
    <>
      <div className="trip-head">
        <div className="trip-head-top">
          <h1>{trip.title}</h1>
          <div className="btn-row">
            <button className="btn btn-sm" onClick={() => openModal({ type: "invite" })}>🎟 동행자 초대</button>
            <button className="btn btn-sm" onClick={() => downloadTripIcs(trip)}>📅 캘린더로 내보내기</button>
            <button className="btn btn-sm" onClick={onEditTrip}>여행 정보 수정</button>
            <button className="btn btn-sm btn-danger" onClick={onDeleteTrip}>삭제</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div className="chips">
            {dday && <span className="chip"><b>{dday}</b></span>}
            <span className="chip">📍 {trip.destination || "-"}</span>
            <span className="chip nums">📅 {trip.startDate} – {trip.endDate}</span>
            {trip.budgetTotal ? <span className="chip">💴 예산 <b>{fmtMoney(trip.budgetTotal)}원</b></span> : null}
          </div>
          <button className="back-link" style={{ margin: 0 }} onClick={onBack}>← 여행 목록으로</button>
        </div>
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

      {tab === "itinerary" && <Itinerary trip={trip} dayIdx={dayIdx} setDayIdx={setDayIdx} openModal={openModal} requestDelete={requestDelete} reorderDayItems={reorderDayItems} />}
      {tab === "budget" && <Budget trip={trip} openModal={openModal} requestDelete={requestDelete} />}
      {tab === "checklist" && <Checklist trip={trip} openModal={openModal} requestDelete={requestDelete} toggleCheck={toggleCheck} />}
      {tab === "bookings" && <Bookings trip={trip} openModal={openModal} requestDelete={requestDelete} />}
      {tab === "restaurants" && <Restaurants trip={trip} />}
      {tab === "review" && <Review trip={trip} canReview={canReview} openModal={openModal} />}
    </>
  );
}
