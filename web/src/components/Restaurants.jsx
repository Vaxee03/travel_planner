import { useState } from "react";
import { fetchRestaurantRecommendations } from "../lib/recommendations";
import { saveTrip } from "../lib/tripsApi";

export default function Restaurants({ trip }) {
  const [preferences, setPreferences] = useState(trip.restaurantRecs?.preferences || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const rec = trip.restaurantRecs;

  async function handleFetch() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRestaurantRecommendations(trip.destination, preferences);
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
        <h2>🍜 AI 맛집 추천</h2>
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
                {rec.items.map((item, idx) => (
                  <div className="food-card" key={idx}>
                    <div className="food-card-top">
                      <span className="food-card-name">{item.name}</span>
                      {item.category && <span className="food-card-tag">{item.category}</span>}
                    </div>
                    {item.reason && <div className="food-card-why">{item.reason}</div>}
                    {item.address && <div className="food-card-why">📍 {item.address}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
