// Suite 3 — trips, itinerary, map, memo, duplicate, calendar export.
import fs from "node:fs";
import { resetFirestore, BASE, launch, newUserPage, tc, assert, wait, waitFor, text, click, fill, submitModal, modalOpen, modalText, shot, signInAs, fsGet, fsList, tripByTitle, isoDay } from "./h.mjs";

await resetFirestore();
const browser = await launch();
const stamp = Date.now();
const OWNER = `own${stamp}`;
const A = "여행·일정";
const p = await newUserPage(browser);
await signInAs(p, OWNER, "민수");

const formNote = () => p.evaluate(() => [...document.querySelectorAll(".modal .note")].map((n) => n.innerText).join(" / "));
const openNewTrip = async () => { await click(p, "button", "+ 새 여행"); await waitFor(p, () => !!document.querySelector(".modal input[name=title]"), { label: "trip form" }); };

async function pickDestination(q) {
  await p.click(".modal input[name=destination]", { clickCount: 3 });
  await p.type(".modal input[name=destination]", q, { delay: 60 });
  await waitFor(p, () => document.querySelectorAll("[role=option]").length > 0, { label: `destination options for ${q}`, timeout: 12000 });
  const first = await p.evaluate(() => document.querySelector("[role=option]").innerText.replace(/\n/g, ", "));
  await p.evaluate(() => document.querySelector("[role=option]").click());
  await wait(300);
  return first;
}

await tc("T-01", A, "새 여행 — 아무것도 입력하지 않고 저장",
  "'+ 새 여행' → 바로 '여행 만들기'",
  "저장되지 않고 안내 문구 표시",
  async () => {
    await openNewTrip();
    await submitModal(p);
    const n = await formNote();
    assert(n && (await modalOpen(p)), n);
    return `안내: "${n}"`;
  });

await tc("T-02", A, "새 여행 — 목적지를 입력만 하고 목록에서 고르지 않음",
  "목적지 칸에 '오사카' 입력 후 목록 선택 없이 제목·날짜 채우고 저장",
  "목적지는 목록에서 골라야 한다는 안내, 저장 안 됨",
  async () => {
    await fill(p, { title: "검증용", startDate: isoDay(10), endDate: isoDay(12) });
    await p.type(".modal input[name=destination]", "오사카");
    await submitModal(p);
    const n = await formNote();
    assert(n.includes("목적지") && (await modalOpen(p)), n);
    return `안내: "${n}"`;
  });

let destIntl;
await tc("T-03", A, "목적지 검색 → 목록에서 선택 (해외)",
  "목적지 칸에 '오사카' 입력 → 자동완성 목록 첫 항목 선택",
  "목록이 뜨고 선택하면 '도시, 국가' 형태로 입력됨",
  async () => {
    destIntl = await pickDestination("오사카");
    const v = await p.$eval(".modal input[name=destination]", (i) => i.value);
    assert(v.includes("오사카"), v);
    return `첫 추천: "${destIntl}", 입력값: "${v}"`;
  });

await tc("T-04", A, "새 여행 — 종료일이 시작일보다 빠름",
  "시작일 +12일, 종료일 +10일로 저장",
  "'종료일은 시작일보다 빠를 수 없어요' 안내",
  async () => {
    await fill(p, { startDate: isoDay(12), endDate: isoDay(10) });
    await submitModal(p);
    const n = await formNote();
    assert(n.includes("종료일"), n);
    return `안내: "${n}"`;
  });

await tc("T-05", A, "새 여행 — 인원 0명",
  "인원 수 0으로 저장",
  "'인원 수는 1명 이상' 안내",
  async () => {
    await fill(p, { startDate: isoDay(10), endDate: isoDay(13), travelers: "0" });
    await submitModal(p);
    const n = await formNote();
    assert(n.includes("1명 이상"), n);
    return `안내: "${n}"`;
  });

let trip;
await tc("T-06", A, "해외 여행 만들기 성공",
  "제목 'E2E 오사카', 목적지 선택, 10일 뒤 출발 3박4일, 2명, 예산 1,000,000원으로 저장",
  "여행 화면으로 이동, 칩에 D-day/해외/목적지/기간/예산, 기본 해외 준비물 8개 생성",
  async () => {
    await fill(p, { title: "E2E 오사카", travelers: "2", budgetTotal: "1000000" });
    await submitModal(p);
    await waitFor(p, () => location.pathname.startsWith("/trip/"), { label: "trip page" });
    await wait(800);
    const chips = await p.evaluate(() => [...document.querySelectorAll(".chip")].map((c) => c.innerText).join(" | "));
    trip = await tripByTitle("E2E 오사카");
    assert(trip && trip.checklist.length === 8 && chips.includes("D-10") && chips.includes("1,000,000"), chips + " / checklist " + trip?.checklist?.length);
    return `칩: ${chips} / 준비물 ${trip.checklist.length}개`;
  });

