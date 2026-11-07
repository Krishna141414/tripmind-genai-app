/* TripMind shared front-end helpers: speed presets, fetch with CSRF, toasts, animations, layout. */
"use strict";

// ALL animation + tour timings live here (ms). Slow / Medium / Fast is shared by the tour and in-page animations.
const SPEED = {
  slow:   { step: 5500, aiDwell: 5000, type: 26, stagger: 220, count: 1600, pipeline: 650, transition: 420, toast: 6000, typeIn: 70 },
  medium: { step: 3600, aiDwell: 3500, type: 12, stagger: 130, count: 1100, pipeline: 420, transition: 320, toast: 4500, typeIn: 40 },
  fast:   { step: 2000, aiDwell: 1800, type: 4,  stagger: 60,  count: 600,  pipeline: 200, transition: 200, toast: 3500, typeIn: 15 },
};

const TM = (window.TM = window.TM || {});
TM.reducedMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

TM.speedName = function () {
  let s = null;
  try { s = localStorage.getItem("tm-speed"); } catch (e) {}
  return SPEED[s] ? s : "medium";
};
TM.setSpeed = function (name) {
  try { localStorage.setItem("tm-speed", name); } catch (e) {}
  document.documentElement.style.setProperty("--t-transition", TM.speed().transition + "ms");
  document.dispatchEvent(new CustomEvent("tm:speed", { detail: name }));
};
TM.speed = function () {
  const s = Object.assign({}, SPEED[TM.speedName()]);
  if (TM.reducedMotion) Object.assign(s, { type: 0, stagger: 0, count: 0, pipeline: 0, transition: 0, typeIn: 0 });
  return s;
};
TM.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
TM.$ = (sel, root) => (root || document).querySelector(sel);
TM.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
TM.el = function (tag, cls, text) {           // safe element builder: text is always set via textContent
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
TM.csrf = () => (TM.$('meta[name="csrf-token"]') || {}).content || "";

/** fetch JSON with the CSRF header. Returns {ok, status, data, headers, ms}. Shows a toast on 429. */
TM.api = async function (url, opts) {
  opts = opts || {};
  const headers = Object.assign({ "X-Requested-With": "fetch", Accept: "application/json" }, opts.headers || {});
  if (opts.csrf !== false && opts.method && opts.method !== "GET") headers["X-CSRFToken"] = TM.csrf();
  let body = opts.body;
  if (body && typeof body !== "string") { body = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url, { method: opts.method || "GET", headers, body, credentials: opts.credentials || "same-origin" });
  } catch (e) {
    TM.toast("Network error", "Could not reach the server.", "error");
    return { ok: false, status: 0, data: { error: { code: "network", message: "Network error" } }, headers: new Headers(), ms: 0 };
  }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  const out = { ok: res.ok, status: res.status, data, headers: res.headers, ms: Math.round(performance.now() - t0) };
  if (res.status === 429 && !opts.quiet429) TM.toast("429 · Rate limit hit", (data && data.error && data.error.message) || "Too many requests.", "error");
  return out;
};

/* ---------- Toasts ---------- */
TM.toast = function (title, text, kind) {
  const box = TM.$("#toasts");
  if (!box) return;
  const t = TM.el("div", "toast " + (kind || ""));
  const body = TM.el("div");
  body.append(TM.el("b", null, title));
  if (text) body.append(TM.el("span", "small muted", text));
  t.append(body);
  box.append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, TM.speed().toast);
};

/* ---------- Animations ---------- */
TM.countUp = function (el) {
  const target = parseFloat(el.dataset.count || "0"), dec = parseInt(el.dataset.decimals || "0", 10), suf = el.dataset.suffix || "";
  const dur = TM.speed().count, t0 = performance.now();
  const frame = (now) => {
    const p = dur ? Math.min(1, (now - t0) / dur) : 1, eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * eased).toFixed(dec) + suf;
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

/** Type `text` into `el` character by character (textContent only, so it is always HTML-escaped). */
TM.typeText = async function (el, text, perChar) {
  const ms = perChar == null ? TM.speed().type : perChar;
  if (!ms) { el.textContent = text; return; }
  const caret = TM.el("span", "caret");
  el.textContent = "";
  const node = document.createTextNode("");
  el.append(node, caret);
  const chunk = Math.max(1, Math.round(text.length / 400));            // long answers type in small chunks
  for (let i = 0; i < text.length; i += chunk) {
    node.data = text.slice(0, i + chunk);
    await TM.sleep(ms);
  }
  caret.remove();
};

/** Simulate a person typing into an input (used by the tour and example chips). */
TM.typeInto = async function (input, text) {
  const ms = TM.speed().typeIn;
  input.focus();
  if (!ms || text.length > 120) { input.value = text; input.dispatchEvent(new Event("input", { bubbles: true })); return; }
  input.value = "";
  for (const ch of text) {
    input.value += ch;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await TM.sleep(ms);
  }
};

TM.copy = async function (text) {
  try { await navigator.clipboard.writeText(text); TM.toast("Copied", "Copied to clipboard.", "success"); }
  catch (e) { TM.toast("Copy failed", "Select and copy manually.", "error"); }
};

TM.prettyJson = (obj) => JSON.stringify(obj, null, 2);

/* ---------- Layout: theme, mobile nav, page transitions, flashes ---------- */
document.addEventListener("DOMContentLoaded", function () {
  TM.setSpeed(TM.speedName());

  const themeBtn = TM.$("#theme-btn");
  if (themeBtn) themeBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("tm-theme", next); } catch (e) {}
    document.dispatchEvent(new CustomEvent("tm:theme"));
  });

  const menu = TM.$("#menu-btn"), scrim = TM.$("#scrim");
  if (menu) menu.addEventListener("click", () => document.body.classList.toggle("nav-open"));
  if (scrim) scrim.addEventListener("click", () => document.body.classList.remove("nav-open"));

  // Page transition: fade out before following sidebar links
  TM.$$(".nav a, .brand").forEach((a) => a.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || TM.reducedMotion) return;
    e.preventDefault();
    document.body.classList.add("leaving");
    setTimeout(() => (location.href = a.href), 150);
  }));
  window.addEventListener("pageshow", () => document.body.classList.remove("leaving"));

  // Server flash messages -> toasts
  TM.$$("#flashes span").forEach((s) => TM.toast(s.dataset.cat === "success" ? "Success" : "Notice", s.textContent,
    s.dataset.cat === "success" ? "success" : s.dataset.cat === "error" ? "error" : ""));
});
