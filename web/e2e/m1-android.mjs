// Mobile suite — the Android app on a real phone over USB (adb) plus the
// app's WebView debugger. Runs against the signed-in account on that phone
// (production data), so it only ever touches one throwaway trip it creates
// itself ("[모바일 테스트] …") and deletes that trip at the end.
// Run: node e2e/m1-android.mjs   (phone connected, debug build installed)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { tc, assert, wait, waitFor, click, fill, submitModal, modalOpen, answerDialog, isoDay } from "./h.mjs";

const ADB = "C:/Users/bjsmo/AppData/Local/Android/Sdk/platform-tools/adb.exe";
const PKG = "kr.tripplanner.app";
const DISPLAY = "4633128672291735937"; // the Flip's main screen
const SHOTS = new URL("./shots/", import.meta.url);
fs.mkdirSync(SHOTS, { recursive: true });

const adb = (...args) => execFileSync(ADB, args, { maxBuffer: 64 << 20 }).toString();
const topActivity = () => (adb("shell", "dumpsys", "activity", "activities").match(/topResumedActivity=ActivityRecord\{\S+ \S+ (\S+)/) || [])[1] || "";
const inApp = () => topActivity().startsWith(PKG + "/");
const shot = (name) => fs.writeFileSync(new URL(`m-${name}.png`, SHOTS), execFileSync(ADB, ["exec-out", "screencap", "-p", "-d", DISPLAY], { maxBuffer: 64 << 20 }));
// Send keys to the main display: this phone (a flip) also has a cover
// display, and after a native dialog key events can land on that one.
const key = (k) => adb("shell", "input", "-d", "0", "keyevent", k);
const A0 = "앱 설치·실행", A1 = "화면·레이아웃", A2 = "여행·일정 (앱)", A3 = "안드로이드 기능", A4 = "링크로 앱 열기", A5 = "알림", A6 = "안정성";

let browser = null;
let p = null;
const consoleErrors = [];
/** (Re)attach to the app's WebView — needed after every app restart. */
async function connect() {
  if (browser) { try { browser.disconnect(); } catch { /* gone */ } }
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const pid = adb("shell", "pidof", PKG).trim();
    const sock = pid && (adb("shell", "cat", "/proc/net/unix").match(new RegExp(`webview_devtools_remote_${pid}`)) || [])[0];
    if (sock) {
      adb("forward", "--remove-all");
      adb("forward", "tcp:9333", `localabstract:${sock}`);
      try {
        browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9333", defaultViewport: null, protocolTimeout: 30000 });
        p = (await browser.pages()).find((x) => x.url().startsWith("https://localhost"));
        if (p) {
          p.on("console", async (m) => {
            if (m.type() !== "error") return;
            const parts = await Promise.all(m.args().map((a) => a.evaluate((v) => (v instanceof Error ? `${v.name}: ${v.message}` : typeof v === "object" ? JSON.stringify(v) : String(v))).catch(() => "?")));
            consoleErrors.push((parts.join(" ") || m.text()).slice(0, 200));
          });
          p.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message.slice(0, 200)));
          return p;
        }
      } catch { /* not ready yet */ }
    }
    await wait(700);
  }
  throw new Error("could not attach to the app WebView");
}
const path = () => p.evaluate(() => location.pathname);
/** Native (Android) dialog on screen: its message and a way to press a button. */
function nativeDialog() {
  adb("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const xml = adb("shell", "cat", "/sdcard/ui.xml");
  const nodes = [...xml.matchAll(/<node [^>]*text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)].map((m) => ({ text: m[1], x: (+m[2] + +m[4]) / 2, y: (+m[3] + +m[5]) / 2 }));
  return {
    text: nodes.map((n) => n.text).filter(Boolean).join(" / "),
    press: (label) => { const n = nodes.find((x) => x.text === label); if (n) adb("shell", "input", "tap", String(Math.round(n.x)), String(Math.round(n.y))); return !!n; },
  };
}
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function coldStart() {
  adb("shell", "am", "force-stop", PKG);
  const out = adb("shell", "am", "start", "-W", "-n", `${PKG}/.MainActivity`);
  await connect();
  return Number((out.match(/TotalTime: (\d+)/) || [])[1]) || null;
}

const TITLE = `[모바일 테스트] ${new Date().toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}`;
let tripId = null;
let startMs = null;

// ---- launch ------------------------------------------------------------------
await tc("M-01", A0, "앱 서랍의 아이콘·이름",
  "홈 → 앱 서랍을 열고 페이지를 넘기며 '여행 플래너' 찾기 → 아이콘 부분 캡처",
  "새 아이콘(코랄 + 종이비행기 + 점선 경로)과 '여행 플래너' 이름이 보임",
  async () => {
    key("KEYCODE_WAKEUP"); key("KEYCODE_HOME"); await wait(1000);
    adb("shell", "input", "swipe", "540", "2200", "540", "700", "300"); await wait(1500);
    let bounds = null;
    // The drawer may reopen on any page: page forward, then back.
    for (let i = 0; i < 16 && !bounds; i++) {
      adb("shell", "uiautomator", "dump", "/sdcard/ui.xml");
      const m = adb("shell", "cat", "/sdcard/ui.xml").match(/(?:text|content-desc)="여행 플래너"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (m) bounds = m.slice(1).map(Number);
      else if (i < 8) { adb("shell", "input", "swipe", "900", "1300", "150", "1300", "250"); await wait(1200); }
      else { adb("shell", "input", "swipe", "150", "1300", "900", "1300", "250"); await wait(1200); }
    }
    assert(bounds, "app not found in the drawer");
    shot("drawer");
    key("KEYCODE_HOME");
    const version = (adb("shell", "dumpsys", "package", PKG).match(/versionName=(\S+)/) || [])[1];
    return { actual: `앱 서랍에서 '여행 플래너' 발견 (위치 ${bounds.join(",")}), 설치 버전 ${version}`, status: "PASS", note: "아이콘 모양은 캡처(m-drawer.png)로 눈으로 확인" };
  });

await tc("M-02", A0, "앱 첫 실행 (콜드 스타트)",
  "앱을 완전히 종료한 뒤 실행",
  "랜딩 없이 바로 내 여행 목록, 3초 이내 첫 화면",
  async () => {
    const t0 = Date.now();
    startMs = await coldStart();
    await waitFor(p, () => !!document.querySelector("header.top") && !document.querySelector(".lp"), { label: "app shell", timeout: 15000 });
    await waitFor(p, () => /내 여행/.test(document.body.innerText) && !/불러오는 중/.test(document.body.innerText), { label: "trip list", timeout: 15000 });
    const listMs = Date.now() - t0;
    shot("start");
    assert((await path()) === "/", await path());
    return { actual: `앱 창 ${startMs}ms, 여행 목록까지 약 ${(listMs / 1000).toFixed(1)}초 (랜딩 없이 바로 목록)`, status: listMs < 4000 ? "PASS" : "WARN", note: listMs >= 4000 ? "목록이 뜨기까지 4초 이상" : "" };
  });

// ---- layout ------------------------------------------------------------------
await tc("M-03", A1, "상태 표시줄·화면 가장자리",
  "목록 화면 상단 캡처",
  "내용이 상태 표시줄(시계·배터리) 아래에서 시작, 가로 넘침 없음",
  async () => {
    const r = await p.evaluate(() => ({ top: Math.round(document.querySelector("header.top").getBoundingClientRect().top), w: innerWidth, sw: document.documentElement.scrollWidth }));
    assert(r.sw <= r.w + 1, JSON.stringify(r));
    return { actual: `헤더 시작 ${r.top}px, 화면 폭 ${r.w}px, 가로 넘침 없음 (캡처 m-start.png)`, status: "PASS", note: "상태 표시줄 겹침은 캡처로 확인" };
  });

// ---- trips -------------------------------------------------------------------
await tc("M-04", A2, "새 여행 만들기 (목적지 검색 포함)",
  `'+ 새 여행' → 제목 '${TITLE}', 목적지 '오사카' 검색 후 선택, 날짜 입력 → 저장`,
  "여행이 만들어지고 여행 화면이 열림",
  async () => {
    await click(p, "button", "+ 새 여행");
    await waitFor(p, () => !!document.querySelector(".modal input[name=title]"), { label: "trip form" });
    await fill(p, { title: TITLE, startDate: isoDay(40), endDate: isoDay(42) });
    await p.click(".modal input[name=destination]");
    await p.type(".modal input[name=destination]", "오사카", { delay: 80 });
    await waitFor(p, () => document.querySelectorAll("[role=option]").length > 0, { label: "destination options", timeout: 15000 });
    const dest = await p.evaluate(() => { const o = document.querySelector("[role=option]"); const t = o.innerText.replace(/\n/g, ", "); o.click(); return t; });
    await wait(400);
    await submitModal(p);
    await waitFor(p, () => /^\/trip\//.test(location.pathname), { label: "trip page", timeout: 15000 });
    tripId = (await path()).split("/")[2];
    shot("trip");
    return `목적지 '${dest}' 선택 → 여행 화면 열림 (${tripId})`;
  });

await tc("M-05", A1, "여행 화면 탭 전환·가로 넘침",
  "일정·예산·체크리스트·예약정보·맛집 추천 탭을 차례로 누름",
  "각 탭이 열리고 가로로 밀리는 화면이 없음",
  async () => {
    const seen = [];
    for (const t of ["예산", "체크리스트", "예약정보", "맛집 추천", "일정"]) {
      await click(p, ".tab", t);
      await wait(500);
      assert(await noOverflow(), `overflow on ${t}`);
      seen.push(t);
    }
    return `${seen.join(" → ")} 모두 정상, 가로 넘침 없음`;
  });

await tc("M-06", A2, "일정 항목 추가 + 지도에서 위치 찍기",
  "첫째 날 '자세히' → '+ 항목 추가' → 시간·내용 입력 → '지도에서 위치 찍기' → 지도 탭 → 저장",
  "구글 지도가 앱 안에서 뜨고, 위치가 저장된 항목이 보임",
  async () => {
    await click(p, "button, a", "자세히");
    await click(p, "button", "+ 항목 추가");
    await fill(p, { timeValue: "10:00", text: "오사카성 산책" });
    await click(p, ".modal button", "지도에서 위치 찍기");
    await waitFor(p, () => !!document.querySelector(".map-picker-map .gm-style"), { label: "google map", timeout: 20000 });
    await wait(2000);
    const box = await (await p.$(".map-picker-map")).boundingBox();
    await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await waitFor(p, () => document.querySelector(".map-picker-address")?.innerText.includes("선택한 위치"), { label: "picked", timeout: 12000 });
    shot("map");
    await click(p, ".modal button", "이 위치로 저장");
    await submitModal(p);
    await waitFor(p, () => [...document.querySelectorAll(".plan-list li")].some((l) => l.innerText.includes("오사카성 산책") && l.innerText.includes("지도")), { label: "item with location", timeout: 12000 });
    return "지도 로드 → 위치 선택 → '📍 지도' 표시된 항목 저장";
  });

// ---- Android-specific ---------------------------------------------------------
await tc("M-07", A3, "뒤로가기 버튼 — 열린 창 먼저 닫기",
  "'+ 항목 추가' 창을 연 상태에서 안드로이드 뒤로가기",
  "창만 닫히고 화면은 그대로",
  async () => {
    const before = await path();
    await click(p, "button", "+ 항목 추가");
    await waitFor(p, () => !!document.querySelector(".modal"), { label: "modal" });
    key("KEYCODE_BACK"); await wait(900);
    assert(!(await modalOpen(p)), "modal still open");
    assert((await path()) === before, await path());
    return "창이 닫히고 같은 화면 유지";
  });

await tc("M-08", A3, "뒤로가기 버튼 — 작성 중인 내용이 있을 때",
  "'+ 항목 추가'에 내용을 입력한 뒤 뒤로가기",
  "앱 디자인의 '작성 중인 내용이 사라져요' 확인 창이 뜸 (안드로이드 기본 창 아님)",
  async () => {
    await click(p, "button", "+ 항목 추가");
    await fill(p, { text: "쓰다 만 내용" });
    // The app's own dialog now (not Android's system one). Back while it's
    // up answers "계속 작성" and keeps what was typed.
    const dialogUp = () => p.evaluate(() => !!document.querySelector(".dialog-layer"));
    key("KEYCODE_BACK");
    await waitFor(p, () => !!document.querySelector(".dialog-layer"), { label: "in-app confirm" });
    key("KEYCODE_BACK"); await wait(700);
    const kept = !(await dialogUp()) && await p.evaluate(() => document.querySelector('.modal [name="text"]')?.value === "쓰다 만 내용");
    assert(kept, "back on the confirm didn't keep the form");
    key("KEYCODE_BACK");
    const asked = await answerDialog(p);
    assert(asked, "no confirm");
    assert(!(await modalOpen(p)), "still open after confirming");
    return `확인 창 "${asked}" → 뒤로가기는 '계속 작성'(입력 유지), 닫기 누르면 창 닫힘`;
  });

await tc("M-09", A3, "뒤로가기 버튼 — 열린 날짜 → 여행 → 목록 → 앱 종료",
  "여러 탭을 오간 뒤 첫째 날 '자세히'를 연 상태에서 뒤로가기 반복",
  "날짜 화면이 먼저 닫히고, 다음 한 번에 목록, 목록에서 한 번 더 누르면 앱 종료",
  async () => {
    for (const t of ["예산", "체크리스트", "일정"]) { await click(p, ".tab", t); await wait(400); }
    await click(p, "button, a", "자세히");
    await waitFor(p, () => [...document.querySelectorAll(".back-link")].some((b) => b.innerText.includes("일정 목록으로")), { label: "day view" });
    const tripPath = await path();
    key("KEYCODE_BACK");
    let dayClosed = false;
    for (let i = 0; i < 15 && !dayClosed; i++) {
      await wait(200);
      dayClosed = await p.evaluate(() => ![...document.querySelectorAll(".back-link")].some((b) => b.innerText.includes("일정 목록으로")));
    }
    const afterFirst = await path();
    assert(dayClosed && afterFirst === tripPath, `day view not closed first (day still open: ${!dayClosed}, path ${afterFirst})`);
    key("KEYCODE_BACK"); await wait(900);
    assert((await path()) === "/", "second back went to " + (await path()));
    key("KEYCODE_BACK"); await wait(1500);
    assert(!inApp(), "still in app: " + topActivity());
    return "날짜 닫힘 → 목록 → 앱 종료 (탭을 여러 번 바꿔도 뒤로가기 한 번에 목록)";
  });

await tc("M-10", A4, "초대 링크로 앱 열기 (App Links)",
  "앱이 꺼진 상태에서 https://tripplanner.kr/join/<여행ID> 링크 열기",
  "브라우저가 아니라 앱이 열리고 해당 여행 화면으로 이동",
  async () => {
    const verified = /tripplanner\.kr: verified/.test(adb("shell", "pm", "get-app-links", PKG));
    adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `https://tripplanner.kr/join/${tripId}`);
    await wait(1500);
    assert(inApp(), "opened in " + topActivity());
    await connect();
    await waitFor(p, (id) => location.pathname === `/trip/${id}/itinerary`, { label: "trip via link", timeout: 15000 }).catch(() => {});
    const at = await path();
    assert(at === `/trip/${tripId}/itinerary`, at);
    return `도메인 확인 ${verified ? "완료(verified)" : "안 됨"} → 앱에서 ${at} 열림`;
  });

await tc("M-11", A4, "없는 공개 링크로 앱 열기",
  "https://tripplanner.kr/share/<없는 ID> 열기",
  "앱이 열리고 '없는 링크' 안내, 앱이 멈추지 않음",
  async () => {
    adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "https://tripplanner.kr/share/0123456789abcdef0123456789abcdef");
    await wait(1500);
    assert(inApp(), topActivity());
    await waitFor(p, () => !/불러오는 중/.test(document.body.innerText), { label: "public page loaded", timeout: 20000 }).catch(() => {});
    const t = await p.evaluate(() => document.body.innerText);
    const msg = (t.match(/[^\n]*(링크|공유)[^\n]*/) || [""])[0];
    return { actual: `앱 안에서 열림, 안내: "${msg.slice(0, 60)}"`, status: /중지|없는/.test(msg) ? "PASS" : "WARN" };
  });

await tc("M-12", A3, "동행자 초대 — 휴대폰 공유 창",
  "여행 화면 '동행자 초대' → '📤 공유하기'",
  "안드로이드 공유 창(카카오톡·메시지 등)이 뜸",
  async () => {
    // Count by title: leftovers of an interrupted earlier run share it.
    const countTitle = () => p.evaluate((t) => [...document.querySelectorAll(".trip-card-title")].filter((e) => e.innerText.trim() === t).length, TITLE);
    await p.goto("https://localhost/").catch(() => {});
    await waitFor(p, () => !!document.querySelector(".trip-card-title"), { label: "trip list", timeout: 15000 });
    const before = await countTitle();
    await p.goto("https://localhost/trip/" + tripId + "/itinerary").catch(() => {});
    await waitFor(p, () => !!document.querySelector(".trip-actions"), { label: "trip actions", timeout: 15000 });
    await click(p, ".trip-actions button", "동행자 초대");
    await waitFor(p, () => [...document.querySelectorAll(".modal button")].some((b) => /공유하기/.test(b.innerText)), { label: "share button" });
    await click(p, ".modal button", "공유하기");
    await wait(2500);
    const top = topActivity();
    shot("share");
    key("KEYCODE_BACK"); await wait(1200);
    assert(!top.startsWith(PKG + "/"), "share sheet not shown: " + top);
    if (await modalOpen(p)) { key("KEYCODE_BACK"); await wait(800); }
    return `공유 창 표시 (${top.split("/")[0]})`;
  });

await tc("M-13", A3, "캘린더로 내보내기 — 파일 공유",
  "'캘린더로 내보내기' → '내보내기'",
  "캘린더 파일(.ics)을 보낼 앱을 고르는 공유 창이 뜸",
  async () => {
    await click(p, ".trip-actions button", "캘린더로 내보내기");
    await click(p, ".modal button", "내보내기", { exact: true });
    await wait(3000);
    const top = topActivity();
    shot("ics");
    key("KEYCODE_BACK"); await wait(1200);
    assert(!top.startsWith(PKG + "/"), "no share sheet: " + top);
    return `공유 창 표시 (${top.split("/")[0]})`;
  });

await tc("M-14", A3, "지도 링크는 앱 밖에서 열기",
  "일정 항목의 '📍 지도' → 위치 창의 '구글 지도에서 열기'",
  "구글 지도 앱이나 브라우저에서 열리고, 뒤로가기로 앱에 돌아옴",
  async () => {
    if (!(await p.$(".plan-list li"))) await click(p, "button, a", "자세히");
    await click(p, ".plan-list button, .plan-list a", "📍");
    await waitFor(p, () => [...document.querySelectorAll(".modal a")].some((a) => a.innerText.includes("구글 지도")), { label: "location viewer", timeout: 15000 });
    await p.evaluate(() => [...document.querySelectorAll(".modal a")].find((a) => a.innerText.includes("구글 지도")).click());
    await wait(3500);
    const top = topActivity();
    key("KEYCODE_BACK"); await wait(1500);
    if (!inApp()) { adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`); await wait(1500); }
    assert(!top.startsWith(PKG + "/"), "opened inside the app: " + top);
    await connect();
    return `${top.split("/")[0]}에서 열림 → 앱으로 복귀`;
  });

await tc("M-15", A3, "백그라운드 후 복귀",
  "여행 화면에서 홈으로 나갔다가 앱 아이콘으로 다시 열기",
  "보던 여행 화면 그대로",
  async () => {
    const before = await path();
    key("KEYCODE_HOME"); await wait(2000);
    adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`); await wait(2000);
    await connect();
    const after = await path();
    assert(after === before, `${before} → ${after}`);
    return `${after} 유지`;
  });

// ---- push --------------------------------------------------------------------
await tc("M-16", A5, "알림 설정 저장",
  "헤더 '알림' → '동행자 변경 알림' 끄고 저장 → 다시 열어 확인 → 원래대로 켜고 저장",
  "끈 상태가 저장되어 다시 열었을 때 꺼져 있음",
  async () => {
    const open = async () => { await click(p, "header button", "알림", { exact: true }); await waitFor(p, () => !!document.querySelector(".modal input[name=tripChanges]"), { label: "prefs", timeout: 10000 }); };
    await open();
    await fill(p, { tripChanges: false }); await submitModal(p); await wait(800);
    await open();
    const off = await p.evaluate(() => !document.querySelector(".modal input[name=tripChanges]").checked);
    await fill(p, { tripChanges: true }); await submitModal(p); await wait(800);
    assert(off, "not saved");
    return "끔 저장 → 다시 열었을 때 꺼져 있음 → 다시 켬";
  });

await tc("M-17", A5, "테스트 알림 — 알림창 도착",
  "알림 설정 → '테스트 알림 보내기' → 바로 홈 화면으로",
  "5초 뒤 알림창에 종이비행기 아이콘 알림 도착",
  async () => {
    await click(p, "header button", "알림", { exact: true });
    await waitFor(p, () => [...document.querySelectorAll(".modal button")].some((b) => b.innerText.includes("테스트 알림")), { label: "test button", timeout: 10000 });
    await p.evaluate(() => [...document.querySelectorAll(".modal button")].find((b) => b.innerText.includes("테스트 알림")).click());
    await wait(1500);
    const status = await p.evaluate(() => [...document.querySelectorAll(".modal span")].map((s) => s.innerText).join(" ")).catch(() => "");
    key("KEYCODE_HOME");
    let found = "";
    for (let i = 0; i < 20 && !found; i++) {
      await wait(1000);
      const dump = adb("shell", "dumpsys", "notification", "--noredact");
      const idx = dump.indexOf(`pkg=${PKG}`);
      if (idx >= 0) { const blk = dump.slice(idx, idx + 8000); found = (blk.match(/android\.text=[^\r\n]*/) || blk.match(/tickerText=[^\r\n]*/) || ["(알림 있음)"])[0].slice(0, 90); }
    }
    shot("notification");
    adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`); await wait(1500); await connect();
    if (await modalOpen(p)) { key("KEYCODE_BACK"); await wait(600); }
    if (/1분 뒤/.test(status)) return { actual: "1분 제한에 걸림 — 앞선 테스트 알림 직후라 건너뜀", status: "SKIP" };
    assert(found, "no notification; button said: " + status);
    return `알림창 도착: "${found}"`;
  });

// ---- cleanup & stability -----------------------------------------------------
await tc("M-18", A2, "테스트 여행 삭제 (정리)",
  "만든 테스트 여행 → '삭제' → 확인",
  "여행이 지워지고 목록으로 돌아감",
  async () => {
    if (!tripId) return { actual: "만든 여행이 없어 건너뜀", status: "SKIP" };
    // Count by title: leftovers of an interrupted earlier run share it.
    const countTitle = () => p.evaluate((t) => [...document.querySelectorAll(".trip-card-title")].filter((e) => e.innerText.trim() === t).length, TITLE);
    await p.goto("https://localhost/").catch(() => {});
    await waitFor(p, () => !!document.querySelector(".trip-card-title"), { label: "trip list", timeout: 15000 });
    const before = await countTitle();
    await p.goto("https://localhost/trip/" + tripId + "/itinerary").catch(() => {});
    await waitFor(p, () => !!document.querySelector(".trip-head"), { label: "trip", timeout: 15000 });
    await click(p, ".trip-head button", "삭제", { exact: true });
    await click(p, ".modal button", "삭제", { exact: true });
    await waitFor(p, () => location.pathname === "/", { label: "home", timeout: 15000 });
    await wait(800);
    const after = await countTitle();
    assert(after === before - 1, `still listed (${before} → ${after})`);
    return after ? { actual: `삭제 후 목록에서 사라짐 (이전 실행이 남긴 같은 이름의 테스트 여행 ${after}개는 그대로)`, status: "PASS" } : "삭제 후 목록에서 사라짐";
  });

await tc("M-19", A6, "앱 오류·강제 종료",
  "위 과정 동안 앱 콘솔 오류와 안드로이드 강제 종료 기록 수집",
  "자바스크립트 오류 없음, 앱 강제 종료 없음",
  async () => {
    const crash = /FATAL EXCEPTION[\s\S]{0,300}kr\.tripplanner\.app/.test(adb("logcat", "-d", "-b", "crash"));
    // "Share canceled": the test closes the share sheet itself; the app treats that as a normal cancel.
    const errs = [...new Set(consoleErrors.filter((e) => !/favicon|net::ERR|Failed to load resource|Share canceled/.test(e)))];
    return { actual: `강제 종료 ${crash ? "있음" : "없음"}, 콘솔 오류 ${errs.length}건${errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""}`, status: crash ? "FAIL" : errs.length ? "WARN" : "PASS" };
  });

try { browser?.disconnect(); } catch { /* done */ }
adb("forward", "--remove-all");
console.log("mobile suite done");