await tc("T-07", A, "국내 여행 만들기 (국내 목적지 검색 + 국내 기본 준비물)",
  "여행 목록 → 새 여행 → '국내' 선택 → '부산' 검색·선택 → 20일 뒤 1박2일",
  "국내 목적지로 저장, 기본 국내 준비물 6개, 예약정보 종류가 '교통'",
  async () => {
    await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await openNewTrip();
    await fill(p, { tripType: "domestic" });
    const d = await pickDestination("부산");
    await fill(p, { title: "E2E 부산", startDate: isoDay(20), endDate: isoDay(21), travelers: "1" });
    await submitModal(p);
    await waitFor(p, () => location.pathname.startsWith("/trip/"), { label: "trip page" });
    const t = await tripByTitle("E2E 부산");
    assert(t && t.tripType === "domestic" && t.checklist.length === 6, JSON.stringify({ d, type: t?.tripType, n: t?.checklist?.length }));
    return `목적지 "${t.destination}", 준비물 ${t.checklist.length}개`;
  });

await tc("T-08", A, "해외 여행에서 국내 도시 검색",
  "해외 여행 폼에서 목적지 '전주' 검색",
  "해외 여행에는 국내 도시가 추천되지 않음(또는 결과 없음 안내)",
  async () => {
    await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await openNewTrip();
    await p.type(".modal input[name=destination]", "전주", { delay: 60 });
    await wait(2500);
    const opts = await p.evaluate(() => [...document.querySelectorAll("[role=option]")].map((o) => o.innerText.replace(/\n/g, ", ")));
    await p.keyboard.press("Enter"); await wait(1500);
    const n = await p.evaluate(() => document.querySelector(".modal .section-note")?.innerText || "");
    await click(p, ".modal button", "취소", { exact: true });
    const korean = opts.filter((o) => /대한민국|South Korea|한국/.test(o));
    return { actual: `추천 목록: ${opts.length ? opts.join(" / ") : "(없음)"} ${n ? `· 안내 "${n}"` : ""}`, status: korean.length ? "WARN" : "PASS", note: korean.length ? "해외 여행인데 국내 도시가 추천됨" : "" };
  });

await tc("T-09", A, "여행 목록 카드 표시",
  "여행 목록 화면 확인",
  "여행이 출발일 순으로 정렬되고 D-day·상태(예정)·인원·예산 표시",
  async () => {
    await waitFor(p, () => document.querySelectorAll(".trip-card").length >= 2, { label: "trip cards" });
    const cards = await p.evaluate(() => [...document.querySelectorAll(".trip-card")].map((c) => c.innerText.replace(/\n/g, " ")));
    assert(cards[0].includes("E2E 오사카") && cards[0].includes("예정") && cards[1].includes("E2E 부산"), cards.join(" || "));
    return cards.join(" || ");
  });

// ---- itinerary ----------------------------------------------------------
const TRIP = () => `${BASE}/trip/${trip.id}`;
await p.goto(TRIP() + "/itinerary", { waitUntil: "domcontentloaded" });
await waitFor(p, () => !!document.querySelector(".tabbar"), { label: "trip detail" });

await tc("T-10", A, "새 여행 — 기간만큼 날짜 자동 생성 + 날짜 수정",
  "만든 여행(3박 4일)의 일정 탭 확인 → 첫째 날을 '확정', 요약 '첫째 날'로, 둘째 날 요약 '둘째 날'로 수정",
  "출발일~종료일 4개 날짜가 자동으로 만들어져 있고, 수정 내용이 날짜순 목록에 반영",
  async () => {
    const days0 = await p.evaluate(() => document.querySelectorAll(".day-summary").length);
    for (const [i, status, summary] of [[0, "open", "첫째 날"], [1, "confirmed", "둘째 날"]]) {
      await p.evaluate((i) => document.querySelectorAll(".day-summary")[i].click(), i);
      await click(p, ".detail-head button", "날짜 수정");
      await fill(p, { status, summary });
      await submitModal(p);
      await waitFor(p, () => !document.querySelector(".modal"), { label: "day saved" });
      await click(p, ".back-link", "일정 목록으로");
    }
    const days = await p.evaluate(() => [...document.querySelectorAll(".day-summary")].map((d) => d.innerText.split(String.fromCharCode(10)).join(" ")));
    const t = await fsGet(`trips/${trip.id}`);
    const auto = t.days.map((d) => d.date).join(",") === [10, 11, 12, 13].map(isoDay).join(",");
    assert(days0 === 4 && auto && days[0].includes("첫째 날") && days[1].includes("확정"), days.join(" || "));
    return `자동 생성 ${days0}개(${t.days[0].date}~${t.days[3].date}) / ${days.slice(0, 2).join(" || ")}`;
  });

