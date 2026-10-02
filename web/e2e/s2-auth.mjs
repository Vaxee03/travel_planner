// Suite 2 — sign-up / login / password reset / remember-me / nickname.
import { BASE, launch, newUserPage, tc, assert, wait, waitFor, text, click, fill, submitModal, modalOpen, modalText, shot, fsGet, fsSet } from "./h.mjs";
import { TERMS_VERSION } from "../src/lib/terms.js";

const browser = await launch();
const A = "로그인·회원가입";
const stamp = Date.now();
const EMAIL = `e2e${stamp}@example.test`;
const PW = "tp-e2e-pass1";

const msg = (p) => p.evaluate(() => [...document.querySelectorAll(".auth-msg")].map((e) => e.innerText).join(" / "));
async function openLogin(p) {
  await p.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await wait(800);
  await waitFor(p, () => !!document.querySelector(".auth-card"), { label: "login card" });
}
/** Types into the login/sign-up form; on sign-up also ticks the required
 * terms box unless `agree: false`. */
async function typeAuth(p, { agree = true, ...fields }) {
  for (const [name, v] of Object.entries(fields)) {
    await p.evaluate((n) => { const i = document.querySelector(`.auth-card input[name=${n}]`); i.value = ""; }, name);
    await p.type(`.auth-card input[name=${name}]`, v);
  }
  await p.evaluate((agree) => { const box = document.querySelector(".auth-card input[name=agree]"); if (box && box.checked !== agree) box.click(); }, agree);
}
async function toSignup(p) { if (!(await p.$("input[name=passwordConfirm]"))) await click(p, ".auth-switch", "회원가입"); }

const p1 = await newUserPage(browser);

await tc("AU-01", A, "이메일 회원가입 성공",
  "로그인 화면 → '처음이신가요? 회원가입' → 이메일/비밀번호/확인 입력 → '(필수) 만 14세 이상… 동의' 체크 → 가입하기",
  "가입 후 여행 목록 화면으로 이동하고 (약관 창 없이) 닉네임 설정 창이 뜸, 동의 기록 저장",
  async () => {
    await openLogin(p1); await toSignup(p1);
    await typeAuth(p1, { email: EMAIL, password: PW, passwordConfirm: PW });
    await click(p1, ".auth-submit", "가입하기");
    await waitFor(p1, () => location.pathname === "/" && !!document.querySelector("header.top") && !!document.querySelector(".modal input[name=nickname]"), { label: "signed in + nickname modal", timeout: 15000 });
    const m = await modalText(p1);
    const askedTerms = await p1.evaluate(() => !!document.querySelector(".modal input[name=agree]"));
    const uid = await p1.evaluate(() => JSON.parse(Object.entries(localStorage).find(([k]) => k.startsWith("firebase:authUser"))?.[1] || "null")?.uid
      || new Promise((res) => { const r = indexedDB.open("firebaseLocalStorageDb"); r.onsuccess = () => { const q = r.result.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll(); q.onsuccess = () => res(q.result.find((x) => String(x.fbase_key).startsWith("firebase:authUser"))?.value?.uid || null); }; }));
    const u = uid && await fsGet(`users/${uid}`);
    assert(!askedTerms, "terms asked again after ticking them on the sign-up form");
    assert(u?.termsVersion === TERMS_VERSION && u?.termsAgreedAt, `agreement not recorded: ${JSON.stringify(u)}`);
    return `주소 /, 닉네임 창: "${m.split("\n")[0]}" (가입 화면에서 동의 → 약관 창 없이 바로), 동의 기록 ${u.termsVersion}`;
  });

await tc("AU-02", A, "닉네임 설정 창 '나중에 하기'",
  "첫 로그인 닉네임 창에서 '나중에 하기' 클릭",
  "창이 닫히고 앱 사용 가능 (닉네임 처리 방식 확인)",
  async () => {
    const suggested = await p1.$eval(".modal input[name=nickname]", (i) => i.value);
    await click(p1, ".modal button", "나중에 하기");
    await wait(1200);
    const header = await p1.evaluate(() => document.querySelector("header.top").innerText.split("\n").find((l) => l && !/TRIP|여행 플래너|여러 여행|닉네임 수정|로그아웃/.test(l)));
    const open = await modalOpen(p1);
    assert(!open, "창이 닫히지 않음");
    const saved = header === suggested;
    return { actual: `추천 닉네임 "${suggested}", 헤더 표시 "${header}"`, status: saved ? "WARN" : "PASS", note: saved ? "'나중에 하기'를 눌러도 추천 닉네임이 실제로 저장됨 — 버튼 이름과 동작이 다름" : "" };
  });

