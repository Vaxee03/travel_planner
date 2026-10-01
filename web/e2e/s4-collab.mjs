// Suite 4 — invite / join / permissions / realtime / budget & settlement /
// checklist / bookings / member management. Three users in separate profiles.
import { BASE, launch, newUserPage, tc, assert, wait, waitFor, text, click, fill, submitModal, modalOpen, modalText, answerDialog, shot, signInAs, fsGet, fsSet, isoDay } from "./h.mjs";

const browser = await launch();
const stamp = Date.now();
const O = `o${stamp}`, B = `b${stamp}`, C = `c${stamp}`;
const TRIP_ID = `collab${stamp}`;
const A1 = "초대·실시간 협업", A2 = "예산·정산", A3 = "체크리스트", A4 = "예약 정보", A5 = "동행자 관리";

await fsSet(`trips/${TRIP_ID}`, {
  ownerId: O, memberIds: [O], title: "E2E 협업 여행", destination: "오사카시, 일본 오사카부", tripType: "international",
  startDate: isoDay(10), endDate: isoDay(12), travelers: 3, budgetTotal: 900000,
  days: [{ date: isoDay(10), status: "open", summary: "첫째 날", items: [{ kind: "time", time: "10:00", text: "오사카성" }] }],
  checklist: [{ id: "c1", text: "여권" }, { id: "c2", text: "충전기" }],
  budgetItems: [], bookings: [],
});

const ctxO = await browser.createBrowserContext();
await ctxO.overridePermissions(BASE, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
const po = await ctxO.newPage(); await po.setViewport({ width: 1280, height: 900 });
po.__errors = []; po.on("pageerror", (e) => po.__errors.push(e.message)); po.on("dialog", async (d) => { po.__lastDialog = d.message(); await d.accept(); });
const pb = await newUserPage(browser);
const pc = await newUserPage(browser);
await signInAs(po, O, "민수");
await signInAs(pb, B, "지은");

const TRIP = `${BASE}/trip/${TRIP_ID}`;
const openTrip = async (p, tab = "itinerary") => { await p.goto(`${TRIP}/${tab}`, { waitUntil: "domcontentloaded" }); await waitFor(p, () => !!document.querySelector(".tabbar"), { label: "trip", timeout: 15000 }); await wait(600); };
const tab = async (p, name) => { const tabs = await p.$$(".tab"); for (const t of tabs) if ((await t.evaluate((e) => e.innerText.trim())) === name) { await t.click(); break; } await wait(600); };

await openTrip(po);

await tc("C-01", A1, "동행자 초대 창 — 참여 코드·링크·초대장 이미지",
  "방장이 '🎟 동행자 초대' 클릭",
  "참여 코드(여행 ID), /join/ 링크, 초대장 이미지가 그려지고 다운로드/공유 버튼이 있음",
  async () => {
    await click(po, ".trip-actions button", "동행자 초대");
    await waitFor(po, () => !!document.querySelector(".modal canvas"), { label: "invite canvas" });
    await wait(1500);
    const r = await po.evaluate(() => {
      const inputs = [...document.querySelectorAll(".modal input")].map((i) => i.value);
      const c = document.querySelector(".modal canvas");
      const px = c.getContext("2d").getImageData(c.width / 2, c.height / 2, 1, 1).data;
      return { inputs, w: c.width, painted: px[3] > 0, btns: [...document.querySelectorAll(".modal button")].map((b) => b.innerText) };
    });
    assert(r.inputs[0] === TRIP_ID && r.inputs.some((v) => v.endsWith(`/join/${TRIP_ID}`)) && r.painted, JSON.stringify(r));
    await shot(po, "invite-modal");
    return `코드 "${r.inputs[0]}", 링크 "${r.inputs[1]}", 이미지 ${r.w}px 그려짐, 버튼: ${r.btns.join("/")}`;
  });

await tc("C-02", A1, "초대 링크 복사/공유 버튼 (공유 기능이 없는 PC 브라우저)",
  "초대 창에서 '링크 복사'(공유) 버튼 클릭 후 클립보드 확인",
  "초대 링크가 클립보드에 복사되고 안내 문구 표시",
  async () => {
    // Headless Edge exposes navigator.share; remove it to exercise the copy
    // fallback that desktop browsers without a share sheet use.
    await po.evaluate(() => { try { delete Navigator.prototype.share; } catch {} navigator.share = undefined; });
    const label = await po.evaluate(() => [...document.querySelectorAll(".modal-actions button")].pop().innerText);
    const btn = (await po.$$(".modal-actions button")).pop();
    await btn.click();
    await wait(800);
    const clip = await po.evaluate(() => navigator.clipboard.readText().catch((e) => "ERR " + e.message));
    const note = await po.evaluate(() => document.querySelector(".modal .section-note")?.innerText || "");
    assert(clip.includes("/join/") && note.includes("복사"), clip + " / " + note);
    return `버튼 "${label}" 클릭 → 클립보드 "${clip}", 안내 "${note}"`;
  });

await tc("C-03", A1, "초대장 이미지 다운로드",
  "초대 창 '이미지 다운로드'",
  "PNG 파일 생성(여행 제목 포함 파일명)",
  async () => {
    await po.evaluate(() => { window.__dl = []; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dl.push(this.download); return o.call(this); }; });
    await click(po, ".modal button", "이미지 다운로드");
    await wait(1500);
    const dl = await po.evaluate(() => window.__dl);
    await click(po, ".modal button", "닫기");
    assert(dl.length === 1 && dl[0].endsWith(".png"), JSON.stringify(dl));
    return `파일명 "${dl[0]}"`;
  });