await tc("T-11", A, "여행 기간 밖의 날짜 추가",
  "여행 종료일보다 30일 뒤 날짜를 추가",
  "기간 밖 날짜를 막거나 안내해야 함",
  async () => {
    await click(p, "button", "+ 날짜 추가");
    await fill(p, { date: isoDay(45), summary: "기간 밖" });
    await submitModal(p);
    await wait(800);
    const open = await modalOpen(p);
    const n = open ? await formNote() : "";
    if (open) await click(p, ".modal button", "취소", { exact: true });
    const t = await fsGet(`trips/${trip.id}`);
    const added = t.days.some((d) => d.summary === "기간 밖");
    return { actual: added ? "여행 기간 밖 날짜가 그대로 추가됨" : `막힘: "${n}"`, status: added ? "WARN" : "PASS", note: added ? "여행 기간 밖 날짜도 아무 안내 없이 추가됨" : "" };
  });

await tc("T-12", A, "같은 날짜를 두 번 추가한 뒤 두 번째 날짜에 항목 추가",
  "이미 있는 날짜(출발일)를 한 번 더 추가 → 목록의 두 번째 '출발일' 카드에 항목 추가",
  "중복 날짜를 막거나, 항목이 사용자가 연 날짜에 들어가야 함",
  async () => {
    await click(p, "button", "+ 날짜 추가");
    await fill(p, { date: isoDay(10), summary: "중복 날짜" });
    await submitModal(p);
    await wait(800);
    if (await modalOpen(p)) { const n = await formNote(); await click(p, ".modal button", "취소", { exact: true }); return `중복 날짜 막힘: "${n}"`; }
    const idx = await p.evaluate(() => [...document.querySelectorAll(".day-summary")].findIndex((d) => d.innerText.includes("중복 날짜")));
    await p.evaluate((i) => document.querySelectorAll(".day-summary")[i].click(), idx);
    await click(p, "button", "+ 항목 추가");
    await fill(p, { timeValue: "08:00", text: "중복 날짜에 넣은 항목" });
    await submitModal(p);
    await wait(800);
    const t = await fsGet(`trips/${trip.id}`);
    const dup = t.days.find((d) => d.summary === "중복 날짜");
    const landed = t.days.find((d) => (d.items || []).some((i) => i.text === "중복 날짜에 넣은 항목"));
    // clean up: delete the duplicate day through the UI
    await click(p, ".back-link", "일정 목록으로");
    const ok = landed === dup;
    return { actual: `같은 날짜 추가 허용됨. 항목이 들어간 날: "${landed?.summary}" (연 날: "중복 날짜")`, status: ok ? "WARN" : "FAIL", note: ok ? "같은 날짜가 두 번 생길 수 있음" : "버그: 같은 날짜가 두 개일 때 두 번째 날에 추가한 항목이 첫 번째 날로 들어감(수정·삭제도 같은 문제)" };
  });

// clean up the duplicate + out-of-range days via UI delete so later tests have 2 days
for (const s of ["중복 날짜", "기간 밖"]) {
  const idx = await p.evaluate((s) => [...document.querySelectorAll(".day-summary")].findIndex((d) => d.innerText.includes(s)), s);
  if (idx >= 0) {
    await p.evaluate((i) => document.querySelectorAll(".day-summary")[i].click(), idx);
    await click(p, ".detail-head button", "삭제", { exact: true });
    await click(p, ".modal button", "삭제", { exact: true });
    await wait(800);
  }
}
{
  // The duplicate-date bug may have removed the wrong day; restore the fixture state directly.
  const t = await fsGet(`trips/${trip.id}`);
  const keep = [
    { date: isoDay(10), status: "open", summary: "첫째 날", items: [] },
    { date: isoDay(11), status: "confirmed", summary: "둘째 날", items: [] },
  ];
  if (t.days.length !== 2 || t.days[0].summary !== "첫째 날") {
    const { fsSet } = await import("./h.mjs");
    await fsSet(`trips/${trip.id}?updateMask.fieldPaths=days`, { days: keep });
  }
}

