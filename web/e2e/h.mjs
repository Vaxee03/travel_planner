// Shared helpers for the end-to-end run against the local emulators.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const BASE = "http://localhost:5173";
export const HOSTING = "http://127.0.0.1:5000";
export const PROJECT = "travel-planner-bb32d";
export const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/travelplanner/documents`;
// The phone suite keeps its own file: both suites number some cases "M-..."
// (web: 동행자 관리, phone: mobile), which would overwrite each other.
export const RESULTS = new URL(/m1-android/.test(process.argv[1] || "") ? "./results-mobile.json" : "./results.json", import.meta.url);
export const SHOTS = new URL("./shots/", import.meta.url);
fs.mkdirSync(SHOTS, { recursive: true });

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  return puppeteer.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
    protocolTimeout: 60000,
    args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
}

/** A fresh, isolated browser profile (own cookies/IndexedDB) = one user. */
export async function newUserPage(browser, { width = 1280, height = 900, scheme = "light" } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  page.__errors = [];
  page.on("pageerror", (e) => page.__errors.push("pageerror: " + e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") page.__errors.push("console: " + m.text().slice(0, 200)); });
  page.on("dialog", async (d) => { page.__lastDialog = d.message(); await d.accept(); });
  return page;
}

// ---- results --------------------------------------------------------------
let results = [];
try { results = JSON.parse(fs.readFileSync(RESULTS, "utf8")); } catch { results = []; }
export function saveResults() { fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2)); }

/** Runs one test case. `fn` returns the observed result text (or throws). A
 * returned {status:"WARN"|"SKIP", actual} marks a finding without failing. */
export async function tc(id, area, title, steps, expected, fn) {
  results = results.filter((r) => r.id !== id);
  const started = Date.now();
  let rec;
  try {
    const out = await fn();
    const o = typeof out === "object" && out ? out : { actual: String(out ?? "") };
    rec = { id, area, title, steps, expected, actual: o.actual, status: o.status || "PASS", note: o.note || "" };
  } catch (e) {
    rec = { id, area, title, steps, expected, actual: String(e?.message || e).slice(0, 500), status: "FAIL", note: "" };
  }
  rec.ms = Date.now() - started;
  results.push(rec);
  saveResults();
  console.log(`[${rec.status}] ${id} ${title} — ${String(rec.actual).slice(0, 160)}`);
  return rec;
}

export function assert(cond, msg) { if (!cond) throw new Error(msg); }

export async function waitFor(fnOrPage, predicate, { timeout = 10000, interval = 150, label = "condition" } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await (typeof fnOrPage === "function" ? fnOrPage() : fnOrPage.evaluate(predicate));
    if (last) return last;
    await wait(interval);
  }
  throw new Error(`timeout waiting for ${label}`);
}

// ---- page helpers ---------------------------------------------------------
export const text = (page, sel = "body") => page.evaluate((s) => document.querySelector(s)?.innerText || "", sel);

/** Clicks the first element matching `sel` whose text includes `label`. */
export async function click(page, sel, label, { exact = false, timeout = 6000 } = {}) {
  const end = Date.now() + timeout;
  let ok = false;
  while (!ok && Date.now() < end) {
    ok = await tryClick(page, sel, label, exact);
    if (!ok) await wait(200);
  }
  if (!ok) throw new Error(`no ${sel} with text "${label}"`);
  await wait(250);
}
async function tryClick(page, sel, label, exact) {
  return page.evaluate((sel, label, exact) => {
    const el = [...document.querySelectorAll(sel)].find((e) => {
      const t = e.textContent.trim();
      return label == null || (exact ? t === label : t.includes(label));
    });
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.click();
    return true;
  }, sel, label, exact);
}

/** Sets form fields inside the open modal by name (works for React
 * controlled and uncontrolled inputs, selects, checkboxes, radios). */
export async function fill(page, values, scope = ".modal") {
  const names = Object.keys(values);
  await waitFor(page, () => true, { timeout: 1 }).catch(() => {});
  const end = Date.now() + 6000;
  while (Date.now() < end) {
    const ready = await page.evaluate((names, scope) => {
      const root = [...document.querySelectorAll(scope)].pop();
      return !!root && names.every((n) => root.querySelector(`[name="${n}"]`));
    }, names, scope);
    if (ready) break;
    await wait(150);
  }
  const missing = await page.evaluate((values, scope) => {
    const root = [...document.querySelectorAll(scope)].pop() || document;
    const miss = [];
    for (const [name, value] of Object.entries(values)) {
      const els = [...root.querySelectorAll(`[name="${name}"]`)];
      if (!els.length) { miss.push(name); continue; }
      const el = els[0];
      if (el.type === "radio") {
        const r = els.find((e) => e.value === value);
        if (!r) { miss.push(name + "=" + value); continue; }
        r.click();
      } else if (el.type === "checkbox") {
        if (el.checked !== Boolean(value)) el.click();
      } else {
        const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
        el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    return miss;
  }, values, scope);
  if (missing.length) throw new Error("fields not found: " + missing.join(", "));
  await wait(150);
}

export async function submitModal(page) {
  await page.evaluate(() => {
    const m = [...document.querySelectorAll(".modal")].pop();
    const b = m.querySelector('button[type="submit"]');
    b.click();
  });
  await wait(600);
}

/** The app's own confirm / alert (src/lib/dialogs.js): waits for it, keeps
 * its message in page.__lastDialog, and presses OK (or cancel). */
export async function answerDialog(page, ok = true, { timeout = 5000 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const msg = await page.evaluate((ok) => {
      const layer = document.querySelector(".dialog-layer");
      if (!layer) return null;
      const buttons = layer.querySelectorAll(".modal-actions button");
      const message = layer.querySelector(".dialog-msg").innerText;
      (ok ? buttons[buttons.length - 1] : buttons[0]).click();
      return message;
    }, ok);
    if (msg != null) { page.__lastDialog = msg; await wait(150); return msg; }
    await wait(120);
  }
  return null;
}
export const modalOpen = (page) => page.evaluate(() => !!document.querySelector(".modal"));
export const modalText = (page) => page.evaluate(() => [...document.querySelectorAll(".modal")].pop()?.innerText || "");

/** Signs a page in as `uid` through the emulator-only hook and deals with
 * the first-login nickname prompt. */
export async function signInAs(page, uid, nickname) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.evaluate((uid) => window.__emulatorSignIn(uid), uid);
  await waitFor(page, () => !!document.querySelector("header.top"), { label: "app shell" });
  await wait(1200);
  if (nickname) {
    if (!(await modalOpen(page))) {
      await click(page, "button", "닉네임 수정", { exact: true });
    }
    await fill(page, { nickname });
    await submitModal(page);
    await waitFor(page, () => !document.querySelector(".modal"), { label: "nickname saved" });
  }
}

export async function shot(page, name, opts = {}) {
  const p = fileURLToPath(new URL(`${name}.png`, SHOTS));
  await page.screenshot({ path: p, ...opts });
  return p;
}

// ---- Firestore emulator (admin view) --------------------------------------
function decode(v) {
  if (!v || typeof v !== "object") return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return { __ts: v.timestampValue };
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decode);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  return v;
}
function encode(v) {
  if (v === null) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
  return { stringValue: String(v) };
}
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };
export async function fsGet(path) {
  const r = await fetch(`${FS}/${path}`, { headers: H });
  if (r.status === 404) return null;
  const j = await r.json();
  return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, decode(v)]));
}
export async function fsList(coll) {
  const r = await fetch(`${FS}/${coll}?pageSize=300`, { headers: H });
  const j = await r.json();
  return (j.documents || []).map((d) => ({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)])) }));
}
export async function fsSet(path, data) {
  const r = await fetch(`${FS}/${path}`, { method: "PATCH", headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)])) }) });
  if (!r.ok) throw new Error("fsSet " + r.status + " " + (await r.text()).slice(0, 200));
}
export async function fsDelete(path) { await fetch(`${FS}/${path}`, { method: "DELETE", headers: H }); }

/** Finds the trip a user just created by title. */
export async function tripByTitle(title, uid) {
  const all = await fsList("trips");
  return all.find((t) => t.title === title && (!uid || (t.memberIds || []).includes(uid))) || null;
}
export async function resetFirestore() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/travelplanner/documents`, { method: "DELETE" });
}

export function isoDay(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
