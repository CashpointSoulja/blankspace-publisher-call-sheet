// Shared page helpers. Plain ES modules, no dependencies.

import { CHECK_ENDPOINT } from "./config.js";

export { CHECK_ENDPOINT };

export const VERTICALS = Object.freeze({
  automotive: "Automotive",
  consumer_electronics: "Consumer electronics",
  sportswear: "Sportswear"
});

export const CLASS_LABELS = Object.freeze({
  publisher: "Publishers",
  retailer: "Retailers",
  brand: "Brand sites",
  ugc: "Forums and video",
  other: "Other"
});

export const STABILITY_LABELS = Object.freeze({
  both_runs: "Cited in every run",
  one_run: "Cited in one run only",
  single_run_only: "One run per query"
});

export const STABILITY_TOOLTIP = "Results vary run to run.";

// --- DOM ------------------------------------------------------------------------------
// Build elements from data with textContent only. Data never reaches innerHTML.

export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "href") node.setAttribute("href", safeHref(v));
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function safeHref(href) {
  const s = String(href);
  if (s.startsWith("/") || s.startsWith("#")) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "#";
  } catch {
    return "#";
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// --- Formatting -----------------------------------------------------------------------

export function fmtNumber(n) {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-GB") : null;
}

export function fmtDate(s) {
  if (!s) return null;
  const d = new Date(/T/.test(s) ? s : `${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(s) {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });
}

export function fmtPct(x, digits = 0) {
  return typeof x === "number" && Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : null;
}

export const UNKNOWN = "Unknown";

// --- Data -----------------------------------------------------------------------------

export async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export async function loadText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

// Company claims are shown only once they carry a source (SPEC §8.5, §10.8).
export async function loadSourcedClaims() {
  const all = (await loadJSON("/data/company-claims.json")) || [];
  return all.filter((c) => c && typeof c.source_url === "string" && /^https:\/\//.test(c.source_url) && c.accessed);
}

export function claimNode(claim) {
  return el("p", { class: "claim" },
    el("span", { class: "tag tag-sm" }, "Company claim"), " ",
    claim.required_phrasing, ". ",
    el("a", { href: claim.source_url, rel: "noopener", target: "_blank" }, "Source"),
    el("span", { class: "muted small" }, `, read ${fmtDate(claim.accessed)}`), ".");
}

// Minimal CSV parser for citation-sample.csv (RFC 4180 quoting).
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0] !== "");
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

// --- Page chrome ----------------------------------------------------------------------

function initNav() {
  const btn = document.querySelector(".nav-menu-btn");
  const menu = document.getElementById("mobile-menu");
  if (!btn || !menu) return;
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus(); };
  btn.addEventListener("click", () => {
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    const first = menu.querySelector("a, button");
    if (first) first.focus();
  });
  menu.addEventListener("click", (e) => { if (e.target === menu || e.target.closest(".mobile-menu__close")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) close(); });

  const here = location.pathname.replace(/index\.html$/, "");
  document.querySelectorAll(".nav-link, .mobile-menu a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href !== "/" && here.startsWith(href)) a.setAttribute("aria-current", "page");
  });
}

// Accessible tabs: [role=tablist] > [role=tab][aria-controls]
export function initTabs(root = document) {
  root.querySelectorAll('[role="tablist"]').forEach((list) => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = (tab) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      }
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(tab));
      tab.addEventListener("keydown", (e) => {
        let next = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === "Home") next = tabs[0];
        if (e.key === "End") next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next); next.focus(); }
      });
    });
  });
}

initNav();
