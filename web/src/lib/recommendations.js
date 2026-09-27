import { callFunction } from "./firebase";

export function fetchRestaurantRecommendations(destination, preferences, tripType) {
  return callFunction("recommendRestaurants", { destination, preferences, tripType });
}