await tc("AU-03", A, "닉네임 수정 — 빈 값 저장",
  "'닉네임 수정' → 입력칸을 비우고 저장",
  "기존 닉네임 유지(빈 닉네임 저장 안 됨), 안내 여부 확인",
  async () => {
    const before = await p1.evaluate(() => document.querySelector("header.top span[style*='nickname']")?.innerText);
    await click(p1, "button", "닉네임 수정", { exact: true });
    await fill(p1, { nickname: "   " });
    await submitModal(p1);
    const after = await p1.evaluate(() => document.querySelector("header.top span[style*='nickname']")?.innerText);
    const open = await modalOpen(p1);
    assert(after === before, `${before} → ${after}`);
    return { actual: `저장 후 창 ${open ? "열림" : "닫힘"}, 닉네임 "${after}" 유지`, status: open ? "PASS" : "WARN", note: open ? "" : "빈 값으로 저장을 누르면 아무 안내 없이 창이 닫힘(변경 안 됨)" };
  });

await tc("AU-04", A, "닉네임 수정 — 아주 긴 닉네임(40자)",
  "닉네임 칸에 40자를 입력(붙여넣기)해 저장 → 20자로 다시 저장 후 헤더 확인",
  "20자 제한 안내로 저장이 막히고, 20자는 저장되며 헤더가 가로로 넘치지 않음",
  async () => {
    if (!(await modalOpen(p1))) await click(p1, "button", "닉네임 수정", { exact: true });
    await fill(p1, { nickname: "아주아주긴닉네임테스트".repeat(4) });
    await submitModal(p1);
    await wait(800);
    const note = await p1.evaluate(() => [...document.querySelectorAll(".modal .note")].map((n) => n.innerText).join(" "));
    const maxAttr = await p1.$eval(".modal input[name=nickname]", (i) => i.maxLength).catch(() => -1);
    await fill(p1, { nickname: "스무글자닉네임테스트스무글자닉네임테스트" });
    await submitModal(p1);
    await wait(800);
    const r = await p1.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, shown: document.querySelector("header.top span[style*='nickname']")?.innerText.length }));
    await p1.setViewport({ width: 390, height: 800, isMobile: true });
    await waitFor(p1, () => !!document.querySelector("header.top"), { label: "reload" }); await wait(800);
    const mob = await p1.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await shot(p1, "long-nickname-mobile", { clip: { x: 0, y: 0, width: 390, height: 260 } });
    await p1.setViewport({ width: 1280, height: 900 });
    await waitFor(p1, () => !!document.querySelector("header.top"), { label: "reload" }); await wait(800);
    assert(note.includes("20자") && r.shown === 20 && r.overflow <= 0 && mob <= 0, JSON.stringify({ note, maxAttr, ...r, mob }));
    return `40자: "${note}" (입력칸 최대 ${maxAttr}자) / 20자 저장, 가로 넘침 데스크톱 ${r.overflow}px · 휴대폰 ${mob}px`;
  });

await tc("AU-05", A, "로그아웃",
  "헤더 '로그아웃' 클릭",
  "랜딩 페이지로 이동",
  async () => {
    await click(p1, "button", "로그아웃", { exact: true });
    await waitFor(p1, () => !!document.querySelector(".lp"), { label: "landing" });
    return `주소 ${await p1.evaluate(() => location.pathname)}, 랜딩 표시`;
  });

await tc("AU-06", A, "회원가입 — 비밀번호 확인 불일치",
  "비밀번호와 확인 칸을 다르게 입력 후 가입하기",
  "'비밀번호가 서로 달라요.' 안내, 가입 안 됨",
  async () => {
    await openLogin(p1); await toSignup(p1);
    await typeAuth(p1, { email: `x${stamp}@example.test`, password: "abcdef1", passwordConfirm: "abcdef2" });
    await click(p1, ".auth-submit", "가입하기");
    const m = await msg(p1);
    assert(m.includes("비밀번호가 서로 달라요"), m);
    return m;
  });

