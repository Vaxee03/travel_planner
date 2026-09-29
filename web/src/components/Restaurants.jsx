import { useState } from "react";
import { fetchRestaurantRecommendations } from "../lib/recommendations";
import { fmtDate } from "../lib/utils";
import InfoTooltip from "./InfoTooltip";
import { reportError } from "../lib/errorReporting";

/** A failed recommendation call in plain words. The callable error message
 * carries the server's Korean text but the SDK tacks a status code on the end
 * ("… [500]"), which users shouldn't see. */
function recErrorMessage(err) {
  const code = String(err?.code || "").replace(/^functions\//, "");
  const serverText = String(err?.message || "").replace(/\s*\[\d+\]\s*$/, "").trim();
  if (code === "resource-exhausted") return serverText || "오늘 맛집 추천 횟수를 모두 썼어요. 내일 다시 시도해주세요.";
  if (!navigator.onLine || code === "unavailable") return "인터넷 연결을 확인한 뒤 다시 시도해주세요.";
  if (code === "deadline-exceeded") return "추천을 찾는 데 너무 오래 걸렸어요. 다시 시도해주세요.";
  if (code === "unauthenticated") return "로그인이 풀렸어요. 새로고침 후 다시 시도해주세요.";
  return "지금은 맛집 추천을 받을 수 없어요. 잠시 후 다시 시도해주세요.";
}

/** The last recommendation per trip is kept in this browser only (not in the
 * trip, so companions' lists never overwrite each other), so it survives a
 * reload or switching tabs. Storage can be unavailable (private mode, blocked
 * site data) — then it's simply not kept. */
const recKey = (tripId) => `tp:recs:${tripId}`;
function loadSavedRec(tripId) {
  try {
    const saved = JSON.parse(localStorage.getItem(recKey(tripId)) || "null");
    return saved && Array.isArray(saved.rec?.items) ? saved : null;
  } catch {
    return null;
  }
}
function saveRec(tripId, preferences, rec) {
  try {
    localStorage.setItem(recKey(tripId), JSON.stringify({ preferences, rec }));
  } catch {
    /* not kept */
  }
}

/** Dates of the days that already hold an item added from this
 * recommendation (tagged with `restaurant` when it was added). */
function addedDates(trip, name) {
  return (trip.days || [])
    .filter((d) => (d.items || []).some((it) => it.restaurant === name))
    .map((d) => fmtDate(d.date));
}

export default function Restaurants({ trip, openModal, canAddToItinerary }) {
  const [preferences, setPreferences] = useState(() => loadSavedRec(trip.id)?.preferences || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rec, setRec] = useState(() => loadSavedRec(trip.id)?.rec || null);

  // Another trip in the same component instance → show that trip's saved list.
  const [shownTripId, setShownTripId] = useState(trip.id);
  if (shownTripId !== trip.id) {
    const saved = loadSavedRec(trip.id);
    setShownTripId(trip.id);
    setPreferences(saved?.preferences || "");
    setRec(saved?.rec || null);
    setError(null);
  }

  async function handleFetch() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRestaurantRecommendations(trip.destination, preferences, trip.tripType);
      setRec(result);
      saveRec(trip.id, preferences, result);
    } catch (err) {
      // Hitting the daily limit is expected, not a bug worth reporting.
      if (err?.code !== "functions/resource-exhausted") reportError(err, "restaurant-recs");
      setError(recErrorMessage(err));
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
              "구글 검색으로 지금도 실제 영업 중인지 확인된 곳만 골라 추천해요. " +
              (trip.tripType === "domestic"
                ? "국내 여행은 대한민국 국내 매장만 추천 대상이에요. "
                : "") +
              "위 입력창에 원하는 조건(가성비, 메뉴, 컨셉 등)을 적으면 그 조건에 맞는 곳 위주로 우선 추천해요."
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
