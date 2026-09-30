// Generates every app icon from assets/icon/foreground.svg (run: npm run icons).
//   web:     public/favicon.svg, icons/icon-192|512.png, icons/maskable-512.png, apple-touch-icon.png
//   android: adaptive icon layers + legacy launcher icons + splash images
//   store:   store/play-icon-512.png (Google Play listing icon)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../e2e/h.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = (...p) => path.join(root, ...p);
const BG = "#e07a63";      // icon tile
const APP_BG = "#16181d";  // app background (splash)
const fg = fs.readFileSync(at("assets/icon/foreground.svg"), "utf8");
const art = fg.replace(/^[\s\S]*?<g /, "<g ").replace(/<\/svg>\s*$/, "");

// Full-bleed square: the visible part of the adaptive canvas, on coral.
const VIS = "171 171 682 682";
const fullSvg = (rx = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIS}"><rect x="171" y="171" width="682" height="682" rx="${rx}" fill="${BG}"/>${art}</svg>`;
// Whole adaptive canvas on coral (maskable web icon: safe zone is the inner 80%).
const canvasSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${BG}"/>${art}</svg>`;
const fgOnlySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${art}</svg>`;
// Monochrome layer (Android 13 themed icons): same shapes, one colour.
const monoSvg = fgOnlySvg.replace(/fill="#[0-9a-fA-F]{6}"/g, 'fill="#ffffff"').replace(/stroke="#[0-9a-fA-F]{6}"/g, 'stroke="#ffffff"');

const browser = await launch();
const page = await browser.newPage();
async function png(svg, w, h, out, { bg = "transparent", scale = 1 } = {}) {
  await page.setViewport({ width: w, height: h });
  const s = Math.min(w, h) * scale;
  await page.setContent(`<html><body style="margin:0;background:${bg};width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center">
    <img style="width:${s}px;height:${s}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body></html>`);
  await page.waitForFunction(() => document.images[0].complete);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: bg === "transparent" });
}

// Web
fs.writeFileSync(at("public/favicon.svg"), fullSvg(150));
await png(fullSvg(), 192, 192, at("public/icons/icon-192.png"));
await png(fullSvg(), 512, 512, at("public/icons/icon-512.png"));
await png(canvasSvg, 512, 512, at("public/icons/maskable-512.png"));
await png(fullSvg(), 180, 180, at("public/apple-touch-icon.png"));
// Store
await png(fullSvg(), 512, 512, at("store/play-icon-512.png"));

// Android
const res = at("android/app/src/main/res");
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  await png(fgOnlySvg, 108 * k, 108 * k, `${res}/mipmap-${d}/ic_launcher_foreground.png`);
  await png(monoSvg, 108 * k, 108 * k, `${res}/mipmap-${d}/ic_launcher_monochrome.png`);
  await png(fullSvg(682 * 0.22), 48 * k, 48 * k, `${res}/mipmap-${d}/ic_launcher.png`);
  await png(fullSvg(341), 48 * k, 48 * k, `${res}/mipmap-${d}/ic_launcher_round.png`);
}
// Splash (pre-Android-12 devices; newer ones draw the launcher icon): the
// rounded icon on the app's dark background, same file sizes as before.
for (const f of fs.readdirSync(res).filter((d) => d.startsWith("drawable"))) {
  const file = `${res}/${f}/splash.png`;
  if (!fs.existsSync(file)) continue;
  const b = fs.readFileSync(file);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  await png(fullSvg(150), w, h, file, { bg: APP_BG, scale: 0.28 });
}
await browser.close();
console.log("icons written");
