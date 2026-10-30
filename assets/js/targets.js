// /targets/: the call sheet. Citation share from data/readership.json, live signals from stored
// checks in data/evidence/ where they exist. Weight sliders re-rank live (SPEC §3).
// Ordering rules are in evidence-model.js buildCallSheet: checked publishers first, more signals
// known first; unchecked publishers after, on citation share. Unknown is never zero.
// This ranks evidence, not readiness: readiness is qualified by hand on /first-wave/.

import { el, clear, fmtDate, fmtPct, VERTICALS, STABILITY_LABELS, STABILITY_TOOLTIP } from "./common.js";
import { SIGNALS, SIGNAL_LABELS, DEFAULT_WEIGHTS, STANCES } from "./score.js";
import { loadSampleSet, loadLiveEvidence, loadQualification, sampleDate, buildCallSheet } from "./sample-data.js";

const DECISION_LABELS = { ready_for_discovery: "Ready for discovery", hold: "Hold", exclude: "Excluded" };
let decisions = {};

const tbody = document.getElementById("rows");
const status = document.getElementById("status");
const sliders = document.getElementById("sliders");
const coverageNote = document.getElementById("weights-note");
let readership = [];
let live = {};
let sample = null;
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

function groupRow(text, detail) {
  return el("tr", { class: "group-row" }, el("th", { colspan: "8", scope: "rowgroup" }, text, el("span", { class: "muted" }, ` · ${detail}`)));
}

function row(x) {
  const r = x.row;
  return el("tr", { class: x.checked ? "is-checked" : "" },
    el("td", { class: "num" }, String(x.position)),
    el("td", {}, el("a", { class: "domain-link", href: `/p/${encodeURIComponent(r.domain)}/` }, r.domain),
      decisions[r.domain] ? [" ", el("a", { class: decisions[r.domain] === "ready_for_discovery" ? "tag tag-sm" : "tag tag-neutral tag-sm", href: `/first-wave/#${encodeURIComponent(r.domain)}` }, DECISION_LABELS[decisions[r.domain]])] : null),
    el("td", { class: "hide-sm" }, VERTICALS[r.vertical] || r.vertical),
    el("td", { class: "score-cell" },
      el("strong", {}, String(Math.round(x.scored.total))),
      el("span", {}, ` / ${Math.round(x.scored.max)}`)),
    el("td", { class: "num", title: x.known === SIGNALS.length ? "All five signals known" : `${SIGNALS.length - x.known} unknown, left out of the score` }, `${x.known} of ${SIGNALS.length}`),
    el("td", { class: "num", title: `${STABILITY_LABELS[r.stability] || r.stability}. ${STABILITY_TOOLTIP}` }, fmtPct(r.share, 1)),
    el("td", { class: "hide-sm" }, x.checked ? STANCES[x.stance].label : el("span", { class: "muted" }, "Not checked")),
    el("td", {}, x.checked
      ? el("span", { class: "muted" }, fmtDate(x.checkedAt))
      : el("a", { href: `/check/?url=${encodeURIComponent(r.domain)}` }, "Run")));
}

function render() {
  clear(tbody);
  if (!readership.length) {
    tbody.append(el("tr", { class: "empty-row" }, el("td", { colspan: "8" }, "No rows. data/readership.json is empty or missing.")));
    return;
  }
  const sheet = buildCallSheet(readership, live, weights, sample);
  const inVertical = (x) => vertical === "all" || x.vertical === vertical;
  const checked = sheet.checked.filter(inVertical);
  const unchecked = sheet.unchecked.filter(inVertical);
  if (!checked.length && !unchecked.length) {
    tbody.append(el("tr", { class: "empty-row" }, el("td", { colspan: "8" }, "No publishers from this vertical in the sample.")));
    return;
  }
  // Group headings appear once any publisher has a stored check.
  if (sheet.checked.length && checked.length) {
    tbody.append(groupRow(`Live-checked · ${checked.length}`, "more signals read first, then score; unknown never counts as zero"));
    checked.forEach((x) => tbody.append(row(x)));
  }
  if (unchecked.length) {
    if (sheet.checked.length) tbody.append(groupRow(`Not yet checked · ${unchecked.length}`, "ranked on citation share; live signals unknown"));
    unchecked.forEach((x) => tbody.append(row(x)));
  }
}

function describeCoverage() {
  const n = Object.keys(live).filter((d) => readership.some((r) => r.domain === d)).length;
  const date = fmtDate(sampleDate(sample));
  document.getElementById("stamp").textContent = date ? `Dated sample · ${date}` : "Dated sample";
  const fixes = sample && sample.corrections && sample.corrections.length
    ? ` ${sample.original.publishers_cited} as collected; ${sample.corrections.length} reclassified after review, see the method.` : "";
  status.textContent = `${readership.length} publishers cited in the sample.${fixes} Live signals checked for ${n} of ${readership.length}.`;
  if (!coverageNote) return;
  clear(coverageNote);
  coverageNote.hidden = false;
  if (!n) {
    coverageNote.append(el("strong", {}, "Only citation share is collected so far. "),
      "Placement, programmatic, reachability and commerce come from a live check of each publisher. Until checks are stored, those weights can’t change the order. Use “Run” on any row to read them now.");
  } else {
    coverageNote.append(el("strong", {}, `Live signals checked for ${n} of ${readership.length} publishers. `),
      "Those are ranked first, more signals read first, and the weights re-rank them. The rest follow on citation share alone. A signal not read is left out, never counted as zero. This ranks evidence, not readiness to buy: ",
      el("a", { href: "/first-wave/" }, "the first wave"), " is qualified by hand.");
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

Promise.all([loadSampleSet(), loadLiveEvidence().catch(() => ({})), loadQualification()])
  .then(([set, l, q]) => {
    decisions = Object.fromEntries(((q && q.accounts) || []).flatMap((a) => a.domains.map((d) => [d, a.decision])));
    readership = set.readership;
    sample = set.sample;
    live = l;
    describeCoverage();
    render();
  })
  .catch(() => { status.textContent = "Sample data could not be read."; });