await tc("C-04", A1, "참여 코드로 합류 + 방장 화면 실시간 반영",
  "지은: 여행 목록 '참여 코드 입력'에 코드 입력 → '코드로 참여하기' / 민수 화면은 새로고침 없이 관찰",
  "지은은 여행 화면으로 이동, 민수 화면의 '동행자:'에 지은이 몇 초 안에 나타남",
  async () => {
    await pb.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await waitFor(pb, () => !!document.querySelector("input[placeholder*='참여 코드']"), { label: "join input" });
    await pb.type("input[placeholder*='참여 코드']", TRIP_ID);
    const t0 = Date.now();
    await click(pb, "button", "코드로 참여하기");
    await waitFor(pb, () => location.pathname.includes("/trip/"), { label: "B in trip" });
    await waitFor(po, () => document.querySelector(".trip-head")?.innerText.includes("지은"), { label: "O sees B", timeout: 10000 });
    return `지은 합류 후 민수 화면 반영까지 약 ${((Date.now() - t0) / 1000).toFixed(1)}초`;
  });

await tc("C-05", A1, "잘못된 참여 코드 / 이미 참여한 여행 코드 재입력",
  "지은: 없는 코드 입력 → 참여 / 이미 참여한 여행 코드 다시 입력",
  "없는 코드는 '코드를 찾을 수 없어요', 이미 참여한 코드는 동행자가 중복되지 않음",
  async () => {
    await pb.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await waitFor(pb, () => !!document.querySelector("input[placeholder*='참여 코드']"), { label: "join input" });
    await pb.type("input[placeholder*='참여 코드']", "nope-not-a-trip");
    await click(pb, "button", "코드로 참여하기");
    await wait(2000);
    const err = await pb.evaluate(() => [...document.querySelectorAll(".section-note")].map((e) => e.innerText).join(" "));
    await pb.evaluate(() => { const i = document.querySelector("input[placeholder*='참여 코드']"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })); });
    await pb.type("input[placeholder*='참여 코드']", ` ${TRIP_ID} `);
    await click(pb, "button", "코드로 참여하기");
    await wait(2000);
    const t = await fsGet(`trips/${TRIP_ID}`);
    assert(err.includes("찾을 수 없") && t.memberIds.length === 2, `${err} / members ${t.memberIds.length}`);
    return `없는 코드: "${err.trim()}" / 재참여 후 동행자 수 ${t.memberIds.length} (앞뒤 공백 포함 입력도 처리됨)`;
  });

await tc("C-06", A1, "로그아웃 상태에서 초대 링크(/join/...)로 합류",
  "서연: 로그인 안 된 브라우저로 /join/<코드> 접속 → 로그인",
  "로그인 화면이 뜨고, 로그인하면 자동으로 그 여행에 합류해 여행 화면 표시",
  async () => {
    await pc.goto(`${BASE}/join/${TRIP_ID}`, { waitUntil: "domcontentloaded" });
    await waitFor(pc, () => !!document.querySelector(".auth-card"), { label: "login shown" });
    const beforeLp = await pc.evaluate(() => !!document.querySelector(".lp"));
    await pc.evaluate((uid) => window.__emulatorSignIn(uid), C);
    await waitFor(pc, () => location.pathname === location.pathname && location.pathname.includes("/trip/"), { label: "C joined", timeout: 15000 });
    await wait(800);
    await waitFor(pc, () => !!document.querySelector(".modal input[name=nickname]"), { label: "C nickname prompt", timeout: 8000 });
    await fill(pc, { nickname: "서연" }); await submitModal(pc);
    await waitFor(pc, () => !document.querySelector(".modal"), { label: "C nickname saved" });
    const t = await fsGet(`trips/${TRIP_ID}`);
    assert(!beforeLp && t.memberIds.includes(C), JSON.stringify(t.memberIds));
    return `로그인 화면 표시 → 로그인 후 자동 합류 (동행자 ${t.memberIds.length}명)`;
  });

