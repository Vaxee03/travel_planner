import { useState } from "react";
import { fetchRestaurantRecommendations } from "../lib/recommendations";
import { saveTrip } from "../lib/tripsApi";
import { fmtDate } from "../lib/utils";
import InfoTooltip from "./InfoTooltip";

/** Dates of the days that already hold an item added from this
 * recommendation (tagged with `restaurant` when it was added). */
function addedDates(trip, name) {
  return (trip.days || [])
    .filter((d) => (d.items || []).some((it) => it.restaurant === name))
    .map((d) => fmtDate(d.date));
}

export default function Restaurants({ trip, openModal, canAddToItinerary }) {
  const [preferences, setPreferences] = useState(trip.restaurantRecs?.preferences || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const rec = trip.restaurantRecs;

  async function handleFetch() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRestaurantRecommendations(trip.destination, preferences, trip.tripType);
      await saveTrip({ ...trip, restaurantRecs: data });
    } catch (err) {
      setError(err?.message || "맛집 추천을 가져오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="section-head">
        <h2 style={{ display: "flex", alignItems: "center" }}>
          🍜 AI 맛집 추천
          <InfoTooltip
            text={
              "구글 검색으로 지금도 실제 영업 중인지 확인된 곳만 골라 추천해요(지어낸 곳 없음). " +
              (trip.tripType === "domestic"
                ? "국내 여행이라 대한민국 국내 매장만 추천 대상이에요. "
                : "") +
              "위 입력창에 원하는 조건(가성비, 채식, 아이 동반 등)을 적으면 그 조건에 맞는 곳 위주로 우선 추천해요."
            }
          />
        </h2>
      </div>

      {!trip.destination ? (
        <div className="empty">목적지를 먼저 설정해주세요.</div>
      ) : (
        <>
          <div className="btn-row" style={{ marginBottom: 14 }}>
            <input
              style={{ flex: 1, minWidth: 160 }}
              placeholder="예: 가성비 좋은 라멘, 아이와 가기 좋은 곳, 채식 옵션 있는 곳"
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
            />
            <button className="btn btn-sm" disabled={loading} onClick={handleFetch}>
              {loading ? "추천 받는 중…" : rec ? "다시 추천받기" : "맛집 추천 받기"}
            </button>
          </div>

          {error ? (
            <div className="note"><span className="dot" /><span>{error}</span></div>
          ) : !rec ? (
            <div className="empty">"{trip.destination}"의 현지 맛집을 AI가 검색해서 추천해드려요. 원하는 조건이 있으면 위에 적어주세요.</div>
          ) : (
            <>
              <div className="section-note" style={{ marginBottom: 10 }}>
                {rec.destination} 기준 추천{rec.preferences ? ` · "${rec.preferences}" 조건` : ""} · {new Date(rec.generatedAt).toLocaleString("ko-KR")}
              </div>
              <div className="food-results">
                {rec.items.map((item, idx) => {
                  const added = addedDates(trip, item.name);
                  return (
                    <div className="food-card" key={idx}>
                      <div className="food-card-top">
                        <span className="food-card-name">{item.name}</span>
                        {item.category && <span className="food-card-tag">{item.category}</span>}
                      </div>
                      {item.reason && <div className="food-card-why">{item.reason}</div>}
                      {item.address && <div className="food-card-why">📍 {item.address}</div>}
                      {(canAddToItinerary || added.length > 0) && (
                        <div className="btn-row" style={{ marginTop: 10, alignItems: "center" }}>
                          {canAddToItinerary && (
                            <button className="btn btn-sm" onClick={() => openModal({ type: "add-restaurant", restaurant: item })}>
                              📅 일정에 추가
                            </button>
                          )}
                          {added.length > 0 && (
                            <span className="section-note" style={{ color: "var(--confirmed)" }}>✓ {added.join(", ")} 일정에 추가됨</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
