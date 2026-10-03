// Suite 5 — public link + link previews, AI restaurants, reviews & photos,
// account deletion, PWA/hosting, offline behaviour.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { BASE, HOSTING, PROJECT, launch, newUserPage, tc, assert, wait, waitFor, text, click, fill, submitModal, modalOpen, modalText, shot, signInAs, fsGet, fsSet, fsList, isoDay } from "./h.mjs";

const browser = await launch();
const stamp = Date.now();
const O = `po${stamp}`, B = `pb${stamp}`;
const TRIP_ID = `pub${stamp}`, PAST_ID = `past${stamp}`;
const A1 = "공개 링크·미리보기", A2 = "AI 맛집 추천", A3 = "후기·사진", A4 = "회원 탈퇴", A5 = "앱 설치·호스팅", A6 = "오프라인·네트워크";

await fsSet(`trips/${TRIP_ID}`, {
  ownerId: O, memberIds: [O, B], title: `E2E "공개" <b>여행</b> & 테스트`, destination: "오사카시, 일본 오사카부", tripType: "international",
  startDate: isoDay(10), endDate: isoDay(12), travelers: 2, budgetTotal: 500000,
  days: [
    { date: isoDay(10), status: "confirmed", summary: "도착", items: [{ kind: "time", time: "14:00", text: "간사이 공항 도착", location: { lat: 34.4347, lng: 135.244, address: "Kansai Airport" } }] },
    { date: isoDay(11), status: "open", summary: "", items: [] },
  ],
  checklist: [{ id: "x1", text: "비밀준비물" }], budgetItems: [{ category: "비밀지출", amount: 777777, paidBy: O }],
  bookings: [{ type: "숙소", name: "비밀호텔", confirmNumber: "SECRET-999", link: "", memo: "" }],
  memberPermissions: {},
});
await fsSet(`trips/${PAST_ID}`, {
  ownerId: O, memberIds: [O, B], title: "E2E 지난 여행", destination: "부산", tripType: "domestic",
  startDate: isoDay(-10), endDate: isoDay(-8), travelers: 2, budgetTotal: 0, days: [], checklist: [], budgetItems: [], bookings: [],
});

const po = await newUserPage(browser);
const pb = await newUserPage(browser);
await signInAs(po, O, "민수");
await signInAs(pb, B, "지은");
const openTrip = async (p, id, tabKey = "itinerary") => { await p.goto(`${BASE}/trip/${id}/${tabKey}`, { waitUntil: "domcontentloaded" }); await waitFor(p, () => !!document.querySelector(".tabbar"), { label: "trip", timeout: 15000 }); await wait(700); };

// ---- public link -----------------------------------------------------------
let shareUrl = "";
await tc("P-01", A1, "공개 링크 만들기",
  "방장: '🔗 공개 링크' → '공개 링크 만들기'",
  "링크(/share/…)가 표시되고 버튼에 '(켜짐)' 표시",
  async () => {
    await openTrip(po, TRIP_ID);
    await click(po, ".trip-actions button", "공개 링크");
    await click(po, ".modal button", "공개 링크 만들기");
    await waitFor(po, () => document.querySelector(".modal input[readonly]")?.value.includes("/share/"), { label: "share url", timeout: 8000 });
    shareUrl = await po.$eval(".modal input[readonly]", (i) => i.value);
    await click(po, ".modal button", "닫기", { exact: true });
    const btn = await po.evaluate(() => [...document.querySelectorAll(".trip-actions button")].find((b) => b.innerText.includes("공개 링크")).innerText);
    assert(btn.includes("켜짐"), btn);
    return `링크 ${shareUrl}, 버튼 "${btn}"`;
  });

await tc("P-02", A1, "로그인 없이 공개 링크 열기 — 공개 범위",
  "로그인하지 않은 새 브라우저로 공개 링크 접속",
  "일정(날짜·항목)만 보이고 예산·예약번호·체크리스트·동행자 정보는 보이지 않음",
  async () => {
    const p = await newUserPage(browser);
    await p.goto(shareUrl, { waitUntil: "domcontentloaded" });
    await waitFor(p, () => document.body.innerText.includes("간사이 공항 도착"), { label: "public view", timeout: 15000 });
    const body = await text(p);
    const leaks = ["비밀지출", "777,777", "SECRET-999", "비밀호텔", "비밀준비물", "민수", "지은"].filter((s) => body.includes(s));
    const titleOk = body.includes(`E2E "공개" <b>여행</b> & 테스트`);
    await shot(p, "public-view");
    await p.browserContext().close();
    assert(!leaks.length && titleOk, `노출: ${leaks.join(",")} titleOk=${titleOk}`);
    return "일정·제목(특수문자 그대로)만 표시, 비공개 정보 노출 없음";
  });