await tc("C-07", A1, "동행자 기본 권한 (방장이 권한을 주기 전)",
  "지은 화면에서 각 탭의 추가/수정 버튼과 메모칸 확인",
  "일정·예산·체크리스트·예약 추가 버튼이 없고 메모는 읽기 전용, 방장 전용 버튼(권한 관리 등) 없음, 체크 표시·맛집 추천은 가능",
  async () => {
    await openTrip(pb);
    const r = { };
    r.itin = await pb.evaluate(() => !!document.querySelector("button") && [...document.querySelectorAll("button")].some((b) => b.innerText.includes("+ 날짜 추가")));
    r.memoDisabled = await pb.$eval(".itinerary-memo", (t) => t.disabled);
    r.ownerBtns = await pb.evaluate(() => [...document.querySelectorAll(".trip-actions button")].map((b) => b.innerText).filter((t) => /권한|공개|위임/.test(t)));
    await tab(pb, "예산"); r.budget = await pb.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.innerText.includes("+ 항목 추가")));
    await tab(pb, "체크리스트"); r.check = await pb.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.innerText.includes("+ 항목 추가")));
    r.box = await pb.evaluate(() => document.querySelectorAll(".box-btn").length);
    await tab(pb, "예약정보"); r.book = await pb.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.innerText.includes("+ 예약 추가")));
    await tab(pb, "맛집 추천"); r.food = await pb.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.innerText.includes("맛집 추천 받기")));
    assert(!r.itin && r.memoDisabled && !r.ownerBtns.length && !r.budget && !r.check && r.box === 2 && !r.book && r.food, JSON.stringify(r));
    return "추가 버튼 모두 숨김, 메모 읽기 전용, 방장 버튼 없음, 체크박스·맛집 추천 사용 가능";
  });

await tc("C-08", A1, "방장이 권한 부여 → 동행자 화면 즉시 반영",
  "민수: '🔑 권한 관리'에서 지은에게 일정·예산 권한 체크 → 저장 / 지은 화면 관찰",
  "지은 화면에 새로고침 없이 '+ 항목 추가'(예산)와 '+ 날짜 추가'(일정) 버튼이 나타남",
  async () => {
    await tab(pb, "예산");
    await click(po, ".trip-actions button", "권한 관리");
    await waitFor(po, () => !!document.querySelector(`.modal input[name^="perm_"]`), { label: "perm form" });
    await fill(po, { [`perm_${B}_itinerary`]: true, [`perm_${B}_budget`]: true });
    await submitModal(po);
    await waitFor(pb, () => [...document.querySelectorAll("button")].some((b) => b.innerText.includes("+ 항목 추가")), { label: "B budget add", timeout: 8000 });
    const t = await fsGet(`trips/${TRIP_ID}`);
    return `저장된 권한: ${JSON.stringify(t.memberPermissions)}`;
  });

// ---- budget & settlement --------------------------------------------------
async function addBudget(p, { category, amount, memo = "", paidBy, split }) {
  await click(p, "button", "+ 항목 추가");
  await waitFor(p, () => !!document.querySelector(".modal input[name=category]"), { label: "budget form" });
  const v = { category, amount: String(amount), memo };
  if (paidBy !== undefined) v.paidBy = paidBy;
  if (split) for (const [uid, on] of Object.entries(split)) v[`split_${uid}`] = on;
  await fill(p, v);
  await submitModal(p);
  await waitFor(p, () => !document.querySelector(".modal"), { label: "budget saved", timeout: 8000 });
}

await tab(po, "예산");
await tc("F-01", A2, "지출 추가 (결제자·나눌 사람 지정) — 3명",
  "민수: 숙소 300,000(민수 결제, 3명) / 지은: 식비 90,000(지은 결제, 3명) / 민수: 교통 60,000(서연 결제, 민수·서연만)",
  "세 항목이 모두 저장되고 두 사람 화면에 실시간으로 보임",
  async () => {
    await addBudget(po, { category: "숙소", amount: 300000, paidBy: O });
    await addBudget(pb, { category: "식비", amount: 90000, paidBy: B });
    await addBudget(po, { category: "교통", amount: 60000, paidBy: C, split: { [O]: true, [B]: false, [C]: true } });
    await wait(1500);
    const rowsO = await po.evaluate(() => document.querySelectorAll(".item-row").length);
    const rowsB = await pb.evaluate(() => document.querySelectorAll(".item-row").length);
    assert(rowsO === 3 && rowsB === 3, `${rowsO}/${rowsB}`);
    return "민수·지은 화면 모두 3건 표시";
  });

await tc("F-02", A2, "정산 계산 결과",
  "예산 탭 '💸 정산' 확인",
  "서연 → 민수 100,000원, 지은 → 민수 40,000원 (송금 2건)",
  async () => {
    const read = () => po.evaluate(() => { const s = [...document.querySelectorAll("section")].find((x) => x.innerText.includes("💸 정산")); return s ? [...s.querySelectorAll(".cat-row")].map((r) => r.innerText.replace(/\n/g, " ")) : []; });
    const rows = await read();
    const txt = rows.join(" | ");
    const math = rows.length === 2 && txt.includes("→ 민수 100,000원") && txt.includes("지은 → 민수 40,000원");
    assert(math, txt);
    if (!txt.includes("서연 →")) {
      await po.reload({ waitUntil: "domcontentloaded" });
      await waitFor(po, () => !!document.querySelector(".budget-hero"), { label: "budget after reload" });
      await wait(1200);
      const after = (await read()).join(" | ");
      return { actual: `금액 정확: ${txt} → 새로고침 후: ${after}`, status: "WARN", note: "버그(경미): 여행 화면을 열어 둔 상태에서 새 동행자가 닉네임을 정하면, 다른 사람 화면에는 새로고침 전까지 '이름 없는 동행자'로 보임 (닉네임 캐시가 갱신되지 않음)" };
    }
    return txt;
  });

