// Builds the test-result document (HTML) from results.json.
import fs from "node:fs";

const results = JSON.parse(fs.readFileSync(new URL("./results.json", import.meta.url), "utf8"));
const out = process.argv[2];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Security-rules unit tests run separately (npm run test:rules, before the
// emulators for this suite start); run-all.mjs saves their counts here.
try {
  if (process.argv[3] === "mobile") throw new Error("rules are part of the web run");
  const rr = JSON.parse(fs.readFileSync(new URL("./rules-result.json", import.meta.url), "utf8"));
  results.push({ id: "S-01", area: "보안 규칙", title: `Firestore·Storage 보안 규칙 자동 테스트 ${rr.pass + rr.fail}개`, steps: "npm run test:rules (에뮬레이터에서 규칙 단위 테스트 실행)", expected: "모두 통과", actual: `${rr.pass}개 통과 / ${rr.fail}개 실패`, status: rr.fail ? "FAIL" : "PASS", note: "" });
} catch { /* rules not run this time */ }

const order = ["랜딩 페이지", "로그인·회원가입", "여행·일정", "초대·실시간 협업", "예산·정산", "체크리스트", "예약 정보", "동행자 관리", "공개 링크·미리보기", "AI 맛집 추천", "후기·사진", "회원 탈퇴", "오프라인·네트워크", "앱 설치·호스팅", "사용성·예외 상황", "보안 규칙", "공통"];
const areas = [...new Set([...order.filter((a) => results.some((r) => r.area === a)), ...results.map((r) => r.area)])];
const count = (st) => results.filter((r) => r.status === st).length;
const LABEL = { PASS: "통과", WARN: "개선 필요", FAIL: "버그", SKIP: "건너뜀" };

const rows = (area) => results.filter((r) => r.area === area).map((r) => `
  <tr class="${r.status}">
    <td class="id">${esc(r.id)}</td>
    <td><b>${esc(r.title)}</b><div class="steps">${esc(r.steps)}</div></td>
    <td>${esc(r.expected)}</td>
    <td>${esc(r.actual)}${r.note ? `<div class="note">${esc(r.note)}</div>` : ""}</td>
    <td class="st"><span class="badge ${r.status}">${LABEL[r.status] || r.status}</span></td>
  </tr>`).join("");

const problems = results.filter((r) => r.status === "FAIL" || r.status === "WARN");

// "mobile" (argv[3]) = the Android app suite (e2e/m1-android.mjs) on a real phone.
const KIND = process.argv[3] === "mobile" ? "mobile" : "web";
const TITLE = KIND === "mobile" ? "여행 플래너 안드로이드 앱 테스트 결과" : "여행 플래너 테스트 결과";
const TARGET = KIND === "mobile"
  ? "대상: 안드로이드 앱 디버그 빌드 1.0.0 (tripplanner.kr 배포본과 같은 코드) · 기기: 갤럭시 Z 플립7 (Android 16)"
  : "대상: 현재 main 브랜치 (tripplanner.kr 배포본과 같은 코드)";
const WEB_METHOD = `<h2>테스트 방법</h2>
<div class="box"><ul>
<li><b>환경</b>: 내 PC에서 Firebase 에뮬레이터(로그인·데이터베이스·사진 저장소·서버 함수·호스팅)를 띄우고, 실제 앱 화면을 자동화 브라우저(Microsoft Edge)로 직접 클릭·입력하며 확인했어요. 실제 서비스 데이터는 건드리지 않았어요.</li>
<li><b>여러 사용자</b>: 서로 분리된 브라우저 3개(민수·지은·서연)로 초대, 실시간 반영, 권한, 동시 편집을 확인했어요.</li>
<li><b>실제 외부 서비스</b>: 목적지 검색·지도·위치 찾기는 실제 Google 지도 API를 사용했어요.</li>
<li><b>판정 기준</b>: <span class="badge PASS">통과</span> 기대대로 동작 · <span class="badge WARN">개선 필요</span> 동작은 하지만 사용자가 불편하거나 헷갈릴 수 있음 · <span class="badge FAIL">버그</span> 잘못 동작하거나 데이터·화면이 어긋남</li>
<li><b>한계</b>: (1) 로컬 테스트용 AI 키가 무효라 AI 맛집 추천의 <i>응답 내용</i>은 모의 데이터로 대신했어요(실패 처리·사용량 제한·일정 추가 흐름은 실제로 확인). (2) Google·카카오 로그인은 팝업이 열리는 것까지만 확인했어요(실제 계정 로그인은 외부 서비스). (3) 아이폰 사파리·실제 휴대폰 기기, 카카오톡 인앱 브라우저는 테스트하지 못했어요(휴대폰 화면 크기는 흉내 내서 확인).</li>
</ul></div>

`;
const MOBILE_METHOD = `<h2>테스트 방법</h2>
<div class="box"><ul>
<li><b>환경</b>: 실제 휴대폰(갤럭시 Z 플립7, Android 16)에 앱을 설치하고 USB로 연결해, 안드로이드 기능(뒤로가기·홈 버튼, 링크 열기, 공유 창, 알림창)은 adb로, 앱 화면 조작은 앱 내부 디버거로 자동 진행했어요.</li>
<li><b>데이터</b>: 폰에 로그인된 실제 계정(실서비스 데이터)으로 진행했고, 테스트용 여행 하나만 새로 만들어 쓴 뒤 마지막에 삭제했어요. 다른 여행과 설정은 건드리지 않았어요(알림 설정은 바꿨다가 원래대로 되돌림).</li>
<li><b>실제 외부 서비스</b>: 구글 지도·장소 검색, 카카오톡 등 공유 창, 구글 지도 앱, 푸시 알림(FCM)을 실제로 사용했어요.</li>
<li><b>판정 기준</b>: <span class="badge PASS">통과</span> 기대대로 동작 · <span class="badge WARN">개선 필요</span> 동작은 하지만 사용자가 불편하거나 헷갈릴 수 있음 · <span class="badge FAIL">버그</span> 기대와 다르게 동작</li>
<li><b>한계</b>: (1) 화면 누르기·글자 입력은 손가락 터치 대신 디버거로 대신했어요(키보드 표시·가림은 확인 못 함). (2) 계정이 하나라 동행자 변경 알림은 이번에 확인하지 못했어요(서버 쪽은 에뮬레이터 테스트로 확인). (3) 로그인·로그아웃은 실제 계정이라 이번 자동 테스트에서 빼고, 앞서 직접 확인한 결과(구글·카카오 로그인 성공)로 대신했어요. (4) 오프라인·비행기 모드, 화면 회전, 다른 기종·아이폰은 확인하지 않았어요.</li>
</ul></div>`;
const METHOD = KIND === "mobile" ? MOBILE_METHOD : WEB_METHOD;

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${TITLE}</title>
<style>
:root{--bg:#faf6ef;--surface:#fff;--ink:#211d1c;--soft:#6b625a;--line:#e2d8c8;--pass:#2f7a4f;--warn:#b7791f;--fail:#b8402f;--skip:#6b625a}
@media (prefers-color-scheme:dark){:root{--bg:#16181d;--surface:#1f2228;--ink:#ece6db;--soft:#9a9186;--line:#3a3d44;--pass:#6fcf97;--warn:#f2c14e;--fail:#ff8a75;--skip:#9a9186}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Malgun Gothic","Noto Sans KR",sans-serif;line-height:1.6}
main{max-width:1200px;margin:0 auto;padding:40px 20px 80px}h1{margin:0 0 6px;font-size:28px}h2{margin:40px 0 12px;font-size:20px}
.sub{color:var(--soft)}.cards{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 18px;min-width:130px}
.card b{display:block;font-size:26px}.card.PASS b{color:var(--pass)}.card.WARN b{color:var(--warn)}.card.FAIL b{color:var(--fail)}
table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:14px}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}th{background:color-mix(in srgb,var(--line) 45%,transparent);font-size:13px}
td.id{white-space:nowrap;font-family:Consolas,monospace;color:var(--soft)}td.st{white-space:nowrap}.steps{color:var(--soft);font-size:13px;margin-top:4px}
.note{margin-top:6px;font-size:13px;color:var(--warn)}tr.FAIL .note{color:var(--fail)}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12.5px;font-weight:700;color:#fff}.badge.PASS{background:var(--pass)}.badge.WARN{background:var(--warn)}.badge.FAIL{background:var(--fail)}.badge.SKIP{background:var(--skip)}
ul{padding-left:20px}li{margin:4px 0}.box{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 20px}
@media (max-width:760px){table,thead,tbody,tr,td,th{display:block}thead{display:none}tr{border-bottom:1px solid var(--line)}td{border:none;padding:6px 12px}}
</style></head><body><main>
<h1>${TITLE}</h1>
<div class="sub">실행일 ${new Date().toLocaleString("ko-KR")} · ${TARGET}</div>

<div class="cards">
  <div class="card"><span>전체</span><b>${results.length}</b></div>
  <div class="card PASS"><span>통과</span><b>${count("PASS")}</b></div>
  <div class="card WARN"><span>개선 필요</span><b>${count("WARN")}</b></div>
  <div class="card FAIL"><span>버그</span><b>${count("FAIL")}</b></div>
  ${count("SKIP") ? `<div class="card"><span>건너뜀</span><b>${count("SKIP")}</b></div>` : ""}
</div>

${METHOD}

${problems.length ? `<h2>문제 요약</h2><div class="box"><ul>${problems.sort((a, b) => (a.status === "FAIL" ? -1 : 1) - (b.status === "FAIL" ? -1 : 1)).map((r) => `<li><span class="badge ${r.status}">${LABEL[r.status]}</span> <b>${esc(r.id)}</b> ${esc(r.title)} — ${esc(r.note || r.actual)}</li>`).join("")}</ul></div>` : ""}

${areas.map((a) => `<h2>${esc(a)}</h2>
<table><thead><tr><th>ID</th><th>테스트 항목 / 절차</th><th>기대 결과</th><th>실제 결과</th><th>판정</th></tr></thead><tbody>${rows(a)}</tbody></table>`).join("")}
</main></body></html>`;

fs.writeFileSync(out, html);
console.log("written", out, results.length, "cases");