await tc("AU-07", A, "회원가입 — 비밀번호 5자",
  "비밀번호를 5자로 입력 후 가입하기",
  "비밀번호 길이 문제라는 것을 알 수 있는 안내",
  async () => {
    await typeAuth(p1, { email: `y${stamp}@example.test`, password: "abc12", passwordConfirm: "abc12" });
    await click(p1, ".auth-submit", "가입하기");
    const m = await msg(p1);
    const specific = /6자|짧/.test(m);
    return { actual: `안내: "${m}"`, status: specific ? "PASS" : "WARN", note: specific ? "" : "비밀번호가 짧은데 '모든 필수 항목을 입력해주세요'라고 나와 원인을 알기 어려움" };
  });

await tc("AU-08", A, "회원가입 — 이메일 형식 오류",
  "이메일에 'abc' 입력 후 가입하기",
  "이메일 형식 문제라는 것을 알 수 있는 안내",
  async () => {
    await typeAuth(p1, { email: "abc", password: "abcdef1", passwordConfirm: "abcdef1" });
    await click(p1, ".auth-submit", "가입하기");
    const m = await msg(p1);
    const specific = /이메일/.test(m);
    return { actual: `안내: "${m}"`, status: specific ? "PASS" : "WARN", note: specific ? "" : "이메일 형식이 틀렸는데 '모든 필수 항목을 입력해주세요'라고 나옴" };
  });

await tc("AU-09", A, "회원가입 — 이미 가입된 이메일",
  "AU-01에서 가입한 이메일로 다시 가입",
  "'이미 가입된 이메일이에요' 안내",
  async () => {
    await typeAuth(p1, { email: EMAIL, password: PW, passwordConfirm: PW });
    await click(p1, ".auth-submit", "가입하기");
    await wait(1500);
    const m = await msg(p1);
    assert(m.includes("이미 가입된"), m);
    return m;
  });

await tc("AU-10", A, "로그인 — 틀린 비밀번호",
  "가입한 이메일 + 틀린 비밀번호로 로그인",
  "이메일 또는 비밀번호가 올바르지 않다는 안내",
  async () => {
    await click(p1, ".auth-switch", "로그인");
    await typeAuth(p1, { email: EMAIL, password: "wrong-pass-9" });
    await click(p1, ".auth-submit", "로그인");
    await wait(1500);
    const m = await msg(p1);
    assert(/올바르지 않|비밀번호/.test(m), m);
    return m;
  });

await tc("AU-11", A, "로그인 — 가입되지 않은 이메일",
  "없는 이메일로 로그인",
  "로그인 실패 안내",
  async () => {
    await typeAuth(p1, { email: `nobody${stamp}@example.test`, password: "whatever1" });
    await click(p1, ".auth-submit", "로그인");
    await wait(1500);
    const m = await msg(p1);
    assert(m.length > 0, "안내 없음");
    return m;
  });

await tc("AU-12", A, "비밀번호 재설정 — 이메일 비어 있음",
  "이메일 칸을 비우고 '비밀번호를 잊어버렸어요!' 클릭",
  "이메일을 먼저 입력하라는 안내, 이메일 칸에 포커스",
  async () => {
    await p1.evaluate(() => { document.querySelector(".auth-card input[name=email]").value = ""; });
    await click(p1, ".auth-link", "비밀번호를 잊어버렸어요");
    const r = await p1.evaluate(() => ({ m: [...document.querySelectorAll(".auth-msg")].map((e) => e.innerText).join(" "), focus: document.activeElement?.name }));
    assert(r.m.includes("이메일") && r.focus === "email", JSON.stringify(r));
    return `${r.m} (포커스: ${r.focus})`;
  });

