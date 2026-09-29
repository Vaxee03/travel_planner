// Suite 6 — everyday UX edge cases: double clicks, back button, closing
// dialogs, phone-sized forms.
import { BASE, launch, newUserPage, tc, assert, wait, waitFor, text, click, fill, submitModal, modalOpen, modalText, shot, signInAs, fsGet, fsSet, fsList, isoDay } from "./h.mjs";

const browser = await launch();
const stamp = Date.now();
const O = `ux${stamp}`;
const TRIP_ID = `ux${stamp}`;
const A = "사용성·예외 상황";
await fsSet(`trips/${TRIP_ID}`, {
  ownerId: O, memberIds: [O], title: "E2E 사용성", destination: "오사카시, 일본 오사카부", tripType: "international",
  startDate: isoDay(10), endDate: isoDay(12), travelers: 1, budgetTotal: 0,
  days: [{ date: isoDay(10), status: "open", summary: "", items: [] }], checklist: [], budgetItems: [], bookings: [],
});
const p = await newUserPage(browser);
await signInAs(p, O, "사용성");
const openTrip = async (tabKey = "itinerary") => { await p.goto(`${BASE}/trip/${TRIP_ID}/${tabKey}`, { waitUntil: "domcontentloaded" }); await waitFor(p, () => !!document.querySelector(".tabbar"), { label: "trip" }); await wait(600); };

await tc("U-01", A, "저장 버튼 빠르게 두 번 클릭 — 지출 추가",
  "예산 '+ 항목 추가' → 내용 입력 → '추가' 버튼을 빠르게 두 번 클릭",
  "지출이 한 번만 저장되어야 함",
  async () => {
    await openTrip("budget");
    await click(p, "button", "+ 항목 추가");
    await fill(p, { category: "더블클릭", amount: "1000" });
    await p.evaluate(() => { const b = [...document.querySelectorAll(".modal")].pop().querySelector('button[type="submit"]'); b.click(); b.click(); });
    await wait(2000);
    const t = await fsGet(`trips/${TRIP_ID}`);
    const n = t.budgetItems.filter((i) => i.category === "더블클릭").length;
    return { actual: `저장된 개수: ${n}개`, status: n === 1 ? "PASS" : "FAIL", note: n === 1 ? "" : "버그: 저장 버튼을 빨리 두 번 누르면 같은 항목이 중복 저장됨 (저장 중 버튼 비활성화 필요)" };
  });

await tc("U-02", A, "저장 버튼 빠르게 두 번 클릭 — 새 여행 만들기",
  "여행 목록 '+ 새 여행' → 입력(목적지는 목록에서 선택) → '여행 만들기' 두 번 클릭",
  "여행이 하나만 생성되어야 함",
  async () => {
    await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await click(p, "button", "+ 새 여행");
    await waitFor(p, () => !!document.querySelector(".modal input[name=destination]"), { label: "form" });
    await p.type(".modal input[name=destination]", "오사카", { delay: 60 });
    await waitFor(p, () => document.querySelectorAll("[role=option]").length > 0, { label: "options", timeout: 12000 });
    await p.evaluate(() => document.querySelector("[role=option]").click());
    await fill(p, { title: "더블클릭여행", startDate: isoDay(30), endDate: isoDay(31) });
    await p.evaluate(() => { const b = [...document.querySelectorAll(".modal")].pop().querySelector('button[type="submit"]'); b.click(); b.click(); });
    await wait(3000);
    const n = (await fsList("trips")).filter((t) => t.title === "더블클릭여행" && t.ownerId === O).length;
    return { actual: `생성된 여행: ${n}개`, status: n === 1 ? "PASS" : "FAIL", note: n === 1 ? "" : "버그: '여행 만들기'를 빨리 두 번 누르면 같은 여행이 두 개 생김" };
  });

await tc("U-03", A, "입력창이 열린 상태에서 브라우저 '뒤로가기'",
  "여행 화면에서 '여행 정보 수정' 창을 연 채 브라우저 뒤로가기",
  "창이 닫히거나, 남더라도 엉뚱한 화면에 저장되지 않아야 함",
  async () => {
    await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await wait(800);
    await openTrip();
    await click(p, "button", "여행 정보 수정");
    await waitFor(p, () => !!document.querySelector(".modal input[name=title]"), { label: "edit form" });
    await p.goBack();
    await wait(1200);
    const r = await p.evaluate(() => ({ path: location.pathname, modal: !!document.querySelector(".modal"), title: document.querySelector(".modal h3")?.innerText }));
    let savedWrong = "";
    if (r.modal) {
      await fill(p, { title: "뒤로가기 후 저장" }).catch(() => {});
      p.__errors.length = 0;
      await submitModal(p).catch(() => {});
      await wait(1500);
      const errs = p.__errors.filter((e) => !/DevTools/.test(e));
      savedWrong = errs.length ? `저장 시 오류: ${errs[0].slice(0, 80)}` : "저장 시도됨";
      if (await modalOpen(p)) await click(p, ".modal button", "취소", { exact: true }).catch(() => {});
    }
    return { actual: `뒤로가기 후 주소 ${r.path}, 입력창 ${r.modal ? `"${r.title}" 그대로 열림 (${savedWrong})` : "닫힘"}`, status: r.modal ? "WARN" : "PASS", note: r.modal ? "뒤로가기로 여행 목록에 와도 '여행 정보 수정' 창이 남아 있고, 저장하면 오류가 남" : "" };
  });