await tc("P-03", A1, "공개 링크 서버 응답에 비공개 필드가 포함되는지",
  "getPublicTrip 함수를 직접 호출해 응답 필드 확인",
  "응답에 memberIds·budgetItems·bookings·checklist 등이 없음",
  async () => {
    const shareId = shareUrl.split("/share/")[1];
    const r = await fetch(`http://127.0.0.1:5001/${PROJECT}/us-central1/getPublicTrip`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { shareId } }) });
    const j = await r.json();
    const keys = Object.keys(j.result || {});
    const bad = keys.filter((k) => /member|budget|booking|checklist|owner|review/i.test(k));
    assert(!bad.length, bad.join(","));
    return `응답 필드: ${keys.join(", ")}`;
  });

await tc("P-04", A1, "링크 미리보기(카카오톡 등) — 공개 링크 / 초대 링크",
  "호스팅 에뮬레이터로 /share/<id>, /join/<id> 요청 후 og 태그 확인",
  "여행 제목이 들어간 og:title/description, 특수문자는 안전하게 이스케이프",
  async () => {
    const shareId = shareUrl.split("/share/")[1];
    const out = [];
    for (const path of [`/share/${shareId}`, `/join/${TRIP_ID}`]) {
      const html = await (await fetch(HOSTING + path)).text();
      const title = html.match(/property="og:title" content="([^"]*)"/)?.[1];
      const desc = html.match(/property="og:description" content="([^"]*)"/)?.[1];
      const raw = html.includes("<b>여행</b>");
      assert(title && title.includes("공개") && !raw, `${path}: ${title} raw=${raw}`);
      out.push(`${path.split("/")[1]}: "${title}" / "${desc}"`);
    }
    return out.join(" || ");
  });

await tc("P-05", A1, "공개 링크 끄기",
  "방장: '공개 링크' → '링크 끄기' → 기존 링크 새로 열기",
  "기존 링크 접속 시 '공유가 중지됐거나 없는 링크' 안내",
  async () => {
    await click(po, ".trip-actions button", "공개 링크");
    await click(po, ".modal button", "링크 끄기");
    await waitFor(po, () => [...document.querySelectorAll(".modal button")].some((b) => b.innerText.includes("공개 링크 만들기")), { label: "turned off" });
    await click(po, ".modal button", "닫기", { exact: true });
    const p = await newUserPage(browser);
    await p.goto(shareUrl, { waitUntil: "domcontentloaded" });
    await wait(4000);
    const body = await text(p);
    await p.browserContext().close();
    assert(/중지|없는 링크|찾을 수 없/.test(body), body.slice(0, 120));
    return `기존 링크 화면: "${body.split("\n").find((l) => /중지|없는|찾을/.test(l))}"`;
  });

// ---- AI restaurants ----------------------------------------------------------
let recOk = false;
await tc("R-00", A2, "AI 호출이 실패했을 때 (테스트 환경의 AI 키가 무효라 실제로 실패)",
  "지은: '맛집 추천' → '맛집 추천 받기' (로컬 AI 키 무효 상태)",
  "실패 안내가 표시되고, 실패한 호출은 하루 사용량에서 차감되지 않음",
  async () => {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    await fsSet(`aiUsage/${B}`, { day: today, count: 3 });
    await openTrip(pb, TRIP_ID, "restaurants");
    await click(pb, "button", "맛집 추천 받기");
    await waitFor(pb, () => !!document.querySelector(".note"), { label: "error note", timeout: 60000 });
    const m = await text(pb, ".note");
    const u = await fsGet(`aiUsage/${B}`);
    assert(u.count === 3, "count " + u.count);
    return { actual: `안내 "${m}", 사용량 ${u.count}회 그대로(환불됨)`, status: /\[\d+\]/.test(m) ? "WARN" : "PASS", note: /\[\d+\]/.test(m) ? "실패 안내 끝에 '[500]' 같은 오류 코드가 그대로 보임" : "" };
  });