await tc("AU-13", A, "비밀번호 재설정 — 가입된 이메일",
  "가입한 이메일 입력 후 '비밀번호를 잊어버렸어요!'",
  "재설정 메일 발송 안내, 에뮬레이터에 재설정 요청 기록",
  async () => {
    await typeAuth(p1, { email: EMAIL });
    await click(p1, ".auth-link", "비밀번호를 잊어버렸어요");
    await wait(1500);
    const m = await msg(p1);
    const codes = await (await fetch("http://127.0.0.1:9299/emulator/v1/projects/travel-planner-bb32d/oobCodes")).json();
    const sent = (codes.oobCodes || []).some((c) => c.email === EMAIL && c.requestType === "PASSWORD_RESET");
    assert(m.includes("재설정 메일") && sent, m + " / sent=" + sent);
    return `안내 표시, 재설정 메일 요청 기록됨`;
  });

await tc("AU-14", A, "비밀번호 재설정 — 가입 안 된 이메일",
  "없는 이메일로 재설정 요청",
  "가입 여부를 드러내지 않는 같은 안내",
  async () => {
    await typeAuth(p1, { email: `ghost${stamp}@example.test` });
    await click(p1, ".auth-link", "비밀번호를 잊어버렸어요");
    await wait(1500);
    const m = await msg(p1);
    assert(m.includes("가입된 계정이 있으면"), m);
    return m;
  });

await tc("AU-15", A, "로그인 — 엔터 키로 제출 + 로그인 상태 유지(기본 켜짐)",
  "비밀번호 칸에서 Enter, 로그인 후 새로고침",
  "로그인되어 여행 목록 표시, 새로고침 후에도 로그인 유지",
  async () => {
    await typeAuth(p1, { email: EMAIL, password: PW });
    const checked = await p1.$eval(".auth-check input", (i) => i.checked);
    await p1.focus(".auth-card input[name=password]");
    await p1.keyboard.press("Enter");
    await waitFor(p1, () => location.pathname === "/" && !!document.querySelector("header.top") && !document.querySelector(".auth-card"), { label: "logged in", timeout: 15000 });
    await p1.reload({ waitUntil: "domcontentloaded" });
    await wait(1500);
    const still = await p1.evaluate(() => !!document.querySelector("header.top") && !document.querySelector(".lp"));
    assert(checked && still, `checked=${checked} still=${still}`);
    return "기본 체크 상태로 로그인, 새로고침 후에도 로그인 유지";
  });

await tc("AU-16", A, "로그인 상태에서 /login 접속",
  "로그인된 상태로 /login 주소 입력",
  "여행 목록(/)으로 자동 이동",
  async () => {
    await p1.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
    await wait(1200);
    const path = await p1.evaluate(() => location.pathname);
    assert(path === "/", path);
    return `이동된 주소 ${path}`;
  });

await tc("AU-17", A, "로그인 상태에서 상단 로고 → 랜딩(/about)",
  "헤더 'TRIP PLANNER' 클릭, 랜딩 상단 바 확인 후 '내 여행으로' 클릭",
  "랜딩에 '(닉네임)님'과 '내 여행으로' 표시, 누르면 여행 목록으로 복귀",
  async () => {
    await p1.evaluate(() => document.querySelector("header.top .eyebrow").click());
    await waitFor(p1, () => !!document.querySelector(".lp"), { label: "about landing" });
    const r = await p1.evaluate(() => ({ path: location.pathname, user: document.querySelector(".lp-nav-user")?.innerText, cta: document.querySelector(".lp-nav-cta .btn-primary")?.innerText, login: !!document.querySelector(".lp-nav-cta .btn-ghost") }));
    await click(p1, ".lp-nav-cta a", "내 여행으로");
    await waitFor(p1, () => location.pathname === "/" && !!document.querySelector("header.top"), { label: "trip list" });
    assert(r.path === "/about" && r.user?.endsWith("님") && r.cta === "내 여행으로" && !r.login, JSON.stringify(r));
    return `${r.path}: "${r.user.slice(0, 12)}…", 버튼 "${r.cta}", 로그인 버튼 숨김 → 여행 목록 복귀`;
  });

