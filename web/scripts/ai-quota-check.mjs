// Manual check of the daily AI quota on the emulators:
//   npx firebase-tools@14 emulators:exec --only auth,firestore,functions "node scripts/ai-quota-check.mjs"
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithCustomToken } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
const app = initializeApp({ apiKey: "fake", projectId: "travel-planner-bb32d" });
const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9299", { disableWarnings: true });
const fns = getFunctions(app, "us-central1"); connectFunctionsEmulator(fns, "127.0.0.1", 5001);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: "x", sub: "x", uid: "quotauser", iat: now, exp: now + 3600, aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit" })}.`;
await signInWithCustomToken(auth, token);
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const setUsage = (count) => fetch("http://127.0.0.1:8080/v1/projects/travel-planner-bb32d/databases/travelplanner/documents/aiUsage/quotauser", {
  method: "PATCH", headers: { Authorization: "Bearer owner", "content-type": "application/json" },
  body: JSON.stringify({ fields: { day: { stringValue: today }, count: { integerValue: String(count) } } }) });
const call = httpsCallable(fns, "recommendRestaurants");
const tryCall = async (label) => { try { await call({ destination: "오사카" }); console.log(label, "OK"); } catch (e) { console.log(label, e.code, "-", e.message); } };
const readCount = async () => (await (await fetch("http://127.0.0.1:8080/v1/projects/travel-planner-bb32d/databases/travelplanner/documents/aiUsage/quotauser", { headers: { Authorization: "Bearer owner" } })).json()).fields?.count?.integerValue;
await setUsage(20); await tryCall("used=20 →");
await setUsage(5);  await tryCall("used=5  →"); console.log("count after:", await readCount());
process.exit(0);