await tc("R-04", A2, "하루 사용량(20회) 초과",
  "지은의 오늘 사용량을 20으로 설정 → 맛집 추천 받기",
  "'오늘 맛집 추천은 20번까지…' 안내, AI 호출 안 됨",
  async () => {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    await fsSet(`aiUsage/${B}`, { day: today, count: 20 });
    await openTrip(pb, TRIP_ID, "restaurants");
    await click(pb, "button", "맛집 추천 받기");
    await waitFor(pb, () => !!document.querySelector(".note"), { label: "quota msg", timeout: 20000 });
    const m = await text(pb, ".note");
    const u = await fsGet(`aiUsage/${B}`);
    assert(m.includes("20번") && u.count === 20, m + " / " + u.count);
    return `안내: "${m}" / 사용량 그대로 ${u.count}`;
  });

// The emulator's Gemini key is invalid, so the rest of the flow runs on a
// realistic stubbed function response (the Places lookup stays real).
const FAKE_RECS = {
  destination: "오사카시, 일본 오사카부", preferences: "라멘", tripType: "international", generatedAt: Date.now(),
  items: [
    { name: "이치란 라멘 도톤보리점", category: "라멘", reason: "24시간 영업하는 돈코츠 라멘 전문점", address: "일본 오사카부 오사카시 주오구 도톤보리 1-4-16" },
    { name: "쿠시카츠 다루마 신세카이 총본점", category: "쿠시카츠", reason: "오사카 명물 꼬치튀김 원조집", address: "일본 오사카부 오사카시 나니와구 에비스히가시 2-3-9" },
    { name: "혼케 오타코", category: "타코야키", reason: "도톤보리 대표 타코야키 노점", address: "일본 오사카부 오사카시 주오구 난바 1-4-12" },
  ],
};
async function stubRecs(page) {
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.url().includes("/recommendRestaurants") && req.method() === "POST") {
      req.respond({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ result: { ...FAKE_RECS, generatedAt: Date.now() } }) });
    } else if (req.url().includes("/recommendRestaurants") && req.method() === "OPTIONS") {
      req.respond({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST" } });
    } else req.continue();
  });
}
await stubRecs(pb);
await stubRecs(po);

await tc("R-01", A2, "AI 맛집 추천 결과 표시 (AI 응답은 모의 데이터)",
  "지은(권한 없는 동행자): '맛집 추천' 탭 → 조건 '라멘' 입력 → '맛집 추천 받기'",
  "로딩 표시 후 식당 카드 여러 개(이름·설명·주소) 표시",
  async () => {
    await openTrip(pb, TRIP_ID, "restaurants");
    await pb.type("input[placeholder*='가성비']", "라멘");
    const t0 = Date.now();
    await click(pb, "button", "맛집 추천 받기");
    const loading = await pb.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.innerText.includes("추천 받는 중")));
    await waitFor(pb, () => document.querySelectorAll(".food-card").length > 0 || !!document.querySelector(".note"), { label: "recs", timeout: 120000, interval: 1000 });
    const r = await pb.evaluate(() => ({ cards: [...document.querySelectorAll(".food-card")].map((c) => c.querySelector(".food-card-name")?.innerText), err: document.querySelector(".note")?.innerText, addBtn: [...document.querySelectorAll(".food-card button")].length }));
    assert(r.cards.length > 0, r.err || "no cards");
    recOk = true;
    return `로딩 표시 ${loading ? "O" : "X"}, ${((Date.now() - t0) / 1000).toFixed(0)}초 후 ${r.cards.length}곳: ${r.cards.slice(0, 4).join(", ")}… / 권한 없는 지은에게 '일정에 추가' 버튼 ${r.addBtn}개`;
  });

