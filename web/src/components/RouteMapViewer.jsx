import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { MAPS_LOADER_OPTIONS } from "../lib/mapsLoader";
import { splitItems } from "../lib/utils";

const MAP_OPTIONS = { disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy" };

/** The day's located items in visiting order — timed items by time first,
 * then the untimed/label ones in their hand-arranged order (the same order
 * the day detail screen lists them in). */
export function routeStops(day) {
  const { timeEntries, labelEntries } = splitItems(day?.items);
  return [...timeEntries, ...labelEntries]
    .map((e) => e.it)
    .filter((it) => it.location && Number.isFinite(it.location.lat) && Number.isFinite(it.location.lng));
}

/** Read-only map of one day's 동선: numbered pins joined by a line in order. */
export default function RouteMapViewer({ day, onClose }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: apiKey || "", ...MAPS_LOADER_OPTIONS });
  const stops = routeStops(day);
  const path = stops.map((it) => ({ lat: it.location.lat, lng: it.location.lng }));

  function fitAll(map) {
    if (path.length < 2) return;
    const bounds = new window.google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
  }

  return (
    <div>
      <h3>🗺 동선 보기</h3>
      {!apiKey || loadError ? (
        <div className="note"><span className="dot" /><span>지도를 불러오지 못했어요.</span></div>
      ) : !isLoaded ? (
        <div className="empty">지도를 불러오는 중…</div>
      ) : (
        <div className="map-picker-map">
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={path[0]}
            zoom={15}
            options={MAP_OPTIONS}
            onLoad={fitAll}
          >
            {path.length > 1 && (
              <Polyline path={path} options={{ strokeColor: "#e07a63", strokeOpacity: 0.9, strokeWeight: 4 }} />
            )}
            {path.map((p, i) => (
              <Marker key={i} position={p} label={{ text: String(i + 1), color: "#fff", fontWeight: "700" }} title={stops[i].text} />
            ))}
          </GoogleMap>
        </div>
      )}
      <ol className="route-stops">
        {stops.map((it, i) => (
          <li key={i}>
            <b>{i + 1}</b> {it.time ? <span className="nums">{it.time} · </span> : null}{it.text}
          </li>
        ))}
      </ol>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
