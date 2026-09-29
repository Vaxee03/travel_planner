// Suite 1 — landing page (signed out): content, navigation, animation, layout.
import { BASE, launch, newUserPage, tc, assert, wait, waitFor, text, click, shot } from "./h.mjs";

const browser = await launch();
const A = "랜딩 페이지";

const page = await newUserPage(browser);
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await wait(1500);

await tc("L-01", A, "로그아웃 상태로 첫 화면 접속 시 랜딩 표시",
  "로그인하지 않은 새 브라우저로 / 접속",
  "랜딩(.lp)이 보이고 로그인 폼·앱 헤더는 보이지 않음",
  async () => {
    const r = await page.evaluate(() => ({ lp: !!document.querySelector(".lp"), app: !!document.querySelector("header.top"), h1: document.querySelector(".lp-hero h1")?.innerText }));
    assert(r.lp && !r.app, JSON.stringify(r));
    return `랜딩 표시, 제목: "${r.h1.replace(/\n/g, " ")}"`;
  });

await tc("L-02", A, "랜딩 섹션/문구 구성 확인",
  "랜딩 전체 텍스트에서 주요 섹션과 기능 이름 확인",
  "기능 8개, 소개 섹션 4개, 부가 기능 4개, 시작 방법 3단계, 마지막 CTA, 약관 링크가 모두 존재",
  async () => {
    const r = await page.evaluate(() => ({
      features: document.querySelectorAll(".lp-feature").length,
      splits: document.querySelectorAll(".lp-split").length,
      extras: document.querySelectorAll(".lp-extra").length,
      steps: document.querySelectorAll(".lp-step").length,
      final: !!document.querySelector(".lp-final a[href='/login']"),
      terms: !!document.querySelector(".lp-footer a[href='/terms']"),
      privacy: !!document.querySelector(".lp-footer a[href='/privacy']"),
    }));
    assert(r.features === 8 && r.splits === 4 && r.extras === 4 && r.steps === 3 && r.final && r.terms && r.privacy, JSON.stringify(r));
    return JSON.stringify(r);
  });

await tc("L-03", A, "'무료로 시작하기'·'로그인' 버튼 이동",
  "상단 바/첫 화면/마지막 영역의 시작 버튼 링크 확인 후 상단 '로그인' 클릭",
  "모든 시작 버튼이 /login 을 가리키고, 클릭 시 로그인 화면으로 이동",
  async () => {
    const hrefs = await page.evaluate(() => [...document.querySelectorAll(".lp a.btn-primary")].map((a) => a.getAttribute("href")));
    assert(hrefs.length >= 3 && hrefs.every((h) => h === "/login"), hrefs.join(","));
    await click(page, ".lp-nav-cta a", "로그인", { exact: true });
    await waitFor(page, () => location.pathname === "/login" && !!document.querySelector(".auth-card"), { label: "login page" });
    return `시작 버튼 ${hrefs.length}개 모두 /login, 클릭 시 로그인 화면 표시`;
  });

await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await wait(800);

for (const [id, label, anchor] of [["L-04", "기능", "features"], ["L-05", "함께 쓰기", "together"], ["L-06", "시작 방법", "steps"]]) {
  await tc(id, A, `상단 메뉴 '${label}' 클릭 시 부드러운 스크롤 이동`,
    `페이지 맨 위에서 상단 메뉴 '${label}' 클릭, 이동 중 스크롤 위치 기록`,
    "중간 위치를 거쳐 해당 섹션이 상단 바 바로 아래에 오도록 멈춤(순간이동 아님)",
    async () => {
      await page.evaluate(() => scrollTo(0, 0));
      await wait(300);
      const r = await page.evaluate(async (label, anchor) => {
        const samples = [];
        const a = [...document.querySelectorAll(".lp-nav-links a")].find((x) => x.textContent === label);
        a.click();
        const t0 = performance.now();
        while (performance.now() - t0 < 1200) { samples.push(Math.round(scrollY)); await new Promise((r) => setTimeout(r, 50)); }
        const navH = document.querySelector(".lp-nav").offsetHeight;
        return { samples, top: Math.round(document.getElementById(anchor).getBoundingClientRect().top), navH };
      }, label, anchor);
      const final = r.samples.at(-1);
      const intermediate = r.samples.some((y) => y > 0 && y < final - 5);
      assert(Math.abs(r.top - r.navH) <= 2, `섹션 위치 ${r.top}px, 상단 바 ${r.navH}px`);
      assert(intermediate, "중간 스크롤 위치 없음(순간이동): " + r.samples.slice(0, 6).join(","));
      return `최종 섹션 위치 ${r.top}px(상단 바 높이 ${r.navH}px), 중간 위치 거침`;
    });
}

