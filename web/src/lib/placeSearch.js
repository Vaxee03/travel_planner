// The New Places API caps includedRegionCodes at 15 and has no "exclude"
// option, so international search is scoped to this allowlist rather than
// truly worldwide — picked for actual Korean outbound travel volume (Japan/SE
// Asia dominate, then US/Australia/Europe for longer-haul trips). Any city
// within these countries is still searched dynamically, not hardcoded.
export const INTERNATIONAL_REGION_CODES = [
  "jp", "vn", "th", "ph", "tw", "cn", "hk", "mo", "sg", "my", "id", "gu", "us", "au", "fr",
];

// A pin further than this from the trip's destination is treated as a
// wrong match (text search always returns *something*, even for a name
// that doesn't exist) and dropped rather than saved.
const MAX_DISTANCE_FROM_DESTINATION_KM = 100;

function geocode(address) {
  if (!address || !window.google?.maps?.Geocoder) return Promise.resolve(null);
  return new Promise((resolve) => {
    new window.google.maps.Geocoder().geocode({ address }, (results, status) => {
      const r = status === "OK" ? results?.[0] : null;
      resolve(r ? { lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), address: r.formatted_address } : null);
    });
  });
}

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Best-effort pin for a named place (e.g. an AI-recommended restaurant):
 * Places text search on "name + address" biased around the trip's
 * destination, then plain geocoding of the address. A result far from the
 * destination is discarded as a wrong match — but a nearby unrelated place
 * can still come back for a name that doesn't exist, which is why the text
 * search result also carries `placeName` for the user to eyeball.
 * Resolves { lat, lng, address, placeName? } or null — never throws, since a missing pin just means the user places it
 * by hand. A couple of billed lookups per call, so only call it on an
 * explicit user action. */
export async function findPlaceLocation(name, address, destination) {
  const query = [name, address].filter(Boolean).join(" ");
  if (!query) return null;
  const center = await geocode(destination);
  const nearDestination = (loc) => loc && (!center || distanceKm(center, loc) <= MAX_DISTANCE_FROM_DESTINATION_KM);

  try {
    const Place = window.google?.maps?.places?.Place;
    if (Place?.searchByText) {
      const request = { textQuery: query, fields: ["location", "formattedAddress", "displayName"], maxResultCount: 1, language: "ko" };
      if (center) request.locationBias = { center: { lat: center.lat, lng: center.lng }, radius: 50000 };
      const { places: found } = await Place.searchByText(request);
      const p = found?.[0];
      const loc = p?.location && { lat: p.location.lat(), lng: p.location.lng(), address: p.formattedAddress || address || "" };
      // placeName is only for showing the user what matched — callers
      // shouldn't store it with the pin.
      if (nearDestination(loc)) return { ...loc, placeName: p.displayName || "" };
    }
  } catch {
    // fall through to geocoding the address
  }
  const byAddress = await geocode(address);
  return nearDestination(byAddress) ? byAddress : null;
}

/** Fetches city-level autocomplete suggestions from the New Places API,
 * localized to Korean. Used for the destination picker — no Place Details
 * call follows (we only need the name), so this stays on the cheap
 * per-request "abandoned session" pricing rather than session pricing. */
export async function fetchCitySuggestions(query, { regionCodes } = {}) {
  if (!window.google?.maps?.places?.AutocompleteSuggestion) return [];

  const request = {
    input: query,
    language: "ko",
    includedPrimaryTypes: ["locality"],
  };
  if (regionCodes && regionCodes.length) request.includedRegionCodes = regionCodes;

  const { suggestions } = await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
  return (suggestions || []).map((s) => {
    const pred = s.placePrediction;
    return {
      city: pred.mainText?.toString() || pred.text.toString(),
      sub: pred.secondaryText?.toString() || "",
    };
  });
}
