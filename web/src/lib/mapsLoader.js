// @react-google-maps/api keeps a single global loader instance, so every
// useJsApiLoader() call across the app must pass identical options or it
// throws "Loader must not be called again with different options".
export const MAPS_LOADER_OPTIONS = {
  libraries: ["places"],
  language: "ko",
  region: "KR",
};