await tc("R-02", A2, "추천 식당을 일정에 추가 (방장)",
  "방장: 맛집 추천 받기 → 첫 식당 '📅 일정에 추가' → 위치 자동 찾기 확인 → 둘째 날 선택 → 추가",
  "위치가 자동으로 채워지고 선택한 날에 '식사' 항목으로 저장, 카드에 '✓ … 일정에 추가됨'",
  async () => {
    if (!recOk) return { actual: "R-01 실패로 건너뜀", status: "SKIP" };
    await openTrip(po, TRIP_ID, "restaurants");
    await click(po, "button", "맛집 추천 받기");
    await waitFor(po, () => document.querySelectorAll(".food-card button").length > 0, { label: "O recs", timeout: 120000, interval: 1000 });
    const name = await po.evaluate(() => document.querySelector(".food-card .food-card-name").innerText);
    await click(po, ".food-card button", "일정에 추가");
    await waitFor(po, () => !!document.querySelector(".modal select[name=dayIdx]"), { label: "restaurant form", timeout: 20000 });
    const notice = await po.evaluate(() => document.querySelector(".modal p")?.innerText || "");
    await fill(po, { dayIdx: "1" });
    await submitModal(po);
    await wait(1500);
    const t = await fsGet(`trips/${TRIP_ID}`);
    const it = t.days[1].items.find((i) => i.restaurant === name);
    const mark = await po.evaluate(() => document.querySelector(".food-card .section-note")?.innerText || "");
    assert(it && mark.includes("일정에 추가됨"), JSON.stringify({ it, mark }));
    return `"${name}" → 둘째 날 [${it.time}] ${it.text}${it.location ? ` (위치 저장됨)` : " (위치 없음)"} / 안내: "${notice}" / 표시: "${mark}"`;
  });

await tc("R-03", A2, "탭을 벗어났다 돌아와도 추천 결과 유지",
  "추천 결과가 있는 상태에서 '일정' 탭 → 다시 '맛집 추천' 탭",
  "마지막 추천 결과가 그대로 보임 (이 브라우저에 여행별로 보관)",
  async () => {
    if (!recOk) return { actual: "R-01 실패로 건너뜀", status: "SKIP" };
    const tabs = async (n) => { for (const t of await po.$$(".tab")) if ((await t.evaluate((e) => e.innerText.trim())) === n) { await t.click(); break; } await wait(500); };
    await tabs("일정"); await tabs("맛집 추천");
    const cards = await po.evaluate(() => document.querySelectorAll(".food-card").length);
    assert(cards > 0, String(cards));
    return `추천 카드 ${cards}개 그대로 표시`;
  });

// ---- review & photos ---------------------------------------------------------
const png = fileURLToPath(new URL("./shots/public-view.png", import.meta.url));
const txtFile = fileURLToPath(new URL("./shots/not-image.txt", import.meta.url));
const bigFile = fileURLToPath(new URL("./shots/big.png", import.meta.url));
fs.writeFileSync(txtFile, "hello");
fs.writeFileSync(bigFile, Buffer.alloc(11 * 1024 * 1024, 7));

await tc("V-01", A3, "끝나지 않은 여행의 후기 탭",
  "진행 예정 여행의 '후기 🔒' 탭 확인",
  "탭이 잠겨 있고 '아직 완료되지 않은 일정입니다' 안내",
  async () => {
    await openTrip(po, TRIP_ID);
    const r = await po.evaluate(() => { const b = [...document.querySelectorAll(".tab")].find((t) => t.innerText.includes("후기")); return { label: b.innerText, disabled: b.disabled, tip: document.querySelector(".tooltip")?.innerText }; });
    assert(r.disabled && r.label.includes("🔒"), JSON.stringify(r));
    return `탭 "${r.label}" 비활성, 안내 "${r.tip}"`;
  });

await tc("V-02", A3, "후기 작성 + 사진 업로드 + 다른 동행자에게 보임",
  "지난 여행 → 후기 탭 → '후기 작성' → 사진 추가(PNG)",
  "후기와 사진이 저장되고 지은 화면에도 표시",
  async () => {
    await openTrip(po, PAST_ID, "review");
    await click(po, "button", "후기 작성");
    await fill(po, { text: "정말 즐거웠던 부산 여행!" });
    await submitModal(po);
    await waitFor(po, () => !!document.querySelector("input[type=file]"), { label: "photo input" });
    const input = await po.$("input[type=file]");
    await input.uploadFile(png);
    await waitFor(po, () => document.querySelectorAll(".photo-thumb img").length > 0, { label: "photo shown", timeout: 20000 });
    await openTrip(pb, PAST_ID, "review");
    await waitFor(pb, () => document.querySelectorAll(".photo-thumb img").length > 0 && document.body.innerText.includes("정말 즐거웠던"), { label: "B sees review", timeout: 10000 });
    const bDel = await pb.evaluate(() => document.querySelectorAll(".photo-del").length);
    const loaded = await pb.evaluate(() => { const i = document.querySelector(".photo-thumb img"); return i.complete && i.naturalWidth > 0; });
    assert(bDel === 0 && loaded, JSON.stringify({ bDel, loaded }));
    return "후기·사진 저장, 지은 화면에 표시(사진 로드됨), 지은에게는 삭제 버튼 없음";
  });

