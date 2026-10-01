// Security-rule tests against the Firestore emulator. Run with:
//   npx firebase-tools@13 emulators:exec --only firestore "node --test tests/"
import { after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, arrayRemove, arrayUnion, deleteField,
  collection, query, where, documentId,
} from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "travel-planner-bb32d",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "trips/t1"), {
      ownerId: "owner", memberIds: ["owner", "alice", "bob"],
      memberPermissions: { alice: ["budget"] },
      title: "여행", days: [], budgetItems: [],
    });
  });
});

const db = (uid) => env.authenticatedContext(uid).firestore();
const leave = (uid) => updateDoc(doc(db(uid), "trips/t1"), {
  memberIds: arrayRemove(uid), [`memberPermissions.${uid}`]: deleteField(),
});

test("member can leave on their own", async () => {
  await assertSucceeds(leave("alice"));
  await assertSucceeds(leave("bob"));
});

test("방장 cannot leave without handing the trip over", async () => {
  await assertFails(leave("owner"));
});

test("member cannot remove someone else", async () => {
  await assertFails(updateDoc(doc(db("alice"), "trips/t1"), { memberIds: arrayRemove("bob") }));
});

test("leaving can't smuggle other changes along", async () => {
  await assertFails(updateDoc(doc(db("alice"), "trips/t1"), {
    memberIds: arrayRemove("alice"), title: "해킹",
  }));
  await assertFails(updateDoc(doc(db("bob"), "trips/t1"), {
    memberIds: arrayRemove("bob"), "memberPermissions.alice": deleteField(),
  }));
});

test("방장 can remove a member", async () => {
  await assertSucceeds(updateDoc(doc(db("owner"), "trips/t1"), {
    memberIds: arrayRemove("alice"), "memberPermissions.alice": deleteField(),
  }));
});

test("removed member loses read access", async () => {
  await leave("alice");
  await assertFails(getDoc(doc(db("alice"), "trips/t1")));
});

test("only 방장 can toggle the public share link", async () => {
  await assertFails(updateDoc(doc(db("alice"), "trips/t1"), { publicShareId: "abc" }));
  await assertSucceeds(updateDoc(doc(db("owner"), "trips/t1"), { publicShareId: "abc" }));
});

test("signed-out visitors can't read trips directly (share links go through getPublicTrip)", async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, "trips/t1")));
});

test("budget permission still gates budget items (settlement fields included)", async () => {
  const item = { category: "식비", amount: 30000, paidBy: "bob", splitAmong: ["owner", "alice", "bob"] };
  await assertSucceeds(updateDoc(doc(db("alice"), "trips/t1"), { budgetItems: [item] }));
  await assertFails(updateDoc(doc(db("bob"), "trips/t1"), { budgetItems: [item, item] }));
});

test("ownership can only go to an existing member", async () => {
  await assertFails(updateDoc(doc(db("owner"), "trips/t1"), { ownerId: "stranger" }));
  await assertSucceeds(updateDoc(doc(db("owner"), "trips/t1"), { ownerId: "alice" }));
});

test("nicknames: only your own, 1–20 characters", async () => {
  await assertSucceeds(setDoc(doc(db("alice"), "users/alice"), { nickname: "여행러버", updatedAt: 1 }));
  await assertFails(setDoc(doc(db("alice"), "users/alice"), { nickname: "가".repeat(21), updatedAt: 1 }));
  await assertFails(setDoc(doc(db("alice"), "users/bob"), { nickname: "남의 닉네임", updatedAt: 1 }));
});

test("a member the 방장 removed can't rejoin until allowed again", async () => {
  await assertSucceeds(updateDoc(doc(db("owner"), "trips/t1"), { memberIds: arrayRemove("alice"), blockedIds: ["alice"] }));
  await assertFails(updateDoc(doc(db("alice"), "trips/t1"), { memberIds: arrayUnion("alice") }));
  await assertFails(updateDoc(doc(db("bob"), "trips/t1"), { blockedIds: [] }));
  await assertSucceeds(updateDoc(doc(db("owner"), "trips/t1"), { blockedIds: [] }));
  await assertSucceeds(updateDoc(doc(db("alice"), "trips/t1"), { memberIds: arrayUnion("alice") }));
});

