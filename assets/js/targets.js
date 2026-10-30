// /targets/: ranked call sheet with a vertical filter and weight sliders that re-rank live.
// Custom weights rank by Σ w·s / Σ w over known signals (SPEC §3).

import { el, clear, loadJSON, fmtDate, VERTICALS, STABILITY_LABELS, STABILITY_TOOLTIP } from "./common.js";
import { SIGNALS, SIGNAL_LABELS, DEFAULT_WEIGHTS, STANCES, partsFromSubscores, score, ratio } from "./score.js";

const STANCE_SHORT = {
  "already-decided": "Already decided",
  "reading-free": "Read for free",
  "no-owner": "No owner yet",
  "closed-door": "Closed door",
  unknown: "Unknown"
};

const tbody = document.getElementById("rows");
const status = document.getElementById("status");
const sliders = document.getElementById("sliders");
let rows = [];
let vertical = "all";
let weights = { ...DEFAULT_WEIGHTS };

function readWeightsFromUrl() {
  const w = new URLSearchParams(location.search).get("w");
  if (!w) return;
  const parts = w.split(",").map(Number);
  if (parts.length !== SIGNALS.length || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 100)) return;
  SIGNALS.forEach((k, i) => { weights[k] = parts[i]; });
}

function writeWeightsToUrl() {
  const isDefault = SIGNALS.every((k) => weights[k] === DEFAULT_WEIGHTS[k]);
  const params = new URLSearchParams(location.search);
  if (isDefault) params.delete("w"); else params.set("w", SIGNALS.map((k) => weights[k]).join(","));
  const q = params.toString();
  history.replaceState(null, "", location.pathname + (q ? `?${q}` : ""));
}

function buildSliders() {
  clear(sliders);
  for (const k of SIGNALS) {
    const id = `w-${k}`;
    const out = el("output", { for: id, class: "num" }, String(weights[k]));
    const input = el("input", { type: "range", id, min: "0", max: "100", step: "5", value: String(weights[k]) });
    input.addEventListener("input", () => {
      weights[k] = Number(input.value);
      out.textContent = input.value;
      writeWeightsToUrl();
      render();
    });
    sliders.append(el("div", { class: "slider" },
      el("div", { class: "bar-meta" }, el("label", { for: id }, SIGNAL_LABELS[k]), out),
      input));
  }
}

function render() {
  clear(tbody);
  const ranked = rows
    .map((r) => {
      const scored = score(partsFromSubscores(r.subscores), weights);
      return { r, scored, key: ratio(scored) };
    })
    .sort((a, b) => (b.key ?? -1) - (a.key ?? -1) || a.r.rank - b.r.rank);
  ranked.forEach((x, i) => { x.newRank = i + 1; });
  const shown = ranked.filter((x) => vertical === "all" || x.r.vertical === vertical);

  if (!shown.length) {
    tbody.append(el("tr", { class: "empty-row" }, el("td", { colspan: "8" },
      rows.length ? "No publishers from this vertical in the sample." : "No rows yet. data/targets.json is empty until the sample is scored.")));
    return;
  }
  for (const { r, scored, newRank } of shown) {
    const moved = newRank !== r.rank;
    tbody.append(el("tr", {},
      el("td", { class: "num" }, String(newRank), moved ? el("span", { class: "muted" }, ` (was ${r.rank})`) : null),
      el("td", {}, el("a", { class: "domain-link", href: `/p/${encodeURIComponent(r.domain)}/` }, r.domain)),
      el("td", { class: "hide-sm" }, VERTICALS[r.vertical] || r.vertical),
      el("td", { class: "score-cell" },
        el("strong", {}, String(Math.round(scored.total))),
        el("span", {}, ` / ${Math.round(scored.max)}`)),
      el("td", {}, mini(r.subscores)),
      el("td", { class: "hide-sm" }, STANCE_SHORT[r.stance] || r.stance, el("br"), el("span", { class: "muted" }, `${STANCES[r.stance] ? STANCES[r.stance].priority : ""} priority`)),
      el("td", { class: "hide-sm", title: STABILITY_TOOLTIP }, STABILITY_LABELS[r.stability] || r.stability),
      el("td", { class: "hide-sm" }, (r.cdn || []).join(", ") || "Unidentified")));
  }
}

function mini(sub) {
  return el("span", { class: "minibars", "aria-label": SIGNALS.map((k) => `${SIGNAL_LABELS[k]} ${sub[k] === null ? "unknown" : Math.round(sub[k] * 100) + "%"}`).join(", ") },
    SIGNALS.map((k) => el("span", { class: "minibar", title: `${SIGNAL_LABELS[k]}: ${sub[k] === null ? "unknown" : Math.round(sub[k] * 100) + "%"}` },
      el("span", { class: sub[k] === null ? "minibar-unknown" : "minibar-fill", style: `height:${sub[k] === null ? 100 : Math.max(4, sub[k] * 100)}%` }))));
}

document.querySelectorAll("[data-vertical]").forEach((btn) => {
  btn.addEventListener("click", () => {
    vertical = btn.dataset.vertical;
    document.querySelectorAll("[data-vertical]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    render();
  });
});

document.getElementById("reset").addEventListener("click", () => {
  weights = { ...DEFAULT_WEIGHTS };
  writeWeightsToUrl();
  buildSliders();
  render();
});

readWeightsFromUrl();
buildSliders();
render();

Promise.all([loadJSON("/data/targets.json"), loadJSON("/data/front.json")])
  .then(([t, front]) => {
    const date = front && front.sample_date ? fmtDate(front.sample_date) : null;
    document.getElementById("stamp").textContent = date ? `Dated sample · ${date}` : "Dated sample · date not set";
    rows = t && Array.isArray(t.rows) ? t.rows : [];
    status.textContent = rows.length ? `${rows.length} publishers. Unknown signals are left out of each total and maximum.` : "Awaiting sample data.";
    render();
  })
  .catch(() => { status.textContent = "Sample data could not be read."; });