await tc("L-07", A, "스크롤 중 휠 입력 시 자동 스크롤 중단",
  "'시작 방법' 클릭 직후 마우스 휠 이벤트 발생",
  "자동 스크롤이 멈추고 사용자의 스크롤이 우선",
  async () => {
    await page.evaluate(() => scrollTo(0, 0));
    await wait(300);
    const r = await page.evaluate(async () => {
      [...document.querySelectorAll(".lp-nav-links a")].find((x) => x.textContent === "시작 방법").click();
      await new Promise((r) => setTimeout(r, 80));
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: 10 }));
      const y1 = scrollY;
      await new Promise((r) => setTimeout(r, 700));
      return { y1: Math.round(y1), y2: Math.round(scrollY), target: Math.round(document.getElementById("steps").getBoundingClientRect().top + scrollY - document.querySelector(".lp-nav").offsetHeight) };
    });
    assert(r.y2 < r.target - 50, JSON.stringify(r));
    return `휠 입력 후 ${r.y2}px에서 멈춤(목표 ${r.target}px까지 가지 않음)`;
  });

await tc("L-08", A, "로고 클릭 시 페이지 맨 위로 이동(다른 화면으로 가지 않음)",
  "페이지 중간까지 스크롤 후 좌측 상단 로고 클릭",
  "주소는 그대로이고 스크롤이 0으로 돌아옴",
  async () => {
    await page.evaluate(() => scrollTo(0, 2500));
    await wait(300);
    await page.evaluate(() => document.querySelector(".lp-logo").click());
    await wait(1200);
    const r = await page.evaluate(() => ({ path: location.pathname, y: scrollY, lp: !!document.querySelector(".lp") }));
    assert(r.path === "/" && r.y === 0 && r.lp, JSON.stringify(r));
    return `주소 ${r.path}, 스크롤 ${r.y}px`;
  });

await tc("L-09", A, "실시간 함께 편집 시연 애니메이션 반복",
  "첫 화면 시연 창에서 6초간 일정 항목 수 기록",
  "항목이 0→4개로 차례로 늘어나고 알림/커서가 표시됨",
  async () => {
    await page.evaluate(() => scrollTo(0, 0));
    const counts = [];
    for (let i = 0; i < 16; i++) { counts.push(await page.evaluate(() => document.querySelectorAll(".lp-tl-item").length)); await wait(500); }
    const toast = await page.evaluate(() => document.querySelector(".lp-toast")?.innerText || "");
    assert(Math.max(...counts) === 4 && new Set(counts).size >= 3, counts.join(","));
    return `항목 수 변화: ${[...new Set(counts)].join("→")}, 알림 예: "${toast}"`;
  });

await tc("L-10", A, "스크롤을 따라 움직이는 종이비행기",
  "기능 소개 구간을 두 위치로 스크롤하며 비행기 위치 비교",
  "스크롤에 따라 비행기 위치·방향이 바뀜",
  async () => {
    const pos = [];
    for (const id of ["together", "budget"]) {
      await page.evaluate((id) => document.getElementById(id).scrollIntoView(), id);
      await wait(1500);
      pos.push(await page.evaluate(() => document.querySelectorAll(".lp-plane")[1].style.transform));
    }
    assert(pos[0] && pos[1] && pos[0] !== pos[1], pos.join(" | "));
    return "위치 변화 확인: " + pos.map((p) => p.match(/translate\(([^)]*)\)/)?.[1]).join(" → ");
  });

await tc("L-11", A, "기능 소개 그림 애니메이션(지도 경로·정산·맛집 추가)",
  "각 소개 섹션으로 스크롤 후 2.5초 대기",
  "지도 핀 4개·경로가 그려지고, 금액이 612,000원까지 올라가며, 맛집 버튼이 '2일차에 추가됨'으로 바뀜",
  async () => {
    await page.evaluate(() => document.getElementById("route").scrollIntoView()); await wait(3500);
    const pins = await page.evaluate(() => [...document.querySelectorAll(".lp-map-pin")].filter((c) => getComputedStyle(c.parentElement).opacity > 0.9).length);
    await page.evaluate(() => document.getElementById("budget").scrollIntoView()); await wait(2500);
    const total = await page.evaluate(() => document.querySelector(".lp-budget-total b")?.innerText);
    await page.evaluate(() => document.getElementById("food").scrollIntoView()); await wait(2500);
    const add = await page.evaluate(() => document.querySelector(".lp-add")?.innerText);
    assert(pins === 4 && total === "612,000원" && add === "2일차에 추가됨", JSON.stringify({ pins, total, add }));
    return `핀 ${pins}개, 총 지출 ${total}, 맛집 버튼 "${add}"`;
  });