await tc("AU-18", A, "'로그인 상태 유지' 해제 후 로그인",
  "새 브라우저에서 체크 해제 후 로그인 → 같은 브라우저의 새 탭 열기 → 원래 탭 새로고침",
  "원래 탭은 로그인 유지(세션 저장), 새 탭은 로그인 필요",
  async () => {
    const p = await newUserPage(browser);
    await openLogin(p);
    await p.click(".auth-check input");
    await typeAuth(p, { email: EMAIL, password: PW });
    await click(p, ".auth-submit", "로그인");
    await waitFor(p, () => !!document.querySelector("header.top") && location.pathname === "/", { label: "logged in", timeout: 15000 });
    const sessionKeys = await p.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("firebase:authUser")).length);
    const t2 = await p.browserContext().newPage();
    await t2.goto(BASE + "/", { waitUntil: "domcontentloaded" }); await wait(1500);
    const t2Landing = await t2.evaluate(() => !!document.querySelector(".lp"));
    await p.reload({ waitUntil: "domcontentloaded" }); await wait(1500);
    const stillIn = await p.evaluate(() => !!document.querySelector("header.top"));
    await p.browserContext().close();
    assert(sessionKeys === 1 && t2Landing && stillIn, JSON.stringify({ sessionKeys, t2Landing, stillIn }));
    return "세션 저장소에 로그인 정보 저장, 새 탭은 랜딩(로그아웃), 원래 탭은 새로고침 후에도 유지";
  });

await tc("AU-19", A, "탭마다 다른 계정으로 로그인 후 닉네임 저장 (오늘 수정한 버그 재발 확인)",
  "탭 A: 계정1(유지 켬) / 탭 B: 계정2(유지 끔) 로그인 → 탭 B에서 닉네임 저장, 여행 목록 확인",
  "탭 B에서 권한 오류 없이 여행 목록 표시, 닉네임 저장 성공",
  async () => {
    const ctx = await browser.createBrowserContext();
    const a = await ctx.newPage(); const b = await ctx.newPage();
    const errs = []; b.on("pageerror", (e) => errs.push(e.message)); b.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await a.bringToFront(); await openLogin(a); await typeAuth(a, { email: EMAIL, password: PW }); await click(a, ".auth-submit", "로그인");
    await waitFor(a, () => !!document.querySelector("header.top"), { label: "A in", timeout: 15000 });
    // B: sign out shared session first would sign A out too, so B signs up a new account with 유지 off after A signs out; then A signs back in
    await a.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent === "로그아웃").click()); await wait(1200);
    await b.bringToFront(); await openLogin(b); await toSignup(b); await b.click(".auth-check input");
    const e2 = `tabb${stamp}@example.test`;
    await typeAuth(b, { email: e2, password: PW, passwordConfirm: PW }); await click(b, ".auth-submit", "가입하기");
    await waitFor(b, () => !!document.querySelector("header.top"), { label: "B in", timeout: 15000 });
    await a.bringToFront(); await openLogin(a); await typeAuth(a, { email: EMAIL, password: PW }); await click(a, ".auth-submit", "로그인");
    await waitFor(a, () => !!document.querySelector("header.top") && !document.querySelector(".auth-card"), { label: "A back in", timeout: 15000 });
    await b.bringToFront(); await wait(1500);
    if (!(await b.$(".modal"))) await click(b, "button", "닉네임 수정", { exact: true });
    await fill(b, { nickname: "탭B계정" }); await submitModal(b); await wait(2000);
    const r = await b.evaluate(() => ({ nick: document.querySelector("header.top span[style*='nickname']")?.innerText, modal: !!document.querySelector(".modal"), list: document.body.innerText.includes("내 여행"), perm: document.body.innerText.includes("false for") }));
    const permErr = errs.some((e) => /permission|insufficient/i.test(e));
    await ctx.close();
    assert(r.nick === "탭B계정" && !r.modal && r.list && !r.perm && !permErr, JSON.stringify({ ...r, permErr }));
    return "탭 B 닉네임 '탭B계정' 저장, 여행 목록 정상, 권한 오류 없음";
  });