test("reviews: each member can change only their own entry", async () => {
  await assertSucceeds(updateDoc(doc(db("alice"), "trips/t1"), { "reviewsBy.alice": { text: "좋았어요", photos: [], updatedAt: 1 } }));
  await assertFails(updateDoc(doc(db("bob"), "trips/t1"), { "reviewsBy.alice": { text: "내가 바꿈", photos: [], updatedAt: 2 } }));
  await assertSucceeds(updateDoc(doc(db("bob"), "trips/t1"), { "reviewsBy.bob": { text: "저도요", photos: [], updatedAt: 3 } }));
  // at most 30 photos each
  const photos = (n) => Array.from({ length: n }, (_, i) => ({ url: "u" + i, path: "p" + i }));
  await assertSucceeds(updateDoc(doc(db("alice"), "trips/t1"), { "reviewsBy.alice": { text: "", photos: photos(30), updatedAt: 4 } }));
  await assertFails(updateDoc(doc(db("alice"), "trips/t1"), { "reviewsBy.alice": { text: "", photos: photos(31), updatedAt: 5 } }));
  // the old shared array is read-only, even for the 방장
  await assertFails(updateDoc(doc(db("owner"), "trips/t1"), { reviews: [] }));
});

test("users: look up one nickname, never list them all", async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "users/bob"), { nickname: "밥" }));
  await assertSucceeds(getDoc(doc(db("alice"), "users/bob")));
  await assertFails(getDocs(collection(db("alice"), "users")));
  await assertFails(getDocs(query(collection(db("alice"), "users"), where(documentId(), "in", ["bob"]))));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users/bob")));
});

test("a new trip must be yours alone", async () => {
  const mine = { ownerId: "alice", memberIds: ["alice"], memberPermissions: {}, title: "새 여행" };
  await assertSucceeds(setDoc(doc(db("alice"), "trips/n1"), mine));
  await assertFails(setDoc(doc(db("alice"), "trips/n2"), { ...mine, ownerId: "bob" }));
  await assertFails(setDoc(doc(db("alice"), "trips/n3"), { ...mine, memberIds: ["alice", "bob"] }));
  await assertFails(setDoc(doc(db("alice"), "trips/n4"), { ...mine, memberPermissions: { bob: ["budget"] } }));
  await assertFails(setDoc(doc(db("alice"), "trips/n5"), { ...mine, publicShareId: "0".repeat(32) }));
  await assertFails(setDoc(doc(db("alice"), "trips/n6"), { ...mine, blockedIds: ["bob"] }));
});

test("push devices and settings are private to their owner", async () => {
  await assertSucceeds(setDoc(doc(db("alice"), "users/alice/devices/tokA"), { platform: "android", updatedAt: 1 }));
  await assertFails(setDoc(doc(db("alice"), "users/alice/devices/tokB"), { platform: "android", updatedAt: 1, extra: 1 }));
  await assertFails(getDoc(doc(db("bob"), "users/alice/devices/tokA")));
  await assertFails(getDocs(collection(db("bob"), "users/alice/devices")));
  await assertFails(setDoc(doc(db("bob"), "users/alice/devices/tokX"), { platform: "android", updatedAt: 1 }));
  await assertFails(deleteDoc(doc(db("bob"), "users/alice/devices/tokA")));
  await assertSucceeds(deleteDoc(doc(db("alice"), "users/alice/devices/tokA")));

  await assertSucceeds(setDoc(doc(db("alice"), "users/alice/private/prefs"), { tripChanges: false, reminders: true, updatedAt: 1 }));
  await assertFails(setDoc(doc(db("alice"), "users/alice/private/prefs"), { tripChanges: "no", reminders: true, updatedAt: 1 }));
  await assertFails(getDoc(doc(db("bob"), "users/alice/private/prefs")));
  await assertFails(setDoc(doc(db("alice"), "users/alice/private/other"), { a: 1 }));
});
