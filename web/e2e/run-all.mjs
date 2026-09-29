// QA 전체 실행: 결과 초기화 → 6개 스위트 순서대로 → 바탕화면에 결과 문서 생성.
// 준비(순서 중요):
//   1) npm run test:rules 결과를 e2e/rules-result.json 에 {"pass":N,"fail":M} 로 저장
//   2) npx firebase-tools@14 emulators:start --only auth,firestore,storage,functions,hosting
//   3) npm run dev:emulator  (localhost:5173)
//   4) node e2e/run-all.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
fs.rmSync(path.join(here, "results.json"), { force: true });
for (const s of ["s1-landing", "s2-auth", "s3-trips", "s4-collab", "s5-extras", "s6-ux"]) {
  console.log(`\n=== ${s} ===`);
  try { execFileSync(process.execPath, [path.join(here, `${s}.mjs`)], { stdio: "inherit" }); }
  catch { console.log(`${s} 중단됨 (위 로그 확인)`); }
}
const d = new Date();
const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const out = path.join(os.homedir(), "Desktop", `여행플래너_테스트결과_${stamp}.html`);
execFileSync(process.execPath, [path.join(here, "report.mjs"), out], { stdio: "inherit" });