await p.goto(TRIP() + "/itinerary", { waitUntil: "domcontentloaded" });
await waitFor(p, () => document.querySelectorAll(".day-summary").length === 2, { label: "2 days" });
await p.evaluate(() => document.querySelectorAll(".day-summary")[0].click());

await tc("T-13", A, "시간 항목 추가 — 시간순 자동 정렬",
  "첫째 날에 15:00 '오사카성', 09:30 '호텔 조식', 12:00 '구로몬 시장; 점심, 타코야키' 순서로 추가",
  "타임라인이 09:30 → 12:00 → 15:00 순서로 표시",
  async () => {
    for (const [time, t] of [["15:00", "오사카성"], ["09:30", "호텔 조식"], ["12:00", "구로몬 시장; 점심, 타코야키"]]) {
      await click(p, "button", "+ 항목 추가");
      await fill(p, { timeValue: time, text: t });
      await submitModal(p);
      await waitFor(p, () => !document.querySelector(".modal"), { label: "item saved" });
    }
    const times = await p.evaluate(() => [...document.querySelectorAll(".card")[0].querySelectorAll(".plan-time")].map((e) => e.innerText));
    assert(times.join(",") === "09:30,12:00,15:00", times.join(","));
    return times.join(" → ");
  });

await tc("T-14", A, "항목 추가 — 내용 비움",
  "'+ 항목 추가'에서 내용 없이 저장",
  "필수 항목 안내, 저장 안 됨",
  async () => {
    await click(p, "button", "+ 항목 추가");
    await fill(p, { timeValue: "10:00" });
    await submitModal(p);
    const n = await formNote();
    const open = await modalOpen(p);
    await click(p, ".modal button", "취소", { exact: true });
    assert(open && n, n);
    return `안내: "${n}"`;
  });

await tc("T-15", A, "텍스트(시간 미정) 항목 3개 추가 후 드래그로 순서 변경",
  "'이동','쇼핑','귀가' 텍스트 항목 추가 → '귀가'의 손잡이를 끌어 맨 위로",
  "화면과 저장된 데이터 모두 '귀가, 이동, 쇼핑' 순서",
  async () => {
    for (const t of ["이동", "쇼핑", "귀가"]) {
      await click(p, "button", "+ 항목 추가");
      await fill(p, { kind: "label" });
      await fill(p, { labelValue: "기타", text: t });
      await submitModal(p);
      await waitFor(p, () => !document.querySelector(".modal"), { label: "label saved" });
    }
    const handles = await p.$$(".drag-handle");
    const from = await handles[2].boundingBox();
    const to = await handles[0].boundingBox();
    await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(from.x + from.width / 2, from.y + (to.y - from.y - 10) * (i / 10), { steps: 2 });
    await p.mouse.up();
    await wait(1500);
    const shown = await p.evaluate(() => [...document.querySelectorAll(".plan-list")[1].querySelectorAll(".plan-text")].map((e) => e.childNodes[0].textContent.trim()));
    const t = await fsGet(`trips/${trip.id}`);
    const saved = t.days[0].items.filter((i) => i.kind === "label").map((i) => i.text);
    assert(shown.join(",") === "귀가,이동,쇼핑" && saved.join(",") === "귀가,이동,쇼핑", `화면 ${shown} / 저장 ${saved}`);
    return `화면·저장 모두: ${saved.join(" → ")}`;
  });

await tc("T-16", A, "항목 수정",
  "'오사카성' 항목 '수정' → 내용을 '오사카성 천수각'으로 저장",
  "목록과 데이터에 바뀐 내용 반영",
  async () => {
    await p.evaluate(() => { const li = [...document.querySelectorAll(".plan-list li")].find((l) => l.innerText.includes("오사카성")); [...li.querySelectorAll("button")].find((b) => b.innerText === "수정").click(); });
    await wait(400);
    await fill(p, { text: "오사카성 천수각" });
    await submitModal(p);
    await wait(700);
    const t = await fsGet(`trips/${trip.id}`);
    assert(t.days[0].items.some((i) => i.text === "오사카성 천수각" && i.time === "15:00"), JSON.stringify(t.days[0].items));
    return "15:00 '오사카성 천수각'으로 변경됨";
  });

