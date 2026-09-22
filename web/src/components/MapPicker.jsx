import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { MAPS_LOADER_OPTIONS } from "../lib/mapsLoader";

const MAP_OPTIONS = { disableDefaultUI: true, gestureHandling: "greedy" };
const DEFAULT_CENTER = { lat: 35.6812, lng: 139.7671 }; // Tokyo, reasonable default

/**
 * Modal-ish inline map for picking one location. Search a place (with
 * as-you-type suggestions) or click the map to drop a pin; onPick receives
 * { lat, lng, address }. address is filled in async via (reverse) geocoding
 * and may lag a moment behind the pin.
 */
export default function MapPicker({ initialLocation, onPick, onClose }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || "",
    ...MAPS_LOADER_OPTIONS,
  });

  const [marker, setMarker] = useState(
    initialLocation ? { lat: initialLocation.lat, lng: initialLocation.lng } : null
  );
  const [address, setAddress] = useState(initialLocation?.address || "");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const geocoderRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const debounceRef = useRef(null);
  const skipNextFetchRef = useRef(false);

  function getGeocoder() {
    if (!geocoderRef.current && window.google) {
      geocoderRef.current = new window.google.maps.Geocoder();
    }
    return geocoderRef.current;
  }

  function getSessionToken() {
    if (!sessionTokenRef.current && window.google?.maps?.places) {
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  }

  const handleClick = useCallback((e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setMarker({ lat, lng });
    setAddress("주소 확인 중…");
    setSuggestions([]);

    getGeocoder()?.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        setAddress(results[0].formatted_address);
      } else {
        setAddress("");
      }
    });
  }, []);

  useEffect(() => {
    if (skipNextFetchRef.current) { skipNextFetchRef.current = false; return; }
    if (!isLoaded || !window.google?.maps?.places?.AutocompleteSuggestion) return;
    clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        const { suggestions: results } =
          await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: q,
            language: "ko",
            region: "KR",
            sessionToken: getSessionToken(),
          });
        setSuggestions(results || []);
      } catch {
        // The new Places API may not be enabled on this project yet — fail
        // quietly here, the "검색" button's Geocoding fallback still works.
        setSuggestions([]);
      }
    }, 150);
    return () => clearTimeout(debounceRef.current);
  }, [query, isLoaded]);

  async function pickSuggestion(suggestion) {
    setSuggestions([]);
    const prediction = suggestion.placePrediction;
    skipNextFetchRef.current = true;
    setQuery(prediction.text.toString());
    const place = prediction.toPlace();
    try {
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      setMarker({ lat: place.location.lat(), lng: place.location.lng() });
      setAddress(place.formattedAddress || "");
      sessionTokenRef.current = null; // a session ends once a place is chosen
    } catch {
      setSearchError("위치 정보를 가져오지 못했어요.");
    }
  }

  function handleSearch(e) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSuggestions([]);
    setSearchError(null);
    getGeocoder()?.geocode({ address: q }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const loc = results[0].geometry.location;
        setMarker({ lat: loc.lat(), lng: loc.lng() });
        setAddress(results[0].formatted_address);
      } else {
        setSearchError("검색 결과를 찾을 수 없어요.");
      }
    });
  }

  if (!apiKey) {
    return (
      <div>
        <div className="note">
          <span className="dot" />
          <span>Google Maps API 키가 설정되지 않았어요. web/.env.local에 VITE_GOOGLE_MAPS_API_KEY를 넣어주세요.</span>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div>
        <div className="note">
          <span className="dot" />
          <span>지도를 불러오지 못했어요: {String(loadError.message || loadError)}</span>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    );
  }
  if (!isLoaded) {
    return (
      <div>
        <div className="empty">지도를 불러오는 중…</div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>취소</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* This lives inside the item-add <form>, so a nested <form> here would
          submit that outer form too — a plain div + button avoids that. */}
      <div style={{ position: "relative" }}>
        <div className="btn-row" style={{ marginBottom: suggestions.length ? 0 : 10 }}>
          <input
            type="text"
            placeholder="장소나 주소 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(e); }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button type="button" className="btn btn-sm" style={{ flexShrink: 0 }} onClick={handleSearch}>검색</button>
        </div>
        {suggestions.length > 0 && (
          <div
            style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30,
              marginTop: 4, marginBottom: 10, background: "var(--surface)",
              border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,.25)",
            }}
          >
            {suggestions.map((s, i) => {
              const pred = s.placePrediction;
              return (
                <button
                  key={pred.placeId || i}
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", background: "none",
                    border: "none", borderBottom: i < suggestions.length - 1 ? "1px solid var(--line)" : "none",
                    padding: "10px 12px", cursor: "pointer", color: "var(--ink)", font: "inherit",
                  }}
                >
                  <div>{pred.mainText?.toString() || pred.text.toString()}</div>
                  {pred.secondaryText && (
                    <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{pred.secondaryText.toString()}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {searchError && (
        <div className="note" style={{ marginTop: 0, marginBottom: 10 }}>
          <span className="dot" />
          <span>{searchError}</span>
        </div>
      )}
      <div className="map-picker-map">
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={marker || DEFAULT_CENTER}
          zoom={marker ? 15 : 11}
          onClick={handleClick}
          options={MAP_OPTIONS}
        >
          {marker && <Marker position={marker} />}
        </GoogleMap>
      </div>
      <div className="map-picker-address">
        {marker
          ? <>선택한 위치: <b>{address || `${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}`}</b></>
          : "검색하거나 지도를 클릭해서 위치를 찍어주세요."}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!marker}
          onClick={() => onPick({ lat: marker.lat, lng: marker.lng, address })}
        >
          이 위치로 저장
        </button>
      </div>
    </div>
  );
}