await tc("F-03", A2, "합계·카테고리 집계·1인당·예산 진행 바",
  "예산 탭 상단 확인 (총 예산 900,000원, 인원 3명)",
  "지출 450,000원, 카테고리 숙소>식비>교통 순, 1인당 지출 150,000원, 진행 바 50%",
  async () => {
    const r = await po.evaluate(() => ({
      spent: document.querySelector(".budget-amount")?.innerText.replace(/\n/g, ""),
      bar: document.querySelector(".budget-bar-fill")?.style.width,
      per: [...document.querySelectorAll(".cat-row")].find((x) => x.innerText.includes("1인당"))?.innerText.replace(/\n/g, " "),
      cats: [...[...document.querySelectorAll("section")].find((s) => s.innerText.startsWith("카테고리별 집계")).querySelectorAll(".cat-row")].map((x) => x.innerText.replace(/\n/g, " ")),
    }));
    assert(r.spent === "450,000원" && r.bar === "50%" && r.per.includes("지출 150,000원") && r.cats[0].startsWith("숙소"), JSON.stringify(r));
    return `지출 ${r.spent}, 바 ${r.bar}, ${r.per}, 카테고리: ${r.cats.join(" / ")}`;
  });

await tc("F-04", A2, "결제자 미지정 지출",
  "결제한 사람 '미지정'으로 기타 30,000원 추가",
  "정산에서 빠지고 '결제한 사람이 지정되지 않은 지출 1건' 안내",
  async () => {
    await addBudget(po, { category: "기타", amount: 30000, paidBy: "" });
    await wait(800);
    const note = await po.evaluate(() => [...document.querySelectorAll(".section-note")].map((e) => e.innerText).find((t) => t.includes("지정되지 않은")) || "");
    assert(note.includes("1건"), note);
    return note;
  });

await tc("F-05", A2, "음수 금액 입력",
  "금액 -50000 으로 지출 추가",
  "음수는 막히거나 안내되어야 함",
  async () => {
    await addBudget(po, { category: "환불", amount: -50000, paidBy: O }).catch(() => {});
    await wait(800);
    const open = await modalOpen(po);
    if (open) { const n = await modalText(po); await click(po, ".modal button", "취소", { exact: true }); return `막힘: ${n.slice(-40)}`; }
    const spent = await text(po, ".budget-amount");
    return { actual: `음수 지출이 저장됨, 지출 합계 ${spent.replace(/\n/g, "")}`, status: "WARN", note: "금액에 음수를 넣어도 저장되어 합계·정산이 줄어듦 (환불 용도가 아니라면 막는 게 좋음)" };
  });

await tc("F-06", A2, "소수점 금액 / 매우 큰 금액",
  "금액 1000.5 와 99,999,999,999 로 지출 추가",
  "원 단위로 표시되고 화면이 깨지지 않음",
  async () => {
    let decMsg = "";
    await addBudget(po, { category: "소수", amount: "1000.5", paidBy: O }).catch(() => {});
    if (await modalOpen(po)) {
      decMsg = await po.evaluate(() => [...document.querySelectorAll(".modal .note")].map((n) => n.innerText).join(" "));
      await click(po, ".modal button", "취소", { exact: true });
    }
    await addBudget(po, { category: "큰금액", amount: "99999999999", paidBy: O });
    await wait(800);
    const rows = await po.evaluate(() => [...document.querySelectorAll(".item-row")].map((r) => r.innerText.replace(/\n/g, " ")).filter((t) => /소수|큰금액/.test(t)));
    const overflow = await po.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await po.setViewport({ width: 390, height: 844 }); await wait(500);
    const mob = await po.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await shot(po, "big-amount-mobile");
    await po.setViewport({ width: 1280, height: 900 }); await wait(300);
    const notes = [];
    if (decMsg.includes("필수")) notes.push("소수점 금액은 막히지만 안내가 '모든 필수 항목을 입력해주세요'라 이유를 알 수 없음");
    if (mob > 0) notes.push("큰 금액에서 휴대폰 화면이 가로로 넘침");
    return { actual: `소수점: ${decMsg ? `저장 막힘, 안내 "${decMsg}"` : "저장됨"} / 큰 금액: ${rows.join(" / ")} · 가로 넘침 PC ${overflow}px, 휴대폰 ${mob}px`, status: notes.length ? "WARN" : "PASS", note: notes.join(" / ") };
  });