let mapOk = false;
await tc("T-17", A, "지도에서 위치 찍기",
  "'호텔 조식' 수정 → '📍 지도에서 위치 찍기' → 지도 가운데 클릭 → '이 위치로 저장' → 항목 저장",
  "선택한 좌표/주소가 항목에 저장되고 목록에 '📍 지도' 링크 표시",
  async () => {
    await p.evaluate(() => { const li = [...document.querySelectorAll(".plan-list li")].find((l) => l.innerText.includes("호텔 조식")); [...li.querySelectorAll("button")].find((b) => b.innerText === "수정").click(); });
    await wait(400);
    await click(p, ".modal button", "지도에서 위치 찍기");
    await waitFor(p, () => !!document.querySelector(".map-picker-map .gm-style"), { label: "google map", timeout: 15000 });
    await wait(1500);
    const box = await (await p.$(".map-picker-map")).boundingBox();
    await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await waitFor(p, () => document.querySelector(".map-picker-address")?.innerText.includes("선택한 위치"), { label: "picked", timeout: 8000 });
    await wait(1500);
    const addr = await p.evaluate(() => document.querySelector(".map-picker-address").innerText);
    await click(p, ".modal button", "이 위치로 저장");
    await submitModal(p);
    await wait(800);
    const t = await fsGet(`trips/${trip.id}`);
    const it = t.days[0].items.find((i) => i.text === "호텔 조식");
    assert(it?.location?.lat, JSON.stringify(it));
    mapOk = true;
    return `${addr.replace(/\n/g, " ")} → 저장 좌표 ${it.location.lat.toFixed(4)}, ${it.location.lng.toFixed(4)}`;
  });

await tc("T-18", A, "위치 보기 / 하루 동선 지도",
  "위치가 있는 항목의 '📍 지도' 클릭 → 닫기 → '🗺 동선 보기' 클릭",
  "위치 보기 지도와 동선 지도(순번 목록 포함)가 열림",
  async () => {
    if (!mapOk) return { actual: "T-17 실패로 건너뜀", status: "SKIP" };
    await click(p, ".plan-text button", "📍");
    await waitFor(p, () => !!document.querySelector(".modal .gm-style"), { label: "location map", timeout: 15000 });
    await click(p, ".modal button", "닫기");
    await click(p, "button", "동선 보기");
    await waitFor(p, () => !!document.querySelector(".modal .gm-style"), { label: "route map", timeout: 15000 });
    await wait(1000);
    const stops = await p.evaluate(() => [...document.querySelectorAll(".route-stops li")].map((l) => l.innerText));
    await shot(p, "route-map");
    await click(p, ".modal button", "닫기");
    assert(stops.length >= 1, "no stops");
    return `동선 목록: ${stops.join(" / ")}`;
  });

await tc("T-19", A, "항목 삭제",
  "'쇼핑' 항목 '삭제' → 확인 창에서 '삭제'",
  "항목이 목록과 데이터에서 사라짐",
  async () => {
    await p.evaluate(() => { const li = [...document.querySelectorAll(".plan-list li")].find((l) => l.innerText.includes("쇼핑")); [...li.querySelectorAll("button")].find((b) => b.innerText === "삭제").click(); });
    await wait(300);
    const q = await modalText(p);
    await click(p, ".modal button", "삭제", { exact: true });
    await wait(800);
    const t = await fsGet(`trips/${trip.id}`);
    assert(!t.days[0].items.some((i) => i.text === "쇼핑"), "still there");
    await wait(800);
    const screen = await p.evaluate(() => ({ detail: !!document.querySelector(".detail-head"), body: document.body.innerText.slice(0, 300) }));
    await shot(p, "after-delete-label-item");
    if (!screen.detail) {
      await p.reload({ waitUntil: "domcontentloaded" });
      await waitFor(p, () => document.querySelectorAll(".day-summary").length > 0, { label: "list after reload" });
      await p.evaluate(() => document.querySelectorAll(".day-summary")[0].click());
      await wait(500);
      return { actual: `데이터에서는 삭제됨. 그러나 화면이 깨짐: "${screen.body.split(String.fromCharCode(10)).join(" ").slice(0, 160)}"`, status: "FAIL", note: "버그: 시간 미정 항목이 있는 날에서 항목을 삭제하면 화면 오류가 남 — 새로고침해야 복구" };
    }
    return "삭제됨, 화면 정상";
  });

await tc("T-20", A, "날짜 수정 (상태·요약)",
  "첫째 날 '날짜 수정' → 상태 '확정', 요약 '오사카 시내'",
  "상세 화면과 목록에 반영",
  async () => {
    await click(p, ".detail-head button", "날짜 수정");
    await fill(p, { status: "confirmed", summary: "오사카 시내" });
    await submitModal(p);
    await wait(700);
    const sub = await text(p, ".detail-sub");
    assert(sub === "오사카 시내", sub);
    return `요약 "${sub}", 상태 확정`;
  });

