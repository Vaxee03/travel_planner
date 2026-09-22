import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { MAPS_LOADER_OPTIONS } from "../lib/mapsLoader";

const MAP_OPTIONS = { disableDefaultUI: true, gestureHandling: "greedy" };

/** Read-only map popup for an already-picked location. Shows the pin and,
 * below it, a plain link out to Google Maps instead of jumping there directly. */
export default function LocationViewer({ location, label, onClose }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || "",
    ...MAPS_LOADER_OPTIONS,
  });

  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;

  return (
    <div>
      <h3>{label || "위치"}</h3>
      {!apiKey || loadError ? (
        <div className="note">
          <span className="dot" />
          <span>지도를 불러오지 못했어요.</span>
        </div>
      ) : !isLoaded ? (
        <div className="empty">지도를 불러오는 중…</div>
      ) : (
        <div className="map-picker-map">
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={{ lat: location.lat, lng: location.lng }}
            zoom={16}
            options={MAP_OPTIONS}
          >
            <Marker position={{ lat: location.lat, lng: location.lng }} />
          </GoogleMap>
        </div>
      )}
      <div className="map-picker-address">
        {location.address || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}
      </div>
      <div className="modal-actions" style={{ justifyContent: "space-between" }}>
        <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5 }}>
          구글 지도에서 열기 →
        </a>
        <button type="button" className="btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