await tc("F-07", A2, "예산 초과 표시",
  "위 금액으로 지출이 총 예산(900,000원)을 크게 넘은 상태 확인",
  "초과 사실을 알 수 있는 표시가 있어야 함",
  async () => {
    const r = await po.evaluate(() => ({ bar: document.querySelector(".budget-bar-fill")?.style.width, over: document.querySelector(".budget-bar-fill")?.classList.contains("over"), txt: document.querySelector(".budget-status")?.innerText || "" }));
    const warn = /초과|더 썼/.test(r.txt) && r.over;
    return { actual: `진행 바 ${r.bar}${r.over ? "(빨간색)" : ""}, 안내: "${r.txt}"`, status: warn ? "PASS" : "WARN", note: warn ? "" : "예산을 넘겨도 진행 바가 100%에서 멈출 뿐 '초과' 안내가 없음" };
  });

await tc("F-08", A2, "지출 수정 후 정산 갱신",
  "숙소 300,000 → 600,000 으로 수정",
  "정산 금액이 즉시 다시 계산됨",
  async () => {
    await po.evaluate(() => { const row = [...document.querySelectorAll(".item-row")].find((r) => r.innerText.startsWith("숙소")); [...row.querySelectorAll("button")].find((b) => b.innerText === "수정").click(); });
    await waitFor(po, () => !!document.querySelector(".modal input[name=amount]"), { label: "edit form" });
    await fill(po, { amount: "600000" });
    await submitModal(po);
    await wait(1200);
    const txt = await po.evaluate(() => [...[...document.querySelectorAll("section")].find((s) => s.innerText.includes("💸 정산")).querySelectorAll(".cat-row")].map((r) => r.innerText.replace(/\n/g, " ")).join(" | "));
    assert(/서연 → 민수|지은 → 민수/.test(txt), txt);
    return `수정 후 정산: ${txt}`;
  });

await tc("F-09", A2, "동시 편집 충돌 — 수정 창을 연 사이 다른 사람이 삭제",
  "민수: '식비' 수정 창을 열어 둠 → 지은: '식비' 삭제 → 민수: 저장",
  "민수에게 '다른 동행자가 먼저 바꿨어요' 안내, 삭제된 항목이 되살아나지 않음",
  async () => {
    await po.evaluate(() => { const row = [...document.querySelectorAll(".item-row")].find((r) => r.innerText.startsWith("식비")); [...row.querySelectorAll("button")].find((b) => b.innerText === "수정").click(); });
    await waitFor(po, () => !!document.querySelector(".modal input[name=amount]"), { label: "edit form" });
    await pb.evaluate(() => { const row = [...document.querySelectorAll(".item-row")].find((r) => r.innerText.startsWith("식비")); [...row.querySelectorAll("button")].find((b) => b.innerText === "삭제").click(); });
    await click(pb, ".modal button", "삭제", { exact: true });
    await wait(1500);
    po.__lastDialog = null;
    await fill(po, { amount: "95000" });
    await submitModal(po);
    await answerDialog(po);
    await wait(500);
    const t = await fsGet(`trips/${TRIP_ID}`);
    const revived = t.budgetItems.some((i) => i.category === "식비");
    assert(!revived && /먼저|바꿨/.test(po.__lastDialog || ""), `dialog=${po.__lastDialog} revived=${revived}`);
    if (await modalOpen(po)) await click(po, ".modal button", "취소", { exact: true });
    return `안내: "${po.__lastDialog}" / 식비 항목 되살아나지 않음`;
  });

await tc("F-10", A2, "동시 추가 — 두 사람이 거의 동시에 지출 추가",
  "민수와 지은이 동시에 각각 지출 추가",
  "두 항목 모두 저장(한쪽이 덮어쓰지 않음)",
  async () => {
    await Promise.all([addBudget(po, { category: "동시A", amount: 1000, paidBy: O }), addBudget(pb, { category: "동시B", amount: 2000, paidBy: B })]);
    await wait(1500);
    const t = await fsGet(`trips/${TRIP_ID}`);
    const cats = t.budgetItems.map((i) => i.category);
    assert(cats.includes("동시A") && cats.includes("동시B"), cats.join(","));
    return `저장된 항목: ${cats.join(", ")}`;
  });

// ---- checklist -------------------------------------------------------------
await tc("K-01", A3, "권한 없는 동행자의 체크 표시 → 다른 사람 화면 반영",
  "서연(권한 없음): 체크리스트 '여권' 체크 / 민수 화면 관찰",
  "서연이 체크 가능하고 민수 화면에도 체크 표시",
  async () => {
    await openTrip(pc, "checklist");
    await pc.evaluate(() => [...document.querySelectorAll(".check-item")].find((c) => c.innerText.includes("여권")).querySelector(".box-btn").click());
    await tab(po, "체크리스트");
    await waitFor(po, () => [...document.querySelectorAll(".check-item")].find((c) => c.innerText.includes("여권"))?.classList.contains("done"), { label: "O sees check", timeout: 8000 });
    return "서연 체크 → 민수 화면에 체크 표시";
  });