await tc("V-03", A3, "이미지가 아닌 파일 업로드",
  "사진 추가에 .txt 파일 선택",
  "업로드 거절 + 이해할 수 있는 안내",
  async () => {
    const input = await po.$("input[type=file]");
    await input.uploadFile(txtFile);
    await wait(4000);
    const m = await po.evaluate(() => [...document.querySelectorAll(".note")].map((n) => n.innerText).join(" "));
    const friendly = m && !/storage\/|Firebase|unauthorized/i.test(m);
    return { actual: m ? `안내: "${m}"` : "아무 안내 없음", status: m ? (friendly ? "PASS" : "WARN") : "FAIL", note: friendly ? "" : "업로드 실패 안내에 'Firebase Storage: … (storage/unauthorized)' 같은 기술 메시지가 그대로 노출됨" };
  });

await tc("V-04", A3, "10MB 넘는 사진 업로드",
  "11MB 파일 업로드",
  "용량 초과 안내",
  async () => {
    const input = await po.$("input[type=file]");
    await input.uploadFile(bigFile);
    await wait(6000);
    const m = await po.evaluate(() => [...document.querySelectorAll(".note")].map((n) => n.innerText).join(" "));
    const says = /10MB|용량|크기/.test(m);
    return { actual: m ? `안내: "${m}"` : "아무 안내 없음", status: says ? "PASS" : "WARN", note: says ? "" : "용량 제한(10MB)을 넘으면 원인을 알려주지 않고 일반 오류만 표시 — 업로드 전에 크기를 확인해 안내하는 게 좋음" };
  });

await tc("V-06", A3, "아주 큰 실제 사진(3000x3000, 20MB 이상) 업로드",
  "노이즈로 채운 3000x3000 PNG(압축이 거의 안 되는 큰 사진) 업로드",
  "올리기 전에 자동으로 줄여서 10MB 제한 안에서 업로드 성공",
  async () => {
    const bigReal = fileURLToPath(new URL("./shots/big-real.png", import.meta.url));
    const dataUrl = await po.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 3000; c.height = 3000;
      const ctx = c.getContext("2d"); const img = ctx.createImageData(3000, 3000);
      for (let i = 0; i < img.data.length; i += 4) { img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255; img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255; }
      ctx.putImageData(img, 0, 0);
      return c.toDataURL("image/png");
    });
    fs.writeFileSync(bigReal, Buffer.from(dataUrl.split(",")[1], "base64"));
    const mb = (fs.statSync(bigReal).size / 1024 / 1024).toFixed(1);
    const before = (await fsGet(`trips/${PAST_ID}`)).reviewsBy[O].photos.length;
    const input = await po.$("input[type=file]");
    await input.uploadFile(bigReal);
    await waitFor(po, async () => true, { timeout: 1 });
    const end = Date.now() + 60000;
    let after = before;
    while (Date.now() < end && after === before) { await wait(1000); after = ((await fsGet(`trips/${PAST_ID}`)).reviewsBy[O].photos || []).length; }
    const note = await po.evaluate(() => [...document.querySelectorAll(".note")].map((n) => n.innerText).join(" "));
    assert(after === before + 1, `원본 ${mb}MB, 업로드 안 됨: ${note}`);
    return `원본 ${mb}MB → 자동으로 줄여서 업로드 성공`;
  });

