import { useCallback, useRef, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

const LIBRARIES = ["places"];
const DEFAULT_CENTER = { lat: 35.6812, lng: 139.7671 }; // Tokyo, reasonable default

/**
 * Modal-ish inline map for picking one location. Click the map to drop a
 * pin; onPick receives { lat, lng, address }. address is filled in async via
 * reverse geocoding and may lag a moment behind the pin.
 */
export default function MapPicker({ initialLocation, onPick, onClose }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || "",
    libraries: LIBRARIES,
  });

  const [marker, setMarker] = useState(
    initialLocation ? { lat: initialLocation.lat, lng: initialLocation.lng } : null
  );
  const [address, setAddress] = useState(initialLocation?.address || "");
  const geocoderRef = useRef(null);

  const handleClick = useCallback((e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setMarker({ lat, lng });
    setAddress("주소 확인 중…");

    if (!geocoderRef.current && window.google) {
      geocoderRef.current = new window.google.maps.Geocoder();
    }
    if (geocoderRef.current) {
      geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK" && results?.[0]) {
          setAddress(results[0].formatted_address);
        } else {
          setAddress("");
        }
      });
    }
  }, []);

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
      <div className="map-picker-map">
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={marker || DEFAULT_CENTER}
          zoom={marker ? 15 : 11}
          onClick={handleClick}
        >
          {marker && <Marker position={marker} />}
        </GoogleMap>
      </div>
      <div className="map-picker-address">
        {marker
          ? <>선택한 위치: <b>{address || `${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}`}</b></>
          : "지도를 클릭해서 위치를 찍어주세요."}
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