await tc("AU-20", A, "Google / 카카오 로그인 버튼",
  "로그인 화면에서 각 소셜 버튼 클릭",
  "각 버튼이 로그인 팝업 창을 연다 (실제 계정 로그인은 외부 서비스라 테스트 범위 밖)",
  async () => {
    const out = [];
    for (const cls of ["google", "kakao"]) {
      const p = await newUserPage(browser);
      await openLogin(p);
      const popup = new Promise((res) => p.once("popup", (pg) => res(pg ? pg.url() || "about:blank" : null)));
      await p.click(`.auth-social-btn.${cls}`);
      const url = await Promise.race([popup, wait(5000).then(() => null)]);
      out.push(`${cls}: ${url ? "팝업 열림" : "팝업 없음"}`);
      await wait(800);
      for (const pg of await p.browserContext().pages()) if (pg !== p) await pg.close();
      await wait(4000);
      const m = await p.evaluate(() => [...document.querySelectorAll(".auth-msg")].map((e) => e.innerText).join(" "));
      if (m) out[out.length - 1] += ` (팝업 닫은 뒤 안내: "${m}")`;
      await p.browserContext().close();
    }
    assert(out.every((o) => o.includes("열림")), out.join(", "));
    return out.join(", ");
  });

await tc("AU-21", A, "로그인 화면 '뒤로가기'",
  "랜딩 → 로그인 이동 후 헤더 '← 뒤로가기' 클릭 / 주소창에 /login 직접 입력 후 뒤로가기",
  "두 경우 모두 랜딩으로 돌아감",
  async () => {
    const p = await newUserPage(browser);
    await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await click(p, ".lp-nav-cta a", "로그인", { exact: true });
    await waitFor(p, () => !!document.querySelector(".auth-card"), { label: "login" });
    await click(p, "button", "뒤로가기");
    await waitFor(p, () => !!document.querySelector(".lp"), { label: "landing again" });
    await p.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
    await click(p, "button", "뒤로가기");
    await waitFor(p, () => !!document.querySelector(".lp"), { label: "landing direct" });
    await p.browserContext().close();
    return "두 경우 모두 랜딩 복귀";
  });

// ---- terms agreement (lib/terms.js) -----------------------------------------
const agreeBox = (p) => p.evaluate(() => !!document.querySelector(".modal input[name=agree]"));
async function signInFresh(uid, profile) {
  if (profile) await fsSet(`users/${uid}`, profile);
  const p = await newUserPage(browser);
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await waitFor(p, () => typeof window.__emulatorSignIn === "function", { label: "app" });
  await p.evaluate((uid) => window.__emulatorSignIn(uid), uid);
  await waitFor(p, () => !!document.querySelector("header.top"), { label: "app shell" });
  return p;
}

await tc("AU-22", A, "회원가입 — 약관 동의 체크 안 함",
  "이메일·비밀번호를 모두 맞게 입력하고 '(필수) 만 14세 이상… 동의'를 체크하지 않은 채 가입하기",
  "'필수 항목에 체크해주세요.' 안내, 가입 안 됨",
  async () => {
    const p = await newUserPage(browser);
    await openLogin(p); await toSignup(p);
    await typeAuth(p, { email: `noagree${stamp}@example.test`, password: PW, passwordConfirm: PW, agree: false });
    await click(p, ".auth-submit", "가입하기");
    await wait(800);
    const m = await msg(p);
    const stillOnForm = await p.evaluate(() => !!document.querySelector(".auth-card"));
    await p.browserContext().close();
    assert(m.includes("필수 항목에 체크") && stillOnForm, m);
    return `안내: "${m}"`;
  });

await tc("AU-23", A, "구글·카카오 첫 로그인 — 약관 동의 창",
  "동의 기록이 없는 새 계정으로 소셜 로그인 → Esc → 체크 없이 '동의하고 시작하기' → 체크 후 '동의하고 시작하기'",
  "닫히지 않는 동의 창(이용약관·방침 펼쳐보기), 체크 안 하면 안내, 동의하면 닉네임 창으로 이어지고 동의 기록(버전·시각) 저장",
  async () => {
    const uid = `social${stamp}`;
    const p = await signInFresh(uid);
    await waitFor(p, () => !!document.querySelector(".modal input[name=agree]"), { label: "terms dialog", timeout: 10000 });
    const title = (await modalText(p)).split("\n")[0];
    const folds = await p.evaluate(() => [...document.querySelectorAll(".modal details summary")].map((s) => s.innerText));
    await p.keyboard.press("Escape"); await wait(400);
    const survivesEsc = await agreeBox(p);
    await p.mouse.click(5, 5); await wait(400);
    const survivesOutside = await agreeBox(p);
    await click(p, ".modal button", "동의하고 시작하기");
    await wait(400);
    const warn = await modalText(p);
    await p.evaluate(() => document.querySelector(".modal input[name=agree]").click());
    await click(p, ".modal button", "동의하고 시작하기");
    await waitFor(p, () => !!document.querySelector(".modal input[name=nickname]"), { label: "nickname next", timeout: 10000 });
    const u = await fsGet(`users/${uid}`);
    await p.browserContext().close();
    assert(survivesEsc && survivesOutside, "terms dialog closed without an answer");
    assert(warn.includes("필수 항목에 체크"), warn);
    assert(u?.termsVersion === TERMS_VERSION && u?.termsAgreedAt, JSON.stringify(u));
    return `"${title}" 창 (${folds.join(", ")}), Esc·바깥 클릭에 안 닫힘, 미체크 시 안내 → 동의 후 닉네임 창, 기록 ${u.termsVersion}`;
  });

