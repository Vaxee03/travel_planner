// Google Play listing images: phone screenshots (1080x1920, with a caption)
// and the feature graphic (1024x500), written to store/.
// Uses made-up demo trips on the local emulators — never real accounts.
// Needs, like the e2e suite:
//   npx firebase-tools@14 emulators:start --only auth,firestore,storage,functions,hosting
//   npm run dev:emulator
// Run: npm run store
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BASE, launch, wait, waitFor, click, fsSet, isoDay } from "../e2e/h.mjs";
import { TERMS_VERSION } from "../src/lib/terms.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "store");
const raw = path.join(out, "raw");
fs.mkdirSync(raw, { recursive: true });

// ---- demo data -------------------------------------------------------------
const JI = "demo_jimin", MS = "demo_minsu", SY = "demo_seoyeon";
const MEMBERS = [JI, MS, SY];
for (const [uid, nickname] of [[JI, "지민"], [MS, "민수"], [SY, "서연"]]) await fsSet(`users/${uid}`, { nickname, termsVersion: TERMS_VERSION });

const at = (lat, lng, address) => ({ lat, lng, address });
const OSAKA = "demoOsaka01";
await fsSet(`trips/${OSAKA}`, {
  ownerId: JI, memberIds: MEMBERS, title: "오사카 3박 4일", destination: "오사카시, 일본 오사카부", tripType: "international",
  startDate: isoDay(12), endDate: isoDay(15), travelers: 3, budgetTotal: 2400000,
  days: [
    { date: isoDay(12), status: "confirmed", summary: "도착 · 난바 · 도톤보리", items: [
      { kind: "time", time: "10:30", text: "간사이 공항 도착, 라피트 타고 난바로", location: at(34.4347, 135.244, "간사이 국제공항") },
      { kind: "time", time: "12:30", text: "호텔 짐 맡기기", location: at(34.6656, 135.5013, "난바") },
      { kind: "time", time: "14:00", text: "도톤보리 산책 + 타코야키", location: at(34.6687, 135.5013, "도톤보리") },
      { kind: "time", time: "19:00", text: "우메다 스카이빌딩 야경", location: at(34.7053, 135.4903, "우메다 스카이빌딩") },
      { kind: "label", text: "주유패스 수령하기" },
    ] },
    { date: isoDay(13), status: "confirmed", summary: "오사카성 · 시장 · 신세카이", items: [
      { kind: "time", time: "09:00", text: "오사카성 공원", location: at(34.6873, 135.5262, "오사카성") },
      { kind: "time", time: "12:00", text: "구로몬 시장 점심", location: at(34.6655, 135.5068, "구로몬 시장") },
      { kind: "time", time: "15:00", text: "신세카이 · 츠텐카쿠", location: at(34.6525, 135.5063, "츠텐카쿠") },
      { kind: "time", time: "18:30", text: "쿠시카츠 저녁" },
    ] },
    { date: isoDay(14), status: "confirmed", summary: "유니버설 스튜디오 재팬", items: [
      { kind: "time", time: "08:00", text: "USJ 오픈런 — 닌텐도 월드부터", location: at(34.6654, 135.4323, "유니버설 스튜디오 재팬") },
      { kind: "label", text: "익스프레스 패스 앱에 저장" },
    ] },
    { date: isoDay(15), status: "open", summary: "기념품 · 귀국", items: [
      { kind: "time", time: "10:00", text: "체크아웃 후 신사이바시 쇼핑", location: at(34.6748, 135.5012, "신사이바시") },
      { kind: "time", time: "15:30", text: "공항으로 출발" },
    ] },
  ],
  budgetItems: [
    { category: "항공", amount: 870000, memo: "왕복 3명", paidBy: JI, splitAmong: MEMBERS, createdBy: JI },
    { category: "숙소", amount: 720000, memo: "난바 호텔 3박", paidBy: MS, splitAmong: MEMBERS, createdBy: MS },
    { category: "입장권", amount: 342000, memo: "USJ + 익스프레스", paidBy: SY, splitAmong: MEMBERS, createdBy: SY },
    { category: "식비", amount: 186000, memo: "첫날 저녁·간식", paidBy: JI, splitAmong: MEMBERS, createdBy: JI },
    { category: "교통", amount: 96000, memo: "주유패스 2일권", paidBy: MS, splitAmong: [JI, MS], createdBy: MS },
  ],
  checklist: [
    { id: "c1", text: "여권 (유효기간 6개월 이상)" }, { id: "c2", text: "항공권 · 숙소 예약 확인" },
    { id: "c3", text: "엔화 환전 / 트래블카드" }, { id: "c4", text: "eSIM 또는 포켓와이파이" },
    { id: "c5", text: "돼지코 어댑터 (110V)" }, { id: "c6", text: "Visit Japan Web 등록" },
    { id: "c7", text: "보조배터리" }, { id: "c8", text: "상비약" },
  ],
  checklistDone: { c1: true, c2: true, c3: true, c6: true },
  bookings: [
    { type: "항공", name: "인천 → 간사이 09:00", confirmNumber: "QX7K2P", link: "", memo: "3명 · 수하물 15kg" },
    { type: "숙소", name: "난바 시티 호텔", confirmNumber: "HB-208841", link: "", memo: "트윈+엑스트라베드, 체크인 15시" },
    { type: "투어", name: "USJ 익스프레스 패스 4", confirmNumber: "USJ-55102", link: "", memo: "QR은 앱에 저장" },
  ],
  memberPermissions: { [MS]: ["budget", "bookings"], [SY]: ["itinerary", "checklist"] },
});
await fsSet(`trips/demoJeju01`, {
  ownerId: JI, memberIds: [JI, MS], title: "제주 가족여행", destination: "제주특별자치도", tripType: "domestic",
  startDate: isoDay(41), endDate: isoDay(43), travelers: 4, budgetTotal: 1200000,
  days: [], budgetItems: [], checklist: [], bookings: [], memberPermissions: {},
});
await fsSet(`trips/demoTokyo01`, {
  ownerId: SY, memberIds: [SY, JI], title: "도쿄 & 하코네", destination: "도쿄도, 일본", tripType: "international",
  startDate: isoDay(-48), endDate: isoDay(-44), travelers: 2, budgetTotal: 1800000,
  days: [], budgetItems: [], checklist: [], bookings: [], memberPermissions: {},
});