await tc("K-02", A3, "준비물 추가 (담당자 지정) / 삭제",
  "민수: '+ 항목 추가' → '우산', 담당자 지은 → 추가 → 그 다음 '충전기' 삭제",
  "우산에 '👤 지은' 표시, 충전기 삭제",
  async () => {
    await click(po, "button", "+ 항목 추가");
    await fill(po, { text: "우산", assignedTo: B });
    await submitModal(po);
    await wait(800);
    await po.evaluate(() => { const row = [...document.querySelectorAll(".check-item")].find((c) => c.innerText.includes("충전기")); [...row.querySelectorAll("button")].find((b) => b.innerText === "삭제").click(); });
    await click(po, ".modal button", "삭제", { exact: true });
    await wait(800);
    const items = await po.evaluate(() => [...document.querySelectorAll(".check-item")].map((c) => c.innerText.replace(/\n/g, " ")));
    assert(items.some((i) => i.includes("우산") && i.includes("지은")) && !items.some((i) => i.includes("충전기")), items.join(" | "));
    return items.join(" | ");
  });

await tc("K-03", A3, "준비물 이름·담당자 수정",
  "민수: '여권'(서연이 체크해 둔 항목) '수정' → 이름 '여권 + 사본', 담당자 서연 → 저장",
  "이름·담당자가 바뀌고 체크 상태는 그대로 유지",
  async () => {
    await po.evaluate(() => { const row = [...document.querySelectorAll(".check-item")].find((c) => c.innerText.includes("여권")); [...row.querySelectorAll("button")].find((b) => b.innerText === "수정").click(); });
    await waitFor(po, () => !!document.querySelector(".modal input[name=text]"), { label: "edit form" });
    await fill(po, { text: "여권 + 사본", assignedTo: C });
    await submitModal(po);
    await wait(1000);
    const row = await po.evaluate(() => { const r = [...document.querySelectorAll(".check-item")].find((c) => c.innerText.includes("여권 + 사본")); return r ? { txt: r.innerText.split(String.fromCharCode(10)).join(" "), done: r.classList.contains("done") } : null; });
    assert(row && row.txt.includes("서연") && row.done, JSON.stringify(row));
    return `"${row.txt}" (체크 유지)`;
  });

// ---- bookings --------------------------------------------------------------
await tab(po, "예약정보");
async function addBooking(v) {
  await click(po, "button", "+ 예약 추가");
  await fill(po, v);
  await submitModal(po);
  await wait(800);
}
await tc("B-01", A4, "예약 정보 추가 (https 링크)",
  "항공권 'KE723 인천→간사이', 예약번호 ABC123, 링크 https://example.com/checkin",
  "카드에 예약번호·링크 표시, 링크는 새 창(noopener)으로 열림",
  async () => {
    await addBooking({ type: "항공권", name: "KE723 인천→간사이", confirmNumber: "ABC123", link: "https://example.com/checkin", memo: "수하물 23kg" });
    const r = await po.evaluate(() => { const a = document.querySelector(".food-card a"); return { txt: document.querySelector(".food-card").innerText.replace(/\n/g, " "), href: a?.href, target: a?.target, rel: a?.rel }; });
    assert(r.href === "https://example.com/checkin" && r.target === "_blank" && r.rel.includes("noopener"), JSON.stringify(r));
    return `${r.txt} / 링크 ${r.href} (${r.target}, ${r.rel})`;
  });

await tc("B-02", A4, "예약 링크를 'www.'로 시작하게 입력",
  "숙소 링크에 'www.example.com/booking' 입력",
  "외부 사이트로 연결되어야 함",
  async () => {
    await addBooking({ type: "숙소", name: "난바 호텔", link: "www.example.com/booking" });
    const href = await po.evaluate(() => [...document.querySelectorAll(".food-card")].find((c) => c.innerText.includes("난바 호텔"))?.querySelector("a")?.href);
    const broken = href.startsWith(BASE_ORIGIN());
    function BASE_ORIGIN() { return "http://localhost:5173"; }
    return { actual: `실제 연결 주소: ${href}`, status: broken ? "FAIL" : "PASS", note: broken ? "버그: 'https://' 없이 입력한 링크가 우리 사이트 내부 주소로 연결되어 열리지 않음" : "" };
  });