await tc("AU-24", A, "약관 '동의하지 않음'",
  "동의 기록이 없는 계정으로 로그인 → '동의하지 않음'",
  "로그아웃되고 동의 기록이 남지 않음",
  async () => {
    const uid = `decline${stamp}`;
    const p = await signInFresh(uid);
    await waitFor(p, () => !!document.querySelector(".modal input[name=agree]"), { label: "terms dialog", timeout: 10000 });
    await click(p, ".modal button", "동의하지 않음");
    await waitFor(p, () => !document.querySelector("header.top .top-actions-full button") || !!document.querySelector(".lp, .auth-card"), { label: "signed out", timeout: 10000 });
    await wait(800);
    const signedOut = await p.evaluate(() => !!document.querySelector(".lp, .auth-card"));
    const u = await fsGet(`users/${uid}`);
    await p.browserContext().close();
    assert(signedOut && !u?.termsVersion, JSON.stringify({ signedOut, u }));
    return "로그아웃되어 랜딩/로그인 화면, 동의 기록 없음";
  });

await tc("AU-25", A, "기존 가입자(동의 기록 없음) 다시 로그인",
  "닉네임은 있고 동의 기록은 없는 계정으로 로그인 → 동의",
  "'서비스 이용 동의' 창이 한 번 뜨고, 동의 후 닉네임 창 없이 바로 이용",
  async () => {
    const uid = `old${stamp}`;
    const p = await signInFresh(uid, { nickname: "기존회원" });
    await waitFor(p, () => !!document.querySelector(".modal input[name=agree]"), { label: "terms dialog", timeout: 10000 });
    const title = (await modalText(p)).split("\n")[0];
    await p.evaluate(() => document.querySelector(".modal input[name=agree]").click());
    await click(p, ".modal button", "동의하고 시작하기");
    await wait(1500);
    const leftOpen = await modalOpen(p);
    const u = await fsGet(`users/${uid}`);
    await p.browserContext().close();
    assert(title.includes("서비스 이용 동의") && !leftOpen && u?.nickname === "기존회원" && u?.termsVersion === TERMS_VERSION, JSON.stringify({ title, leftOpen, u }));
    return `"${title}" → 동의 후 바로 이용 (닉네임 "${u.nickname}" 유지)`;
  });

await tc("AU-26", A, "약관 개정 후 다시 동의",
  "예전 버전(2026-01-01)에 동의한 계정으로 로그인",
  "'약관이 바뀌었어요' 창이 뜨고, 동의하면 새 버전으로 기록",
  async () => {
    const uid = `revised${stamp}`;
    const p = await signInFresh(uid, { nickname: "개정테스트", termsVersion: "2026-01-01" });
    await waitFor(p, () => !!document.querySelector(".modal input[name=agree]"), { label: "terms dialog", timeout: 10000 });
    const title = (await modalText(p)).split("\n")[0];
    await p.evaluate(() => document.querySelector(".modal input[name=agree]").click());
    await click(p, ".modal button", "동의하고 시작하기");
    await wait(1500);
    const u = await fsGet(`users/${uid}`);
    await p.browserContext().close();
    assert(title.includes("약관이 바뀌었어요") && u?.termsVersion === TERMS_VERSION, JSON.stringify({ title, u }));
    return `"${title}" → 동의 후 ${u.termsVersion}로 기록`;
  });

await browser.close();