const RECS = {
  preferences: "현지인 맛집, 웨이팅 짧은 곳",
  rec: {
    destination: "오사카시, 일본 오사카부", preferences: "현지인 맛집, 웨이팅 짧은 곳", generatedAt: Date.now() - 3600_000,
    items: [
      { name: "다루마 신세카이 본점", category: "쿠시카츠", reason: "1929년부터 이어온 원조 쿠시카츠. 소스는 한 번만 찍는 게 규칙이에요.", address: "오사카 나니와구 에비스히가시" },
      { name: "구로몬 산페이", category: "해산물 덮밥", reason: "시장 안에서 바로 손질한 참치·성게 덮밥을 합리적인 가격에.", address: "오사카 주오구 닛폰바시" },
      { name: "와나카 센니치마에 본점", category: "타코야키", reason: "겉은 바삭, 속은 촉촉한 정통 타코야키. 회전이 빨라 줄이 금방 빠져요.", address: "오사카 주오구 난바센니치마에" },
      { name: "치보 도톤보리점", category: "오코노미야키", reason: "철판에서 바로 구워 주는 오사카식 오코노미야키와 야키소바.", address: "오사카 주오구 도톤보리" },
    ],
  },
};

// ---- screenshots -----------------------------------------------------------
// A 412px-wide phone (like most Android phones), drawn 1080px wide; the
// height fits the 840x1540 frame below.
const W = 412, H = 755, DPR = 1080 / W;
const browser = await launch();
const ctx = await browser.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: W, height: H, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await p.goto(BASE, { waitUntil: "domcontentloaded" });
await waitFor(p, () => typeof window.__emulatorSignIn === "function", { label: "app", timeout: 20000 });
await p.evaluate((uid, recs) => { localStorage.setItem("tp:recs:demoOsaka01", JSON.stringify(recs)); return window.__emulatorSignIn(uid); }, JI, RECS);
await waitFor(p, () => document.body.innerText.includes("오사카 3박 4일"), { label: "trip list", timeout: 20000 });

const hideScrollbars = () => p.addStyleTag({ content: "::-webkit-scrollbar{display:none} *{scrollbar-width:none} .toast,.flash{display:none!important}" });
async function shot(name) {
  await hideScrollbars();
  await p.evaluate(() => document.fonts.ready);
  await wait(600);
  await p.screenshot({ path: path.join(raw, `${name}.png`) });
  console.log("  shot", name);
}
async function openTab(tab) {
  await p.goto(`${BASE}/trip/${OSAKA}/${tab}`, { waitUntil: "domcontentloaded" });
  await waitFor(p, () => !!document.querySelector(".tabbar"), { label: "trip", timeout: 15000 });
  await wait(900);
}
const scrollTo = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (e) window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 70); }, sel);

await wait(800);
await shot("01-list");

await openTab("itinerary");
await shot("02-itinerary");

const openDay = async (n) => {
  await openTab("itinerary");
  await p.evaluate((n) => [...document.querySelectorAll("button, a")].filter((e) => e.innerText.includes("자세히"))[n].click(), n);
  await waitFor(p, () => [...document.querySelectorAll(".back-link")].some((b) => b.innerText.includes("일정 목록으로")), { label: "day" });
  await scrollTo(".back-link");
  await wait(500);
};
await openDay(0);
await shot("03-day");