// ---- layout across screen sizes / themes --------------------------------
for (const [id, w, h, scheme] of [["L-12", 390, 844, "dark"], ["L-13", 768, 1024, "light"], ["L-14", 1280, 800, "dark"], ["L-15", 1920, 1080, "light"]]) {
  await tc(id, A, `화면 ${w}px (${scheme === "dark" ? "다크" : "라이트"} 모드) 레이아웃`,
    `${w}x${h} 화면, ${scheme} 모드로 랜딩 전체 확인`,
    "가로 스크롤(넘침) 없음, 상단 바 한 줄, 글자 잘림 없음",
    async () => {
      const p = await newUserPage(browser, { width: w, height: h, scheme });
      await p.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 });
      await p.goto(BASE + "/", { waitUntil: "networkidle0" });
      await wait(1200);
      const r = await p.evaluate(() => {
        const nav = document.querySelector(".lp-nav");
        const kids = [...nav.querySelectorAll(".lp-logo, .lp-nav-cta .btn")];
        const wrapped = kids.filter((k) => k.getBoundingClientRect().height > 60).map((k) => k.innerText);
        return { overflow: document.documentElement.scrollWidth - innerWidth, navH: nav.offsetHeight, wrapped, bg: getComputedStyle(document.body).backgroundColor };
      });
      await shot(p, `landing-${w}-${scheme}`);
      await p.browserContext().close();
      assert(r.overflow <= 0 && r.wrapped.length === 0, JSON.stringify(r));
      return `넘침 ${r.overflow}px, 상단 바 높이 ${r.navH}px, 배경 ${r.bg}`;
    });
}

await tc("L-16", A, "'동작 줄이기' 설정 사용자",
  "prefers-reduced-motion: reduce 로 랜딩 접속",
  "종이비행기 없음, 시연 창은 일정 4개가 처음부터 모두 표시",
  async () => {
    const p = await newUserPage(browser);
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await p.goto(BASE + "/", { waitUntil: "networkidle0" });
    await wait(800);
    const r = await p.evaluate(() => ({ planes: document.querySelectorAll(".lp-flight").length, items: document.querySelectorAll(".lp-tl-item").length }));
    await p.browserContext().close();
    assert(r.planes === 0 && r.items === 4, JSON.stringify(r));
    return `비행기 ${r.planes}개, 시연 항목 ${r.items}개`;
  });

await tc("L-17", A, "약관·개인정보처리방침 페이지",
  "랜딩 하단 '이용약관', '개인정보처리방침' 링크 이동",
  "각 페이지 내용 표시, 빈칸(운영자명 등) 여부 확인",
  async () => {
    const out = [];
    for (const path of ["/terms", "/privacy"]) {
      await page.goto(BASE + path, { waitUntil: "networkidle0" });
      await wait(600);
      const t = await text(page, ".legal") || await text(page);
      const blanks = [...new Set(t.match(/\[[^\]]{2,20}\]/g) || [])];
      out.push(`${path}: ${t.length}자${blanks.length ? `, 채워지지 않은 빈칸 ${blanks.join(" ")}` : ""}`);
    }
    const hasBlanks = out.some((o) => o.includes("빈칸"));
    return { actual: out.join(" / "), status: hasBlanks ? "WARN" : "PASS", note: hasBlanks ? "정식 운영 전 빈칸 입력 필요" : "" };
  });

await tc("L-18", A, "존재하지 않는 주소 접속",
  "/abc/없는페이지 로 접속",
  "첫 화면(/)으로 돌아옴",
  async () => {
    await page.goto(BASE + "/abc/nothing", { waitUntil: "networkidle0" });
    await wait(800);
    const path = await page.evaluate(() => location.pathname);
    assert(path === "/", path);
    return `이동된 주소: ${path}`;
  });

await tc("L-19", A, "로그아웃 상태에서 /about 접속",
  "/about 접속",
  "로그아웃용 랜딩(시작 버튼이 /login)이 표시",
  async () => {
    await page.goto(BASE + "/about", { waitUntil: "networkidle0" });
    await wait(800);
    const r = await page.evaluate(() => ({ lp: !!document.querySelector(".lp"), cta: document.querySelector(".lp-nav-cta .btn-primary")?.getAttribute("href") }));
    assert(r.lp && r.cta === "/login", JSON.stringify(r));
    return JSON.stringify(r);
  });

await tc("L-20", A, "랜딩 페이지 콘솔 오류",
  "위 모든 과정 동안 브라우저 오류 기록 수집",
  "자바스크립트 오류 없음",
  async () => {
    const errs = page.__errors.filter((e) => !/favicon|ERR_BLOCKED|net::/.test(e));
    assert(errs.length === 0, errs.join(" | "));
    return "오류 0건";
  });

await browser.close();
