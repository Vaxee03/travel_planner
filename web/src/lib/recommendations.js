import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export async function fetchRestaurantRecommendations(destination, preferences) {
  const call = httpsCallable(functions, "recommendRestaurants");
  const res = await call({ destination, preferences });
  return res.data;
}