await tc("B-03", A4, "예약 링크에 'javascript:' 입력 (보안)",
  "링크에 javascript:alert(1) 입력 후 링크 클릭",
  "스크립트가 실행되지 않음",
  async () => {
    await addBooking({ type: "기타", name: "스크립트테스트", link: "javascript:alert(1)" });
    if (await modalOpen(po)) {
      // Rejected at input time — save it without the link so later steps have the card.
      const note = await po.evaluate(() => [...document.querySelectorAll(".modal .note")].map((n) => n.innerText).join(" "));
      await fill(po, { link: "" });
      await submitModal(po);
      await wait(700);
      return `입력 단계에서 거절: "${note}"`;
    }
    po.__lastDialog = null;
    const href = await po.evaluate(() => [...document.querySelectorAll(".food-card")].find((c) => c.innerText.includes("스크립트테스트"))?.querySelector("a")?.getAttribute("href"));
    await po.evaluate(() => [...document.querySelectorAll(".food-card")].find((c) => c.innerText.includes("스크립트테스트"))?.querySelector("a")?.removeAttribute("target"));
    await po.evaluate(() => [...document.querySelectorAll(".food-card")].find((c) => c.innerText.includes("스크립트테스트"))?.querySelector("a")?.click());
    await wait(1000);
    const ran = po.__lastDialog === "1";
    return { actual: `저장된 링크 속성: "${String(href).slice(0, 80)}", 스크립트 실행 ${ran ? "됨" : "안 됨"}`, status: ran ? "FAIL" : "PASS", note: ran ? "보안 버그" : "React가 javascript: 링크를 차단" };
  });

await tc("B-04", A4, "예약 정보 수정·삭제 + 권한 없는 동행자 화면",
  "'난바 호텔' 예약번호 수정 → '스크립트테스트' 삭제 / 서연 화면 확인",
  "수정·삭제 반영, 서연은 보기만 가능(버튼 없음)",
  async () => {
    await po.evaluate(() => { const c = [...document.querySelectorAll(".food-card")].find((x) => x.innerText.includes("난바 호텔")); [...c.querySelectorAll("button")].find((b) => b.innerText === "수정").click(); });
    await fill(po, { confirmNumber: "HOTEL-777" }); await submitModal(po); await wait(700);
    await po.evaluate(() => { const c = [...document.querySelectorAll(".food-card")].find((x) => x.innerText.includes("스크립트테스트")); [...c.querySelectorAll("button")].find((b) => b.innerText === "삭제").click(); });
    await click(po, ".modal button", "삭제", { exact: true }); await wait(700);
    await tab(pc, "예약정보");
    const r = await pc.evaluate(() => ({ cards: [...document.querySelectorAll(".food-card")].map((c) => c.innerText.replace(/\n/g, " ")), btns: document.querySelectorAll(".food-card button").length }));
    assert(r.cards.some((c) => c.includes("HOTEL-777")) && !r.cards.some((c) => c.includes("스크립트테스트")) && r.btns === 0, JSON.stringify(r));
    return `서연 화면: ${r.cards.length}건, 버튼 ${r.btns}개`;
  });

// ---- members -----------------------------------------------------------------
await tc("M-01", A5, "방장이 동행자 내보내기 — 보고 있던 동행자 화면",
  "서연이 여행 화면을 보고 있는 동안 민수가 서연 옆 ✕ → '내보내기'",
  "서연 화면이 접근 불가 안내로 바뀌고, 여행 목록에서도 사라짐",
  async () => {
    await openTrip(pc);
    await openTrip(po);
    await po.evaluate(() => { const sp = [...document.querySelectorAll(".trip-head .section-note span")].find((s) => s.innerText.includes("서연")); sp.querySelector("button").click(); });
    const q = await modalText(po);
    await click(po, ".modal button", "내보내기", { exact: true });
    await wait(2500);
    const body = await text(pc, "body");
    const shown = body.includes("찾을 수 없어요") ? "'여행을 찾을 수 없어요' 안내" : body.slice(0, 120).replace(/\n/g, " ");
    await shot(pc, "removed-member-view");
    assert(body.includes("찾을 수 없어요"), shown);
    return `확인 문구: "${q.split(String.fromCharCode(10)).filter(Boolean)[1]}" → 서연 화면: ${shown}`;
  });

await tc("M-02", A5, "내보낸 동행자가 같은 코드로 다시 합류 시도",
  "서연: 여행 목록에서 같은 참여 코드로 참여 / 초대 링크(/join/…)로도 접속",
  "방장이 내보낸 사람은 다시 들어오지 못하고 이유를 알 수 있는 안내가 보임",
  async () => {
    await pc.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await waitFor(pc, () => !!document.querySelector("input[placeholder*='참여 코드']"), { label: "join input" });
    await pc.type("input[placeholder*='참여 코드']", TRIP_ID);
    await click(pc, "button", "코드로 참여하기");
    await wait(2500);
    const codeMsg = await pc.evaluate(() => [...document.querySelectorAll(".section-note")].map((e) => e.innerText).join(" "));
    await pc.goto(`${BASE}/join/${TRIP_ID}`, { waitUntil: "domcontentloaded" });
    await wait(3000);
    const linkMsg = await pc.evaluate(() => document.querySelector(".note.flash")?.innerText || "");
    const t = await fsGet(`trips/${TRIP_ID}`);
    assert(!t.memberIds.includes(C) && codeMsg.includes("참여할 수 없는") && linkMsg.includes("참여하지 못했어요"), JSON.stringify({ members: t.memberIds, codeMsg, linkMsg }));
    return `코드: "${codeMsg.trim()}" / 링크: "${linkMsg.replace(/✕/, "").trim()}"`;
  });

