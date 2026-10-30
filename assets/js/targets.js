// /targets/: ranked call sheet from data/readership.json, with a vertical filter and weight
// sliders that re-rank live. Custom weights rank by Σ w·s / Σ w over known signals (SPEC §3).
// Only citation share was collected for the sample, so the live signals are unknown here:
// they are left out of each total and maximum, never counted as zero.

import { el, clear, fmtDate, fmtPct, VERTICALS, STABILITY_LABELS, STABILITY_TOOLTIP } from "./common.js";
import { SIGNALS, SIGNAL_LABELS, DEFAULT_WEIGHTS, partsFromSubscores, score, ratio } from "./score.js";
import { loadSample, loadReadership, sampleDate, rankReadership } from "./sample-data.js";

const tbody = document.getElementById("rows");
const status = document.getElementById("status");
const sliders = document.getElementById("sliders");
const weightsNote = document.getElementById("weights-note");
let rows = [];
let vertical = "all";
let weights = { ...DEFAULT_WEIGHTS };

const subscoresOf = (r) => ({ readership: r.s_citation_share, placement: null, programmatic: null, reachability: null, commerce: null });

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
      const scored = score(partsFromSubscores(subscoresOf(r)), weights);
      return { r, scored, key: ratio(scored) };
    })
    .sort((a, b) => (b.key ?? -1) - (a.key ?? -1) || a.r.rank - b.r.rank);
  ranked.forEach((x, i) => { x.newRank = i + 1; });
  const shown = ranked.filter((x) => vertical === "all" || x.r.vertical === vertical);

  if (!shown.length) {
    tbody.append(el("tr", { class: "empty-row" }, el("td", { colspan: "8" },
      rows.length ? "No publishers from this vertical in the sample." : "No rows. data/readership.json is empty or missing.")));
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
      el("td", { class: "num" }, fmtPct(r.share, 1)),
      el("td", { class: "num hide-sm" }, `${r.probes_cited_in_vertical} of ${r.vertical_probes_total}`),
      el("td", { class: "hide-sm", title: STABILITY_TOOLTIP }, STABILITY_LABELS[r.stability] || r.stability),
      el("td", {}, el("a", { href: `/check/?url=${encodeURIComponent(r.domain)}` }, "Run"))));
  }
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

Promise.all([loadReadership(), loadSample().catch(() => null)])
  .then(([readership, sample]) => {
    const date = fmtDate(sampleDate(sample));
    document.getElementById("stamp").textContent = date ? `Dated sample · ${date}` : "Dated sample";
    rows = rankReadership(readership);
    status.textContent = rows.length
      ? `${rows.length} publishers cited in the sample. Scored on citation share alone, so each is out of 40 until its live signals are collected.`
      : "No sample rows found.";
    if (weightsNote) weightsNote.hidden = false;
    render();
  })
  .catch(() => { status.textContent = "Sample data could not be read."; });
