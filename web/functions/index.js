const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");

initializeApp();

// The app's named Firestore database (firebase.json → firestore.database).
const DATABASE_ID = "travelplanner";
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
  };
}

// ---- Link previews (KakaoTalk, Slack, SNS…) ----
// Firebase Hosting routes /share/** and /join/** here (firebase.json) so
// scrapers, which don't run JavaScript, see a title/description for that
// specific trip instead of the generic site card. Everyone else gets the
// exact same app page — only the <!--og:start-->…<!--og:end--> block of the
// deployed index.html is swapped — and installed PWAs never hit this at all
// (their service worker answers navigations from cache).
const SITE_ORIGIN = process.env.FUNCTIONS_EMULATOR === "true"
  ? "http://127.0.0.1:5000" // the local Hosting emulator
  : "https://travel-planner-bb32d.web.app";
const PREVIEW_HOSTS = new Set(["tripplanner.kr", "www.tripplanner.kr", "travel-planner-bb32d.web.app", "travel-planner-bb32d.firebaseapp.com"]);
let shellCache = { html: null, at: 0 };

async function appShell() {
  if (shellCache.html && Date.now() - shellCache.at < 5 * 60 * 1000) return shellCache.html;
  const res = await fetch(`${SITE_ORIGIN}/index.html`, { headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`app shell fetch failed: ${res.status}`);
  shellCache = { html: await res.text(), at: Date.now() };
  return shellCache.html;
}

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function previewBlock({ title, description, url, image }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  return [
    "<!--og:start-->",
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="여행 플래너" />',
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    "<!--og:end-->",
  ].join("\n    ");
}

const tripDates = (t) => [t.startDate, t.endDate].filter(Boolean).join(" ~ ");

async function previewFor(path) {
  const share = path.match(/^\/share\/([0-9a-f]{32})\/?$/);
  if (share) {
    const snap = await db.collection("trips").where("publicShareId", "==", share[1]).limit(1).get();
    if (snap.empty) return null;
    const t = snap.docs[0].data();
    const days = (t.days || []).length;
    return {
      title: `${t.title || "여행"} · 공유 일정`,
      description: [t.destination, tripDates(t), days ? `${days}일 일정` : ""].filter(Boolean).join(" · "),
    };
  }
  // Invite links only reveal what the invite itself implies: the trip's
  // name, where/when, and who's inviting — no members, budget or plans.
  const join = path.match(/^\/join\/([A-Za-z0-9]{10,40})\/?$/);
  if (join) {
    const snap = await db.doc(`trips/${join[1]}`).get();
    if (!snap.exists) return null;
    const t = snap.data();
    const owner = t.ownerId ? await db.doc(`users/${t.ownerId}`).get() : null;
    const nickname = owner?.exists ? owner.data().nickname : "";
    return {
      title: `${nickname || "동행자"}님이 '${t.title || "여행"}'에 초대했어요`,
      description: [t.destination, tripDates(t), "여행 플래너에서 함께 계획해요"].filter(Boolean).join(" · "),
    };
  }
  return null;
}

exports.ogPage = onRequest({ region: "us-central1" }, async (req, res) => {
  const forwarded = String(req.get("x-forwarded-host") || "").split(",")[0].trim();
  const host = PREVIEW_HOSTS.has(forwarded) ? forwarded : "tripplanner.kr";
  const origin = `https://${host}`;
  let html;
  try {
    html = await appShell();
  } catch (err) {
    console.error("ogPage shell", err);
    res.status(503).set("Retry-After", "5").send("잠시 후 다시 시도해주세요.");
    return;
  }
  try {
    const meta = await previewFor(req.path);
    if (meta) {
      html = html.replace(/<!--og:start-->[\s\S]*?<!--og:end-->/, previewBlock({ ...meta, url: origin + req.path, image: `${origin}/og.jpg` }));
    }
  } catch (err) {
    console.error("ogPage preview", err); // fall back to the generic card
  }
  res.set("Cache-Control", "public, max-age=0, s-maxage=300");
  res.status(200).send(html);
});

// Client-side error reports (src/lib/errorReporting.js). Written to Cloud
// Logging as structured entries, readable with
//   npx firebase-tools@13 functions:log --only logClientError
// Callable signed out too (errors can happen before login); every field is
// truncated and each server instance drops floods from a single caller.
const recentReports = new Map(); // caller → { windowStart, count }
exports.logClientError = onCall({ region: "us-central1" }, async (request) => {
  const caller = request.auth?.uid || request.rawRequest?.ip || "anon";
  const now = Date.now();
  const entry = recentReports.get(caller);
  if (!entry || now - entry.windowStart > 60_000) recentReports.set(caller, { windowStart: now, count: 1 });
  else if (++entry.count > 10) return { dropped: true };
  if (recentReports.size > 5000) recentReports.clear();

  const cut = (v, n) => String(v ?? "").slice(0, n);
  const d = request.data || {};
  console.error(JSON.stringify({
    severity: "ERROR",
    message: `[client] ${cut(d.message, 300)}`,
    where: cut(d.where, 80),
    name: cut(d.name, 80),
    code: cut(d.code, 80),
    stack: cut(d.stack, 3000),
    url: cut(d.url, 300),
    userAgent: cut(d.userAgent, 300),
    release: cut(d.release, 40),
    uid: request.auth?.uid || null,
  }));
  return { ok: true };
});

// /share/:shareId — looks the trip up by its public link id on every view
// and returns just the itinerary. Callable without sign-in; the id is a
// random 32-hex string only the 방장 hands out, and turning the link off
// (clearing publicShareId) makes it stop resolving immediately.
exports.getPublicTrip = onCall({ region: "us-central1" }, async (request) => {
  const shareId = String(request.data?.shareId || "");
  if (!/^[0-9a-f]{32}$/.test(shareId)) {
    throw new HttpsError("not-found", "공유가 중지됐거나 없는 링크예요.");
  }
  const snap = await db.collection("trips").where("publicShareId", "==", shareId).limit(1).get();
  if (snap.empty) {
    throw new HttpsError("not-found", "공유가 중지됐거나 없는 링크예요.");
  }
  return publicTripCopy(snap.docs[0].data());
});

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
    const myEntry = trip.reviewsBy?.[uid];
    if (myEntry) myReviews.push(myEntry);
    for (const r of myReviews) {
      for (const p of r.photos || []) {
        if (p.path) await bucket.file(p.path).delete().catch(() => {});
      }
    }

    const update = {
      memberIds: FieldValue.arrayRemove(uid),
      [`memberPermissions.${uid}`]: FieldValue.delete(),
    };
    if ((trip.reviews || []).some((r) => r.authorId === uid)) update.reviews = trip.reviews.filter((r) => r.authorId !== uid);
    if (myEntry) update[`reviewsBy.${uid}`] = FieldValue.delete();
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

const MODEL = "gemini-3.6-flash";

// Each Gemini call is billed, and any signed-in user can call the function
// directly, so cap it per user per (Korean) calendar day. Counted in
// aiUsage/{uid} — no client rule matches that collection, so only this
// function (Admin SDK) can read or write it.
const DAILY_AI_LIMIT = 20;

async function consumeDailyAiQuota(uid) {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST
  const ref = db.doc(`aiUsage/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists && snap.data().day === today ? snap.data().count || 0 : 0;
    if (used >= DAILY_AI_LIMIT) {
      throw new HttpsError("resource-exhausted", `오늘 맛집 추천은 ${DAILY_AI_LIMIT}번까지 받을 수 있어요. 내일 다시 시도해주세요.`);
    }
    tx.set(ref, { day: today, count: used + 1, updatedAt: Date.now() });
  });
}

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

  await consumeDailyAiQuota(request.auth.uid);

  // Required here, not at the top: every function shares this file, and
  // loading the AI SDK slowed every cold start (sign-in included).
  const { GoogleGenAI } = require("@google/genai");
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
    // A failed call isn't billed, so it shouldn't use up the user's quota.
    await db.doc(`aiUsage/${request.auth.uid}`).update({ count: FieldValue.increment(-1) }).catch(() => {});
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

// ---- Kakao sign-in for the Android/iOS app ----------------------------------
// The website signs in with Kakao through Firebase's own popup flow. In the
// app that flow breaks: Kakao's mobile login hops out to the KakaoTalk app
// and comes back in a different browser tab, which loses the flow's state.
// So the app runs a plain OAuth code flow instead:
//   1. the app opens Kakao's login page in the browser with a random `state`
//   2. Kakao redirects here (KAKAO_REDIRECT_URI) with a
//      code, which is swapped for tokens — including Kakao's OIDC id_token
//   3. the id_token is parked under that `state` for a few minutes and the
//      browser is sent back into the app (kr.tripplanner.app://auth/kakao)
//   4. the app claims it once (claimKakaoLogin) and signs in to Firebase with
//      it as an oidc.kakao credential — the same account as on the website.
// Uses the REST API key the Firebase oidc.kakao provider is configured with,
// so the id_token's audience matches what Firebase checks. These two run in
// Seoul, next to the Firestore database and Kakao's servers — in us-central1
// every step crossed the Pacific and sign-in took seconds longer.
const { defineSecret } = require("firebase-functions/params");
const KAKAO_CLIENT_SECRET = defineSecret("KAKAO_CLIENT_SECRET");
const KAKAO_REST_KEY = "ff139dec181f0ffcdd2d64bad5987cba";
// The function's own address, not tripplanner.kr/...: a browser that has
// visited the website has its service worker, which would answer that path
// with the web app itself instead of letting the request reach the function.
const KAKAO_REGION = "asia-northeast3";
const KAKAO_REDIRECT_URI = "https://asia-northeast3-travel-planner-bb32d.cloudfunctions.net/kakaoCallback";
const APP_RETURN_URL = "kr.tripplanner.app://auth/kakao";
const HANDOFF_TTL_MS = 5 * 60 * 1000;
const handoffs = () => db.collection("kakaoLoginHandoff"); // server-only (no rules match)

exports.kakaoCallback = onRequest({ region: KAKAO_REGION, secrets: [KAKAO_CLIENT_SECRET] }, async (req, res) => {
  // The app pings this when the user taps the Kakao button, so an instance
  // is already up by the time Kakao redirects here.
  if (req.query.warm) return res.status(204).end();
  const state = String(req.query.state || "");
  const code = String(req.query.code || "");
  const back = (result) => res.redirect(302, `${APP_RETURN_URL}?result=${result}`);
  if (!/^[0-9a-f]{40}$/.test(state)) return res.status(400).send("잘못된 요청이에요.");
  if (!code) return back(req.query.error === "access_denied" ? "cancelled" : "failed");
  try {
    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: KAKAO_REST_KEY,
        client_secret: KAKAO_CLIENT_SECRET.value().trim(),
        redirect_uri: KAKAO_REDIRECT_URI,
        code,
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.id_token) {
      console.error("kakao token exchange failed", tokenRes.status, tokens.error, tokens.error_description);
      return back("failed");
    }
    await handoffs().doc(state).set({ idToken: tokens.id_token, createdAt: Date.now() });
    return back("ok");
  } catch (err) {
    console.error("kakao callback error", err);
    return back("failed");
  }
});

exports.claimKakaoLogin = onCall({ region: KAKAO_REGION }, async (request) => {
  if (request.data?.warm) return { ok: true }; // see kakaoCallback
  const state = String(request.data?.state || "");
  if (!/^[0-9a-f]{40}$/.test(state)) throw new HttpsError("invalid-argument", "잘못된 요청이에요.");
  const ref = handoffs().doc(state);
  // Alongside the claim (not on the redirect path): drop handoffs nobody
  // came back for.
  const cleanup = handoffs().where("createdAt", "<", Date.now() - HANDOFF_TTL_MS).limit(50).get()
    .then((stale) => Promise.all(stale.docs.map((d) => d.ref.delete())))
    .catch((err) => console.error("handoff cleanup failed", err));
  const idToken = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref);
    const { idToken, createdAt } = snap.data();
    return Date.now() - createdAt <= HANDOFF_TTL_MS ? idToken : null;
  });
  await cleanup;
  if (!idToken) throw new HttpsError("not-found", "로그인 정보가 없거나 만료됐어요. 다시 시도해주세요.");
  return { idToken };
});