await tc("V-05", A3, "사진 삭제 / 후기 삭제",
  "내 사진의 ✕ → 후기 '삭제' → 확인",
  "사진·후기가 사라지고 저장소에서도 파일 삭제",
  async () => {
    const before = await fsGet(`trips/${PAST_ID}`);
    const path = before.reviewsBy[O].photos[0].path;
    await po.evaluate(() => document.querySelector(".photo-del").click());
    await wait(1500);
    const exists = await fetch(`http://127.0.0.1:9399/v0/b/${PROJECT}.appspot.com/o/${encodeURIComponent(path)}`, { headers: { Authorization: "Bearer owner" } }).then((r) => r.status).catch(() => 0);
    const exists2 = await fetch(`http://127.0.0.1:9399/v0/b/${PROJECT}.firebasestorage.app/o/${encodeURIComponent(path)}`, { headers: { Authorization: "Bearer owner" } }).then((r) => r.status).catch(() => 0);
    await click(po, ".card button", "삭제", { exact: true });
    await click(po, ".modal button", "삭제", { exact: true });
    await wait(1200);
    const t = await fsGet(`trips/${PAST_ID}`);
    assert(t.reviewsBy?.[O]?.deleted === true && exists !== 200 && exists2 !== 200, JSON.stringify({ reviews: t.reviews, exists, exists2 }));
    return `사진 파일 삭제 확인(저장소 응답 ${exists}/${exists2}), 후기 삭제`;
  });

await tc("V-07", A3, "예전 방식으로 저장된 후기 표시·수정 (데이터 이전)",
  "예전 공용 목록에 민수·지은 후기가 있는 여행 → 후기 탭 확인 → 민수가 자기 후기 수정",
  "두 후기가 모두 보이고, 민수 수정 후에도 중복 없이 2개, 지은 후기에는 민수의 수정·삭제 버튼 없음",
  async () => {
    const LEG = `legacy${stamp}`;
    await fsSet(`trips/${LEG}`, { ownerId: O, memberIds: [O, B], title: "E2E 옛 후기", destination: "부산", tripType: "domestic", startDate: isoDay(-20), endDate: isoDay(-18), days: [],
      reviews: [{ authorId: O, text: "민수 옛 후기", photos: [], updatedAt: 1 }, { authorId: B, text: "지은 옛 후기", photos: [], updatedAt: 2 }] });
    await openTrip(po, LEG, "review");
    const before = await po.evaluate(() => [...document.querySelectorAll(".review-text")].map((e) => e.innerText));
    await click(po, "button", "내 후기 수정");
    await fill(po, { text: "민수 새 후기" });
    await submitModal(po);
    await wait(1200);
    const after = await po.evaluate(() => [...document.querySelectorAll(".review-text")].map((e) => e.innerText));
    const delBtns = await po.evaluate(() => [...document.querySelectorAll(".card")].filter((c) => c.innerText.includes("지은 옛 후기")).map((c) => c.querySelectorAll("button").length)[0]);
    const t = await fsGet(`trips/${LEG}`);
    assert(before.length === 2 && after.length === 2 && after.includes("민수 새 후기") && after.includes("지은 옛 후기") && delBtns === 0 && t.reviewsBy?.[O]?.text === "민수 새 후기" && t.reviews.length === 2, JSON.stringify({ before, after, delBtns, by: t.reviewsBy }));
    return `수정 전 ${before.join(" / ")} → 수정 후 ${after.join(" / ")} (새 방식으로 이전, 옛 목록은 그대로)`;
  });

// ---- account deletion ----------------------------------------------------------
await tc("X-01", A4, "회원 탈퇴 — '탈퇴' 입력 확인",
  "지은: 하단 '회원 탈퇴' → 아무것도 입력하지 않은 상태 / '탈퇴' 입력 상태의 버튼 확인",
  "'탈퇴'를 입력해야만 버튼이 활성화",
  async () => {
    await pb.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await click(pb, "footer button", "회원 탈퇴");
    await waitFor(pb, () => [...document.querySelectorAll(".modal button")].some((b) => b.innerText.includes("탈퇴하기")), { label: "delete form" });
    const d1 = await pb.evaluate(() => [...document.querySelectorAll(".modal button")].find((b) => b.innerText.includes("탈퇴하기")).disabled);
    await pb.type(".modal input", "탈퇴");
    const d2 = await pb.evaluate(() => [...document.querySelectorAll(".modal button")].find((b) => b.innerText.includes("탈퇴하기")).disabled);
    assert(d1 && !d2, `${d1}/${d2}`);
    return "입력 전 비활성 → '탈퇴' 입력 후 활성";
  });