await tc("U-04", A, "입력창 닫기 — Esc 키 / 바깥 영역 클릭 (작성 중이면 확인)",
  "'+ 날짜 추가' 창을 열고 바로 Esc → 다시 열어 요약을 입력한 뒤 바깥 어두운 영역 클릭",
  "빈 창은 Esc로 바로 닫히고, 작성 중인 창은 '작성 중인 내용이 사라져요' 확인 후 닫힘",
  async () => {
    await openTrip();
    await click(p, "button", "+ 날짜 추가");
    await waitFor(p, () => !!document.querySelector(".modal"), { label: "modal" });
    await p.keyboard.press("Escape"); await wait(400);
    const esc = !(await modalOpen(p));
    await click(p, "button", "+ 날짜 추가");
    await waitFor(p, () => !!document.querySelector(".modal input[name=summary]"), { label: "modal" });
    await p.type(".modal input[name=summary]", "작성 중");
    p.__lastDialog = null;
    await p.mouse.click(5, 5); await wait(500);
    const asked = p.__lastDialog || "";
    const closed = !(await modalOpen(p));
    if (!closed) await click(p, ".modal button", "취소", { exact: true });
    assert(esc && asked.includes("사라져요") && closed, JSON.stringify({ esc, asked, closed }));
    return `빈 창 Esc로 닫힘 / 작성 중 바깥 클릭 → 확인 "${asked}" → 닫힘`;
  });

await tc("U-05", A, "휴대폰(작은 화면)에서 새 여행 입력창",
  "375x667 화면에서 '+ 새 여행' 창 열기",
  "모든 입력칸과 '여행 만들기' 버튼까지 스크롤해서 닿을 수 있음, 가로 넘침 없음",
  async () => {
    await p.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
    await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await click(p, "button", "+ 새 여행");
    await waitFor(p, () => !!document.querySelector(".modal button[type=submit]"), { label: "form" });
    const r = await p.evaluate(() => {
      const m = document.querySelector(".modal");
      const btn = m.querySelector("button[type=submit]");
      btn.scrollIntoView({ block: "end" });
      const b = btn.getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - innerWidth, modalScroll: m.scrollHeight > m.clientHeight, btnVisible: b.bottom <= innerHeight && b.top >= 0, modalW: Math.round(m.getBoundingClientRect().width) };
    });
    await shot(p, "mobile-new-trip");
    await click(p, ".modal button", "취소", { exact: true });
    await p.setViewport({ width: 1280, height: 900 });
    assert(r.overflow <= 0 && r.btnVisible, JSON.stringify(r));
    return `창 너비 ${r.modalW}px, 내부 스크롤 ${r.modalScroll ? "있음" : "불필요"}, 버튼 도달 가능, 가로 넘침 없음`;
  });

await tc("U-06", A, "휴대폰에서 여행 화면 탭·버튼 줄",
  "375px 화면에서 여행 상세 화면 확인",
  "탭과 기능 버튼 줄이 가로 스크롤로 모두 접근 가능, 페이지 가로 넘침 없음",
  async () => {
    await p.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
    await openTrip();
    const r = await p.evaluate(() => {
      const tb = document.querySelector(".tabbar"), ta = document.querySelector(".trip-actions");
      return { overflow: document.documentElement.scrollWidth - innerWidth, tabScroll: tb.scrollWidth > tb.clientWidth ? getComputedStyle(tb).overflowX : "fits", actScroll: ta.scrollWidth > ta.clientWidth ? getComputedStyle(ta).overflowX : "fits" };
    });
    await shot(p, "mobile-trip");
    await p.setViewport({ width: 1280, height: 900 });
    assert(r.overflow <= 0 && r.tabScroll !== "visible" && r.actScroll !== "visible", JSON.stringify(r));
    const hidden = r.actScroll !== "fits";
    return { actual: `가로 넘침 ${r.overflow}px, 탭 줄: ${r.tabScroll}, 기능 버튼 줄: ${r.actScroll}`, status: hidden ? "WARN" : "PASS", note: hidden ? "휴대폰에서 기능 버튼 일부가 화면 밖에 있어 옆으로 밀어야 보임 — 밀 수 있다는 표시가 없음" : "" };
  });

await tc("U-07", A, "여행 화면에서 로그아웃",
  "여행 상세 화면에서 '로그아웃'",
  "랜딩으로 이동, 뒤로가기로 여행 화면이 다시 보이지 않음",
  async () => {
    await openTrip();
    await click(p, "button", "로그아웃", { exact: true });
    await waitFor(p, () => !!document.querySelector(".lp"), { label: "landing" });
    await p.goBack(); await wait(1500);
    const body = await text(p);
    const leaked = body.includes("E2E 사용성");
    assert(!leaked, body.slice(0, 80));
    return `뒤로가기 후 화면: ${(await p.evaluate(() => location.pathname))} — 여행 내용 노출 없음`;
  });

await browser.close();
