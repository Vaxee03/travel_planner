const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const { GoogleGenAI } = require("@google/genai");

initializeApp();

// The app's named Firestore database (firebase.json → firestore.database),
// which lives in Seoul — Firestore triggers must run in the same region.
const DATABASE_ID = "travelplanner";
const DATABASE_REGION = "asia-northeast3";
const db = getFirestore(DATABASE_ID);

/** What a public share link exposes: the itinerary only. Budget, bookings
 * (confirmation numbers!), checklist, memo, reviews and member ids are
 * deliberately left out. */
function publicTripCopy(trip) {
  return {
    title: trip.title || "",
    destination: trip.destination || "",
    tripType: trip.tripType || "international",
    startDate: trip.startDate || "",
    endDate: trip.endDate || "",
    days: (trip.days || []).map((d) => ({
      date: d.date || "",
      status: d.status || "open",
      summary: d.summary || "",
      items: (d.items || []).map((it) => {
        const item = { time: it.time || "", text: it.text || "" };
        if (it.kind) item.kind = it.kind;
        if (it.location) item.location = it.location;
        return item;
      }),
    })),
    updatedAt: Date.now(),
  };
}

// 회원 탈퇴. Runs server-side because it has to touch trips the caller can
// no longer edit under the security rules and delete their Auth account.
// For every trip the caller is in:
//   - alone in it            → the trip (and its uploaded photos) is deleted
//   - 방장 with other members → 방장 passes to the earliest-joined remaining
//                               member (memberIds keeps join order)
//   - otherwise              → they're just removed, along with their
//                               review posts and review photos
// then their nickname doc and Auth account are deleted.
exports.deleteAccount = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  }
  const uid = request.auth.uid;
  const bucket = getStorage().bucket();
  const trips = await db.collection("trips").where("memberIds", "array-contains", uid).get();
  let deletedTrips = 0;

  for (const snap of trips.docs) {
    const trip = snap.data();
    const others = (trip.memberIds || []).filter((id) => id !== uid);

    if (others.length === 0) {
      await bucket.deleteFiles({ prefix: `trips/${snap.id}/` }).catch(() => {});
      await snap.ref.delete();
      deletedTrips += 1;
      continue;
    }

    const myReviews = (trip.reviews || []).filter((r) => r.authorId === uid);
    for (const r of myReviews) {
      for (const p of r.photos || []) {
        if (p.path) await bucket.file(p.path).delete().catch(() => {});
      }
    }

    const update = {
      memberIds: FieldValue.arrayRemove(uid),
      [`memberPermissions.${uid}`]: FieldValue.delete(),
    };
    if (myReviews.length) update.reviews = trip.reviews.filter((r) => r.authorId !== uid);
    if (trip.ownerId === uid) {
      update.ownerId = others[0];
      // The new 방장 has every permission anyway; drop their now-moot grants.
      update[`memberPermissions.${others[0]}`] = FieldValue.delete();
    }
    await snap.ref.update(update);
  }

  await db.doc(`users/${uid}`).delete();
  await getAuth().deleteUser(uid);
  return { deletedTrips };
});

// Keeps publicTrips/{publicShareId} in step with the trip: rewritten on
// every trip change while the link is on, removed when the 방장 turns the
// link off (or regenerates it) and when the trip itself is deleted.
exports.syncPublicTrip = onDocumentWritten(
  { document: "trips/{tripId}", database: DATABASE_ID, region: DATABASE_REGION },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const oldId = before?.publicShareId;
    const newId = after?.publicShareId;
    if (oldId && oldId !== newId) await db.doc(`publicTrips/${oldId}`).delete();
    if (newId) await db.doc(`publicTrips/${newId}`).set(publicTripCopy(after));
  }
);

const MODEL = "gemini-3.6-flash";

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("no JSON array found in response");
  return JSON.parse(candidate.slice(start, end + 1));
}

exports.recommendRestaurants = onCall({ secrets: ["GEMINI_API_KEY"], region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  }
  const destination = String(request.data?.destination || "").trim().slice(0, 100);
  const preferences = String(request.data?.preferences || "").trim().slice(0, 200);
  const tripType = request.data?.tripType === "domestic" ? "domestic" : "international";
  if (!destination) {
    throw new HttpsError("invalid-argument", "여행지 정보가 필요해요.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const prompt = `당신은 여행 맛집 추천 전문가입니다. "${destination}"을(를) 여행하는 사람에게 현지 맛집 5곳을 추천해주세요.
반드시 구글 검색으로 실제 존재를 확인한, 지금도 영업 중인 곳만 추천하세요. 지어내지 마세요.
${tripType === "domestic" ? "이 여행은 대한민국 국내 여행입니다. 반드시 대한민국 국내에 위치한 곳만 추천하세요. 해외 지점, 해외 위치는 절대 포함하지 마세요." : ""}
${preferences ? `사용자가 원하는 조건: "${preferences}". 이 조건에 맞는 곳 위주로 추천하세요.` : ""}
아래 JSON 배열 형식으로만 응답하세요. 다른 설명, 인사말, 코드블록 표시 없이 순수 JSON 배열만 출력하세요.
[
  { "name": "가게 이름", "category": "음식 종류", "reason": "한두 문장의 추천 이유", "address": "대략적인 주소나 지역" }
]`;

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
  } catch (err) {
    console.error("Gemini call failed", err);
    throw new HttpsError("internal", "맛집 추천을 가져오지 못했어요.");
  }

  const text = response.text || "";
  try {
    const items = extractJson(text);
    if (!Array.isArray(items) || items.length === 0) throw new Error("empty list");
    return { destination, preferences, tripType, items, generatedAt: Date.now() };
  } catch (err) {
    console.error("Failed to parse Gemini response", err, text);
    throw new HttpsError("internal", "추천 결과를 처리하지 못했어요. 다시 시도해주세요.");
  }
});