await tc("T-21", A, "여행 메모 자동 저장",
  "일정 목록의 메모칸에 입력 후 다른 곳 클릭(포커스 해제)",
  "'저장 중…' 후 데이터에 저장, 새로고침해도 유지",
  async () => {
    await click(p, ".back-link", "일정 목록으로");
    await p.click(".itinerary-memo");
    await p.keyboard.type("여권 챙기기! 환전은 공항에서");
    await p.click("h2");
    await waitFor(p, () => [...document.querySelectorAll(".section-note")].some((n) => n.innerText.includes("저장됨")), { label: "saved badge", timeout: 5000 });
    await wait(300);
    await p.reload({ waitUntil: "domcontentloaded" });
    await waitFor(p, () => !!document.querySelector(".itinerary-memo"), { label: "memo" });
    await wait(1000);
    const v = await p.$eval(".itinerary-memo", (t) => t.value);
    assert(v === "여권 챙기기! 환전은 공항에서", v);
    return `새로고침 후 메모: "${v}"`;
  });

await tc("T-22", A, "메모 입력 중 바로 탭 이동",
  "메모 입력 후 포커스를 빼지 않고 곧바로 '예산' 탭 클릭",
  "입력한 메모가 저장되어 있어야 함",
  async () => {
    await p.click(".itinerary-memo");
    await p.keyboard.press("End");
    await p.keyboard.type(" / 추가메모");
    const tabs = await p.$$(".tab");
    for (const t of tabs) if ((await t.evaluate((e) => e.innerText)) === "예산") { await t.click(); break; }
    await wait(1500);
    const t = await fsGet(`trips/${trip.id}`);
    const saved = (t.itineraryMemo || "").includes("추가메모");
    return { actual: saved ? "탭 이동 시에도 저장됨" : `저장 안 됨 (저장된 메모: "${t.itineraryMemo}")`, status: saved ? "PASS" : "WARN", note: saved ? "" : "메모 칸에서 포커스를 빼지 않고 탭을 옮기면 입력 내용이 사라질 수 있음" };
  });

await tc("T-23", A, "새로고침 시 현재 탭 유지 / 없는 여행 주소",
  "/trip/<id>/budget 에서 새로고침 → /trip/없는ID 접속",
  "예산 탭 유지, 없는 여행은 '여행을 찾을 수 없어요' 안내",
  async () => {
    await p.goto(TRIP() + "/budget", { waitUntil: "domcontentloaded" });
    await waitFor(p, () => !!document.querySelector(".tab.active"), { label: "tab" });
    const active = await text(p, ".tab.active");
    await p.goto(BASE + "/trip/doesnotexist123/itinerary", { waitUntil: "domcontentloaded" });
    await wait(2500);
    const body = await text(p, "body");
    assert(active === "예산" && body.includes("찾을 수 없어요"), `${active} / ${body.slice(0, 80)}`);
    return `탭 '${active}' 유지, 없는 여행 안내 표시`;
  });

// ---- calendar export -----------------------------------------------------
await tc("T-24", A, "캘린더(.ics) 내보내기 — 확인 창과 파일 내용",
  "'📅 캘린더로 내보내기' → 확인 창 '내보내기' → 생성된 파일 분석",
  "일정 수만큼 이벤트, 시간 항목은 시각 포함·텍스트 항목은 하루 종일, 쉼표/세미콜론 이스케이프, 위치 주소 포함",
  async () => {
    await p.goto(TRIP() + "/itinerary", { waitUntil: "domcontentloaded" });
    await waitFor(p, () => !!document.querySelector(".trip-actions"), { label: "trip" });
    await p.evaluate(() => { window.__blobs = []; const o = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blobs.push(b); return o(b); }; });
    await click(p, ".trip-actions button", "캘린더로 내보내기");
    const q = await modalText(p);
    await click(p, ".modal button", "내보내기", { exact: true });
    await wait(800);
    const ics = await p.evaluate(async () => window.__blobs.length ? await window.__blobs.at(-1).text() : "");
    fs.writeFileSync(new URL("./shots/export.ics", import.meta.url), ics);
    const t = await fsGet(`trips/${trip.id}`);
    const nItems = t.days.reduce((n, d) => n + (d.items || []).length, 0);
    const events = (ics.match(/BEGIN:VEVENT/g) || []).length;
    const timed = (ics.match(/DTSTART:\d{8}T\d{6}/g) || []).length;
    const allDay = (ics.match(/DTSTART;VALUE=DATE:/g) || []).length;
    const escaped = ics.split("\r\n ").join("").includes("구로몬 시장\\; 점심\\, 타코야키");
    const loc = /LOCATION:/.test(ics);
    const lineLong = ics.split("\r\n").some((l) => new TextEncoder().encode(l).length > 75);
    assert(events === nItems && escaped, JSON.stringify({ events, nItems, escaped }));
    return { actual: `확인 창: "${q.split(String.fromCharCode(10)).map((l) => l.trim()).filter((l) => l.length > 6)[0]?.slice(0, 50)}…" / 이벤트 ${events}개(항목 ${nItems}개), 시간 ${timed}·종일 ${allDay}, 특수문자 이스케이프 OK, 위치 ${loc ? "포함" : "없음"}${lineLong ? ", 75바이트 넘는 줄 있음(줄 접기 미적용)" : ""}`, status: lineLong ? "WARN" : "PASS", note: lineLong ? "ICS 규격상 75바이트 초과 줄은 접어야 함 — 긴 한글 제목은 일부 캘린더 앱에서 잘릴 수 있음" : "" };
  });