// Day 2: its places are close together, so the route map reads well.
await openDay(1);
await click(p, "button", "동선 보기");
await waitFor(p, () => !!document.querySelector(".modal .gm-style"), { label: "route map", timeout: 20000 });
await wait(2500); // map tiles
await shot("04-route");
await p.keyboard.press("Escape");

await openTab("budget");
await scrollTo(".tabbar");
await shot("05-budget");

await openTab("checklist");
await scrollTo(".tabbar");
await shot("06-checklist");

await openTab("restaurants");
await scrollTo(".tabbar");
await shot("07-restaurants");


// ---- framing ---------------------------------------------------------------
const CAPTIONS = {
  "01-list": ["여행을 한눈에", "다가오는 여행, 지난 여행까지 한곳에서"],
  "02-itinerary": ["동행자와 함께 계획", "링크 하나로 초대하고 실시간으로 같이 편집"],
  "03-day": ["시간순 타임라인", "장소를 지도에서 찍어 저장해요"],
  "04-route": ["하루 동선을 지도로", "방문 순서대로 이어서 보여줘요"],
  "05-budget": ["예산과 1/N 정산", "누가 냈는지 기록하면 정산은 자동으로"],
  "06-checklist": ["준비물 체크리스트", "동행자와 함께 체크하며 빠짐없이"],
  "07-restaurants": ["AI 맛집 추천", "원하는 조건으로 현지 맛집을 골라줘요"],
};
const fonts = `<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Noto+Serif+KR:wght@700&display=block" rel="stylesheet">`;
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920 });
const files = Object.keys(CAPTIONS).map((k) => `${k}.png`);
for (const f of files) {
  const key = f.replace(/\.png$/, "");
  const [title, sub] = CAPTIONS[key] || [key, ""];
  const img = `${key}.png`;
  const htmlFile = path.join(raw, `${key}.html`);
  fs.writeFileSync(htmlFile, `<!doctype html><html><head><meta charset="utf-8">${fonts}<style>
    body{margin:0;width:1080px;height:1920px;overflow:hidden;font-family:"Noto Sans KR",sans-serif;
      background:radial-gradient(circle at 85% 8%,#3a2a28 0,#16181d 45%);color:#f1ece6;position:relative}
    .cap{position:absolute;left:0;right:0;top:92px;text-align:center}
    h1{margin:0;font-size:76px;font-weight:900;letter-spacing:-.02em}
    h1 em{font-style:normal;color:#e07a63}
    p{margin:22px 0 0;font-size:38px;color:#c4bbb1}
    .phone{position:absolute;left:120px;top:356px;width:840px;height:1540px;border-radius:44px;overflow:hidden;
      box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 10px #2a2c33}
    .phone img{width:840px;display:block}
  </style></head><body>
    <div class="cap"><h1>${title.replace(/(한눈에|타임라인|지도로|1\/N 정산|체크리스트|AI 맛집|함께)/, "<em>$1</em>")}</h1><p>${sub}</p></div>
    <div class="phone"><img src="${img}"></div>
  </body></html>`);
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, `screenshot-${key}.png`) });
  fs.rmSync(htmlFile);
  console.log("  framed", key);
}

// ---- feature graphic (1024x500) --------------------------------------------
const fg = fs.readFileSync(path.join(root, "assets/icon/foreground.svg"), "utf8");
const art = fg.replace(/^[\s\S]*?<g /, "<g ").replace(/<\/svg>\s*$/, "");
const icon = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="171 171 682 682"><rect x="171" y="171" width="682" height="682" rx="150" fill="#e07a63"/>${art}</svg>`).toString("base64")}`;
await page.setViewport({ width: 1024, height: 500 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${fonts}<style>
  body{margin:0;width:1024px;height:500px;overflow:hidden;background:radial-gradient(circle at 82% 30%,#2c2428 0,#16181d 58%);color:#f1ece6;font-family:"Noto Sans KR",sans-serif;position:relative}
  .copy{position:absolute;left:76px;top:98px}
  .eyebrow{font-weight:700;letter-spacing:.24em;color:#c9a35f;font-size:21px}
  h1{font-family:"Noto Serif KR",serif;font-size:82px;margin:16px 0 20px;letter-spacing:-.01em}
  p{margin:0;font-size:28px;line-height:1.5;color:#b9b1a7}
  .icon{position:absolute;right:96px;top:110px;width:280px;height:280px;border-radius:62px;box-shadow:0 22px 56px rgba(0,0,0,.45)}
</style></head><body>
  <div class="copy"><div class="eyebrow">TRIP PLANNER</div><h1>여행 플래너</h1>
  <p>일정 · 예산 · 체크리스트를<br>동행자와 함께 계획하세요</p></div>
  <img class="icon" src="${icon}">
</body></html>`, { waitUntil: "load", timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(out, "feature-graphic.png") });
console.log("  feature-graphic.png");

await browser.close();
console.log(`store images written to ${out}`);
process.exit(0); // the headless browser sometimes keeps the process alive