await tc("X-02", A4, "회원 탈퇴 실행 — 데이터 정리",
  "지은이 혼자 쓰는 여행 1개 + 방장인 공유 여행 1개(민수 참여) + 참여 중 여행(후기 포함) 상태에서 탈퇴",
  "혼자 여행 삭제, 공유 여행은 민수에게 방장 위임, 참여 여행에서 빠지고 후기 삭제, 닉네임·계정 삭제, 랜딩으로 이동",
  async () => {
    await fsSet(`trips/solo${stamp}`, { ownerId: B, memberIds: [B], title: "지은 혼자", startDate: isoDay(5), endDate: isoDay(6), days: [] });
    await fsSet(`trips/owned${stamp}`, { ownerId: B, memberIds: [B, O], title: "지은 방장", startDate: isoDay(5), endDate: isoDay(6), days: [] });
    await fsSet(`trips/${PAST_ID}?updateMask.fieldPaths=reviews&updateMask.fieldPaths=reviewsBy`, { reviews: [{ authorId: B, text: "지은 옛 후기", photos: [], updatedAt: Date.now() }], reviewsBy: { [B]: { text: "지은 후기", photos: [], updatedAt: Date.now() } } });
    await click(pb, ".modal button", "탈퇴하기");
    await waitFor(pb, () => !!document.querySelector(".lp"), { label: "landing after delete", timeout: 30000 });
    const solo = await fsGet(`trips/solo${stamp}`);
    const owned = await fsGet(`trips/owned${stamp}`);
    const past = await fsGet(`trips/${PAST_ID}`);
    const user = await fsGet(`users/${B}`);
    const acct = await (await fetch(`http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ localId: [B] }) })).json();
    const r = { soloDeleted: !solo, ownedOwner: owned?.ownerId === O && !owned.memberIds.includes(B), pastLeft: !past.memberIds.includes(B), reviewGone: !(past.reviews || []).some((x) => x.authorId === B) && !(past.reviewsBy || {})[B], userDeleted: !user, authDeleted: !(acct.users || []).length };
    assert(Object.values(r).every(Boolean), JSON.stringify(r));
    return "혼자 여행 삭제 · 방장 위임 · 참여 여행 탈퇴 · 후기 삭제 · 닉네임/계정 삭제 모두 확인";
  });

// ---- offline -----------------------------------------------------------------
await tc("N-01", A6, "인터넷이 끊긴 상태에서 지출 추가",
  "민수: 예산 탭 → 네트워크 끊기 → '+ 항목 추가' 후 저장 → 10초 관찰 → 다시 연결",
  "저장할 수 없다는 안내가 나오거나, 연결 후 저장되어야 함",
  async () => {
    await openTrip(po, TRIP_ID, "budget");
    await po.setOfflineMode(true);
    await click(po, "button", "+ 항목 추가");
    await fill(po, { category: "오프라인지출", amount: "1234" });
    await submitModal(po);
    await wait(10000);
    const r = await po.evaluate(() => ({ modal: !!document.querySelector(".modal"), note: [...document.querySelectorAll(".modal .note, .note")].map((n) => n.innerText).join(" ") }));
    await po.setOfflineMode(false);
    await wait(8000);
    const t = await fsGet(`trips/${TRIP_ID}`);
    const saved = t.budgetItems.some((i) => i.category === "오프라인지출");
    const modalAfter = await modalOpen(po);
    if (modalAfter) await click(po, ".modal button", "취소", { exact: true }).catch(() => {});
    const bad = r.modal && !r.note && !saved;
    return { actual: `오프라인 10초: 입력창 ${r.modal ? "열린 채" : "닫힘"}, 안내 ${r.note ? `"${r.note}"` : "없음"} / 재연결 후 저장 ${saved ? "됨" : "안 됨"}, 입력창 ${modalAfter ? "여전히 열림" : "닫힘"}`, status: bad || (!saved && !r.note) ? "WARN" : "PASS", note: bad || (!saved && !r.note) ? "오프라인에서 저장을 누르면 아무 안내 없이 창이 그대로 멈춰 있음 — 연결 끊김 안내 필요" : "" };
  });

await tc("N-02", A6, "오프라인에서 체크리스트 체크",
  "네트워크 끊고 체크리스트 체크 → 다시 연결",
  "화면에 바로 체크되고, 연결 후 서버에 저장",
  async () => {
    await openTrip(po, TRIP_ID, "checklist");
    await po.setOfflineMode(true);
    await po.evaluate(() => document.querySelector(".box-btn").click());
    await wait(1000);
    const shown = await po.evaluate(() => document.querySelector(".check-item").classList.contains("done"));
    await po.setOfflineMode(false);
    await wait(6000);
    const t = await fsGet(`trips/${TRIP_ID}`);
    const saved = t.checklistDone?.x1 === true;
    assert(shown && saved, JSON.stringify({ shown, saved }));
    return "오프라인에서 즉시 체크 표시 → 재연결 후 저장됨";
  });

// ---- PWA / hosting -------------------------------------------------------------
await tc("W-01", A5, "앱처럼 설치 — 매니페스트·아이콘",
  "배포 빌드(호스팅 에뮬레이터)에서 manifest.webmanifest 확인",
  "앱 이름·아이콘(192/512)·standalone 표시 방식이 정의됨",
  async () => {
    const html = await (await fetch(HOSTING + "/")).text();
    const href = html.match(/rel="manifest" href="([^"]+)"/)?.[1];
    const m = await (await fetch(HOSTING + "/" + href.replace(/^\//, ""))).json();
    const sizes = m.icons.map((i) => i.sizes);
    const iconOk = await Promise.all(m.icons.map(async (i) => (await fetch(HOSTING + "/" + i.src.replace(/^\//, ""))).status));
    assert(m.name && m.display === "standalone" && sizes.includes("192x192") && sizes.includes("512x512") && iconOk.every((s) => s === 200), JSON.stringify({ m, iconOk }));
    return `이름 "${m.name}", 표시 ${m.display}, 아이콘 ${sizes.join(",")} (모두 200)`;
  });

await tc("W-02", A5, "서비스 워커 등록 (오프라인 캐시)",
  "배포 빌드를 브라우저로 열고 서비스 워커 확인",
  "서비스 워커가 등록·활성화됨",
  async () => {
    const p = await newUserPage(browser);
    await p.goto(HOSTING + "/", { waitUntil: "domcontentloaded" });
    const st = await waitFor(p, async () => (await navigator.serviceWorker.getRegistration())?.active?.state, { label: "sw active", timeout: 20000 });
    await p.browserContext().close();
    return `서비스 워커 상태: ${st}`;
  });

await tc("W-03", A5, "배포 빌드에서 새로고침/딥링크",
  "호스팅에 /trip/abc/budget, /login, /about 직접 요청",
  "모두 앱 화면(index.html)으로 응답(404 아님)",
  async () => {
    const out = [];
    for (const path of ["/trip/abc/budget", "/login", "/about", "/terms"]) {
      const r = await fetch(HOSTING + path);
      const t = await r.text();
      out.push(`${path} ${r.status}${t.includes('id="root"') ? "" : " (앱 아님)"}`);
    }
    assert(out.every((o) => o.includes(" 200") && !o.includes("앱 아님")), out.join(", "));
    return out.join(", ");
  });

await tc("W-04", A5, "첫 화면 로딩 크기",
  "배포 빌드 첫 화면(로그아웃)에서 내려받는 JS 합계",
  "과도하지 않은 용량",
  async () => {
    const p = await newUserPage(browser);
    let bytes = 0; const files = [];
    p.on("response", async (r) => { if (/\.js(\?|$)/.test(r.url()) && r.url().startsWith(HOSTING)) { try { const b = await r.buffer(); bytes += b.length; files.push(r.url().split("/").pop()); } catch {} } });
    await p.goto(HOSTING + "/", { waitUntil: "load" });
    await wait(3000);
    await p.browserContext().close();
    const kb = Math.round(bytes / 1024);
    return { actual: `JS ${files.length}개, 합계 ${kb}KB (압축 전)`, status: kb > 1500 ? "WARN" : "PASS", note: kb > 1500 ? "첫 화면에서 받는 코드가 큼 — 랜딩 방문자는 앱 전체 코드가 필요 없음" : "" };
  });

await tc("Z-01", "공통", "부가 기능 화면 콘솔 오류",
  "위 과정 동안 브라우저 오류 수집",
  "자바스크립트 오류 없음",
  async () => {
    // R-00 makes the AI call fail on purpose; the app logs that failure.
    const errs = [...po.__errors, ...pb.__errors].filter((e) => !/favicon|net::|ERR_|DevTools|Failed to load resource|\[restaurant-recs\]/.test(e));
    return { actual: errs.length ? [...new Set(errs)].slice(0, 5).join(" | ") : "오류 0건", status: errs.length ? "WARN" : "PASS" };
  });

await browser.close();