await tc("T-25", A, "일정이 하나도 없는 여행의 캘린더 내보내기",
  "일정이 없는 'E2E 부산'에서 '캘린더로 내보내기'",
  "'내보낼 일정이 없어요' 알림, 파일 생성 안 됨",
  async () => {
    const busan = await tripByTitle("E2E 부산");
    await p.goto(`${BASE}/trip/${busan.id}/itinerary`, { waitUntil: "domcontentloaded" });
    await waitFor(p, () => !!document.querySelector(".trip-actions"), { label: "trip" });
    p.__lastDialog = null;
    await click(p, ".trip-actions button", "캘린더로 내보내기");
    await wait(600);
    assert(p.__lastDialog?.includes("일정이 없어요") && !(await modalOpen(p)), String(p.__lastDialog));
    return `알림: "${p.__lastDialog}"`;
  });

await tc("T-26", A, "여행 정보 수정",
  "'여행 정보 수정' → 제목 'E2E 오사카 수정', 예산 1,200,000",
  "제목·예산 칩이 바뀜",
  async () => {
    await p.goto(TRIP() + "/itinerary", { waitUntil: "domcontentloaded" });
    await click(p, "button", "여행 정보 수정");
    await fill(p, { title: "E2E 오사카 수정", budgetTotal: "1200000" });
    await submitModal(p);
    await wait(800);
    const h = await text(p, ".trip-head h1");
    const chips = await text(p, ".chips");
    assert(h === "E2E 오사카 수정" && chips.includes("1,200,000"), h + " " + chips);
    return `제목 "${h}", 예산 1,200,000원`;
  });

await tc("T-27", A, "여행 정보 수정 — 여행 기간 변경 시 기존 날짜",
  "여행 시작·종료일을 5일 뒤로 미룸",
  "이미 만든 일자별 일정 날짜를 함께 옮기거나 안내해야 함",
  async () => {
    await click(p, "button", "여행 정보 수정");
    await fill(p, { startDate: isoDay(15), endDate: isoDay(18) });
    await submitModal(p);
    await wait(800);
    const t = await fsGet(`trips/${trip.id}`);
    const out = t.days.filter((d) => d.date < t.startDate || d.date > t.endDate).length;
    // restore
    await click(p, "button", "여행 정보 수정");
    await fill(p, { startDate: isoDay(10), endDate: isoDay(13) });
    await submitModal(p);
    await wait(600);
    return { actual: out ? `기간을 옮겨도 기존 날짜 ${out}개가 새 기간 밖에 그대로 남음` : "날짜가 함께 이동됨", status: out ? "WARN" : "PASS", note: out ? "기간 변경 시 일정 날짜가 따라 움직이지 않아 기간 밖 일정이 생김" : "" };
  });

let copyTrip;
await tc("T-28", A, "여행 복제",
  "'📋 여행 복제' → 새 출발일을 원래보다 30일 뒤로 → 복제",
  "새 여행이 만들어지고 일정 날짜가 30일씩 이동, 메모·체크리스트는 복사, 예산·예약·동행자는 복사 안 됨",
  async () => {
    await click(p, ".trip-actions button", "여행 복제");
    const title = await p.$eval(".modal input[name=title]", (i) => i.value);
    await fill(p, { startDate: isoDay(40) });
    await submitModal(p);
    const srcId = trip.id;
    const end = Date.now() + 10000;
    while (Date.now() < end && !(await p.evaluate((id) => !location.pathname.includes(id) && location.pathname.startsWith("/trip/"), srcId))) await wait(200);
    copyTrip = await tripByTitle(title);
    const src = await fsGet(`trips/${trip.id}`);
    const shifted = copyTrip.days.every((d, i) => d.date === isoDay(40 + i));
    assert(copyTrip && shifted && (copyTrip.itineraryMemo || "") === (src.itineraryMemo || "") && copyTrip.checklist.length === src.checklist.length && (copyTrip.budgetItems || []).length === 0 && copyTrip.memberIds.length === 1, JSON.stringify({ days: copyTrip?.days?.map((d) => d.date), memo: copyTrip?.itineraryMemo }));
    return `"${title}" 생성, 날짜 ${copyTrip.days.map((d) => d.date).join(",")}, 메모·체크리스트 ${copyTrip.checklist.length}개 복사`;
  });

