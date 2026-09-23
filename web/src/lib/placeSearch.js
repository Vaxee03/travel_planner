// The New Places API caps includedRegionCodes at 15 and has no "exclude"
// option, so international search is scoped to this allowlist rather than
// truly worldwide — picked for actual Korean outbound travel volume (Japan/SE
// Asia dominate, then US/Australia/Europe for longer-haul trips). Any city
// within these countries is still searched dynamically, not hardcoded.
export const INTERNATIONAL_REGION_CODES = [
  "jp", "vn", "th", "ph", "tw", "cn", "hk", "mo", "sg", "my", "id", "gu", "us", "au", "fr",
];

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
