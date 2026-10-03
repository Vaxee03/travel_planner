// Storage rule tests (cross-service: membership comes from Firestore).
// Run with: npm run test:rules
import { after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { ref, uploadString, getMetadata, deleteObject } from "firebase/storage";

const env = await initializeTestEnvironment({
  projectId: "travel-planner-bb32d",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9399 },
});
after(() => env.cleanup());

// The app's trips live in the named "travelplanner" database, which is what
// the storage rule's firestore.get() reads. The test library only talks to
// the default database, so seed through the emulator's REST API instead
// ("Bearer owner" bypasses rules on the emulator).
async function seedTrip() {
  const url = "http://127.0.0.1:8080/v1/projects/travel-planner-bb32d/databases/travelplanner/documents/trips/t1";
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ fields: {
      ownerId: { stringValue: "owner" },
      memberIds: { arrayValue: { values: [{ stringValue: "owner" }, { stringValue: "alice" }] } },
    } }),
  });
  if (!res.ok) throw new Error(`seed failed: ${res.status}`);
}

beforeEach(async () => {
  await env.clearStorage();
  await seedTrip();
});

const storage = (uid) => env.authenticatedContext(uid).storage();
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const put = (uid, path, contentType = "image/png") =>
  uploadString(ref(storage(uid), path), png, "data_url", { contentType });

test("member can upload an image into their own folder", async () => {
  await assertSucceeds(put("alice", "trips/t1/review/alice/a.png"));
});

test("member can't upload into someone else's folder", async () => {
  await assertFails(put("alice", "trips/t1/review/owner/a.png"));
});

test("non-member can't upload, read or delete", async () => {
  await put("alice", "trips/t1/review/alice/a.png");
  await assertFails(put("mallory", "trips/t1/review/mallory/a.png"));
  await assertFails(getMetadata(ref(storage("mallory"), "trips/t1/review/alice/a.png")));
  await assertFails(deleteObject(ref(storage("mallory"), "trips/t1/review/alice/a.png")));
});

test("other members can view but not delete my photo", async () => {
  await put("alice", "trips/t1/review/alice/a.png");
  await assertSucceeds(getMetadata(ref(storage("owner"), "trips/t1/review/alice/a.png")));
  await assertFails(deleteObject(ref(storage("owner"), "trips/t1/review/alice/a.png")));
  await assertSucceeds(deleteObject(ref(storage("alice"), "trips/t1/review/alice/a.png")));
});

test("only plain photo formats are accepted", async () => {
  await assertFails(put("alice", "trips/t1/review/alice/a.html", "text/html"));
  await assertFails(put("alice", "trips/t1/review/alice/a.svg", "image/svg+xml"));
  await assertSucceeds(put("alice", "trips/t1/review/alice/a.jpg", "image/jpeg"));
  await assertSucceeds(put("alice", "trips/t1/review/alice/a.webp", "image/webp"));
});

test("no upload once the member's review already has 30 photos", async () => {
  const photo = (i) => ({ mapValue: { fields: { url: { stringValue: "u" + i }, path: { stringValue: "p" + i } } } });
  const withPhotos = (n) => fetch("http://127.0.0.1:8080/v1/projects/travel-planner-bb32d/databases/travelplanner/documents/trips/t1?updateMask.fieldPaths=reviewsBy", {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ fields: { reviewsBy: { mapValue: { fields: { alice: { mapValue: { fields: { photos: { arrayValue: { values: Array.from({ length: n }, (_, i) => photo(i)) } } } } } } } } } }),
  });
  await withPhotos(29);
  await assertSucceeds(put("alice", "trips/t1/review/alice/29.png"));
  await withPhotos(30);
  await assertFails(put("alice", "trips/t1/review/alice/30.png"));
  await assertSucceeds(put("owner", "trips/t1/review/owner/1.png")); // others unaffected
});

test("old flat-layout photos: members read/delete, nobody uploads", async () => {
  await env.withSecurityRulesDisabled((ctx) =>
    uploadString(ref(ctx.storage(), "trips/t1/review/old.png"), png, "data_url", { contentType: "image/png" }));
  await assertFails(put("alice", "trips/t1/review/new.png"));
  await assertFails(getMetadata(ref(storage("mallory"), "trips/t1/review/old.png")));
  await assertSucceeds(getMetadata(ref(storage("alice"), "trips/t1/review/old.png")));
  await assertSucceeds(deleteObject(ref(storage("alice"), "trips/t1/review/old.png")));
});