await tc("T-29", A, "새 여행 만들 때 다른 여행의 체크리스트 가져오기",
  "새 여행 폼의 '체크리스트' 선택에서 'E2E 부산'의 체크리스트 선택",
  "새 여행에 부산 여행 준비물 6개가 복사됨 (체크 상태는 초기화)",
  async () => {
    await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await openNewTrip();
    const busan = await tripByTitle("E2E 부산");
    const opts = await p.evaluate(() => [...document.querySelectorAll(".modal select[name=checklistFrom] option")].map((o) => o.innerText));
    await pickDestination("도쿄");
    await fill(p, { title: "E2E 체크리스트복사", startDate: isoDay(60), endDate: isoDay(62), checklistFrom: busan.id });
    await submitModal(p);
    await waitFor(p, () => location.pathname.startsWith("/trip/"), { label: "trip" });
    const t = await tripByTitle("E2E 체크리스트복사");
    assert(t.checklist.length === 6, String(t.checklist.length));
    return `선택지 ${opts.length}개, 복사된 준비물 ${t.checklist.length}개`;
  });

await tc("T-30", A, "아주 긴 여행 제목(80자) 화면 표시",
  "제목을 80자로 바꾼 뒤 데스크톱/휴대폰에서 여행 화면과 목록 확인",
  "가로 넘침 없이 줄바꿈되어 표시",
  async () => {
    const t = await tripByTitle("E2E 체크리스트복사");
    await p.goto(`${BASE}/trip/${t.id}/itinerary`, { waitUntil: "domcontentloaded" });
    await click(p, "button", "여행 정보 수정");
    await fill(p, { title: "아주긴제목테스트".repeat(10) });
    await submitModal(p); await wait(800);
    const d = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await waitFor(p, () => !!document.querySelector(".trip-head"), { label: "reload" }); await wait(1500);
    const m = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await shot(p, "long-title-mobile");
    await p.setViewport({ width: 1280, height: 900 });
    await waitFor(p, () => !!document.querySelector(".trip-head"), { label: "reload" }); await wait(1000);
    return { actual: `가로 넘침 데스크톱 ${d}px / 휴대폰 ${m}px`, status: d > 0 || m > 0 ? "WARN" : "PASS", note: d > 0 || m > 0 ? "긴 제목에서 화면이 가로로 넘침" : "" };
  });

await tc("T-31", A, "여행 삭제",
  "복제한 여행에서 '삭제' → 확인",
  "여행이 삭제되고 목록으로 이동",
  async () => {
    await p.goto(`${BASE}/trip/${copyTrip.id}/itinerary`, { waitUntil: "domcontentloaded" });
    await waitFor(p, () => !!document.querySelector(".trip-head"), { label: "trip" });
    await click(p, ".trip-head button", "삭제", { exact: true });
    const q = await modalText(p);
    await click(p, ".modal button", "삭제", { exact: true });
    await waitFor(p, () => location.pathname === "/", { label: "home" });
    const gone = !(await fsGet(`trips/${copyTrip.id}`));
    assert(gone, "still exists");
    return `확인 문구 "${q.replace(/\n/g, " ").slice(0, 40)}" → 삭제, 목록으로 이동`;
  });

await tc("T-32", A, "여행 화면 콘솔 오류",
  "위 모든 과정 동안 브라우저 오류 수집",
  "자바스크립트 오류 없음",
  async () => {
    const errs = p.__errors.filter((e) => !/favicon|net::|ERR_|Download the React DevTools/.test(e));
    return { actual: errs.length ? errs.slice(0, 5).join(" | ") : "오류 0건", status: errs.length ? "WARN" : "PASS" };
  });

fs.writeFileSync(new URL("./state.json", import.meta.url), JSON.stringify({ OWNER, tripId: trip.id }));
await browser.close();
