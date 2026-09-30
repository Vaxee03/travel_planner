// Link-preview image (public/og.jpg, 1200x630) shown by KakaoTalk, Slack, SNS.
// Run: npm run og
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../e2e/h.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fg = fs.readFileSync(path.join(root, "assets/icon/foreground.svg"), "utf8");
const art = fg.replace(/^[\s\S]*?<g /, "<g ").replace(/<\/svg>\s*$/, "");
const icon = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="171 171 682 682"><rect x="171" y="171" width="682" height="682" rx="150" fill="#e07a63"/>${art}</svg>`).toString("base64")}`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;700&family=Noto+Serif+KR:wght@700&display=block" rel="stylesheet">
<style>
  body{margin:0;width:1200px;height:630px;background:radial-gradient(circle at 85% 20%,#26222a 0,#16181d 55%);color:#f1ece6;font-family:"Noto Sans KR",sans-serif;position:relative;overflow:hidden}
  .copy{position:absolute;left:92px;top:118px}
  .eyebrow{font-weight:700;letter-spacing:.24em;color:#c9a35f;font-size:25px}
  h1{font-family:"Noto Serif KR",serif;font-size:96px;margin:22px 0 26px;letter-spacing:-.01em}
  p{margin:0;font-size:33px;line-height:1.5;color:#b9b1a7}
  .url{position:absolute;left:92px;bottom:88px;color:#e07a63;font-weight:700;font-size:30px}
  .icon{position:absolute;right:120px;top:160px;width:300px;height:300px;border-radius:66px;box-shadow:0 24px 60px rgba(0,0,0,.45)}
</style></head><body>
  <div class="copy"><div class="eyebrow">TRIP PLANNER</div><h1>여행 플래너</h1>
  <p>일정 · 예산 · 체크리스트를<br>동행자와 함께 계획하세요</p></div>
  <div class="url">tripplanner.kr</div>
  <img class="icon" src="${icon}">
</body></html>`;

const b = await launch();
const p = await b.newPage();
await p.setViewport({ width: 1200, height: 630 });
await p.setContent(html, { waitUntil: "networkidle0" });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: path.join(root, "public/og.jpg"), type: "jpeg", quality: 90 });
await b.close();
console.log("public/og.jpg written");