await tc("M-02b", A5, "방장이 '다시 참여 허용' 후 재합류",
  "민수: '🔑 권한 관리' → 내보낸 동행자 '서연' 옆 '다시 참여 허용' → 서연: 같은 코드로 참여",
  "허용 후에는 같은 코드로 다시 합류 가능",
  async () => {
    await click(po, ".trip-actions button", "권한 관리");
    await click(po, ".modal button", "다시 참여 허용");
    await wait(1200);
    const listed = await po.evaluate(() => document.querySelector(".modal")?.innerText.includes("내보낸 동행자"));
    await click(po, ".modal button", "취소", { exact: true });
    await pc.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await waitFor(pc, () => !!document.querySelector("input[placeholder*='참여 코드']"), { label: "join input" });
    await pc.type("input[placeholder*='참여 코드']", TRIP_ID);
    await click(pc, "button", "코드로 참여하기");
    await waitFor(pc, () => location.pathname.includes("/trip/"), { label: "rejoined", timeout: 8000 });
    const t = await fsGet(`trips/${TRIP_ID}`);
    assert(t.memberIds.includes(C) && !listed, JSON.stringify({ members: t.memberIds, listed }));
    return "허용 후 목록에서 사라지고, 서연이 같은 코드로 다시 합류";
  });

await tc("M-03", A5, "동행자가 스스로 여행 나가기",
  "지은: '여행 나가기' → '나가기'",
  "지은은 여행 목록으로 이동, 민수 화면 동행자 목록에서 지은이 사라짐, 지은이 결제한 지출은 '(나감)'으로 표시",
  async () => {
    await openTrip(pb);
    await click(pb, "button", "여행 나가기");
    await click(pb, ".modal button", "나가기", { exact: true });
    await waitFor(pb, () => location.pathname === "/", { label: "B home" });
    await openTrip(po, "budget");
    await wait(1200);
    const head = await text(po, ".trip-head");
    const rows = await po.evaluate(() => [...document.querySelectorAll(".item-row")].map((r) => r.innerText.replace(/\n/g, " ")).filter((t) => t.includes("동시B")));
    assert(!head.includes("지은"), head);
    return `민수 화면 동행자에서 지은 제거, 지은 결제 항목 표시: "${rows[0] || "-"}"`;
  });

await tc("M-04", A5, "방장 위임",
  "민수: '👑 방장 위임' → 서연 선택 → 위임",
  "서연 화면에 방장 전용 버튼이 생기고 민수 화면에서는 사라짐, '방장: 👑 서연'",
  async () => {
    await openTrip(po);
    await click(po, ".trip-actions button", "방장 위임");
    await fill(po, { newOwnerId: C });
    await submitModal(po);
    await wait(1500);
    await openTrip(pc);
    const r = {
      oBtns: await po.evaluate(() => [...document.querySelectorAll(".trip-actions button")].map((b) => b.innerText).filter((t) => /권한|위임/.test(t)).length),
      cBtns: await pc.evaluate(() => [...document.querySelectorAll(".trip-actions button")].map((b) => b.innerText).filter((t) => /권한|위임/.test(t)).length),
      owner: await pc.evaluate(() => [...document.querySelectorAll(".section-note")].map((e) => e.innerText).find((t) => t.startsWith("방장"))),
    };
    assert(r.oBtns === 0 && r.cBtns === 2 && r.owner.includes("서연"), JSON.stringify(r));
    return `${r.owner}, 민수 방장 버튼 ${r.oBtns}개 / 서연 ${r.cBtns}개`;
  });

await tc("M-05", A5, "새 방장 / 이전 방장 권한",
  "이전 방장 민수가 일정 추가 버튼을 볼 수 있는지 확인",
  "위임 후 민수는 일반 동행자(권한 없음)가 됨",
  async () => {
    const add = await po.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.innerText.includes("+ 날짜 추가")));
    const leave = await po.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.innerText.includes("여행 나가기")));
    assert(!add && leave, JSON.stringify({ add, leave }));
    return "민수: 일정 추가 불가, '여행 나가기' 버튼 표시";
  });

await tc("M-06", A1, "협업 화면 콘솔 오류",
  "위 과정 동안 세 사람 브라우저 오류 수집",
  "자바스크립트 오류 없음",
  async () => {
    const errs = [...po.__errors, ...pb.__errors, ...pc.__errors].filter((e) => !/favicon|net::|ERR_|DevTools/.test(e));
    return { actual: errs.length ? [...new Set(errs)].slice(0, 5).join(" | ") : "오류 0건", status: errs.length ? "WARN" : "PASS" };
  });

await browser.close();
