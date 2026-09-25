// Security-rule tests against the Firestore emulator. Run with:
//   npx firebase-tools@13 emulators:exec --only firestore "node --test tests/"
import { after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, arrayRemove, deleteField,
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

test("public trip copies are world-readable but never client-writable", async () => {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), "publicTrips/abc"), { title: "여행", days: [] }));
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anon, "publicTrips/abc")));
  await assertFails(setDoc(doc(anon, "publicTrips/abc"), { title: "x" }));
  await assertFails(setDoc(doc(db("owner"), "publicTrips/abc"), { title: "x" }));
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
