// /targets/: the call sheet. Citation share from data/readership.json, live signals from stored
// checks in data/evidence/ where they exist. Weight sliders re-rank live (SPEC §3).
// Ordering rules are in evidence-model.js buildCallSheet: checked publishers first, ranked on
// every known signal; unchecked publishers after, on citation share. Unknown is never zero.

import { el, clear, fmtDate, fmtPct, VERTICALS, STABILITY_LABELS, STABILITY_TOOLTIP } from "./common.js";
import { SIGNALS, SIGNAL_LABELS, DEFAULT_WEIGHTS } from "./score.js";
import { loadSample, loadReadership, loadLiveEvidence, sampleDate, buildCallSheet } from "./sample-data.js";

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
    el("td", {}, el("a", { class: "domain-link", href: `/p/${encodeURIComponent(r.domain)}/` }, r.domain)),
    el("td", { class: "hide-sm" }, VERTICALS[r.vertical] || r.vertical),
    el("td", { class: "score-cell" },
      el("strong", {}, String(Math.round(x.scored.total))),
      el("span", {}, ` / ${Math.round(x.scored.max)}`)),
    el("td", { class: "num", title: x.known === SIGNALS.length ? "All five signals known" : `${SIGNALS.length - x.known} unknown, left out of the score` }, `${x.known} of ${SIGNALS.length}`),
    el("td", { class: "num", title: `${STABILITY_LABELS[r.stability] || r.stability}. ${STABILITY_TOOLTIP}` }, fmtPct(r.share, 1)),
    el("td", { class: "hide-sm" }, x.checked ? STANCE_SHORT[x.stance] || x.stance : el("span", { class: "muted" }, "Not checked")),
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
  const groups = [
    [sheet.complete, "Live-checked, all five signals read", "ranked on every signal"],
    [sheet.partial, "Live-checked, some signals unreadable", "usually a blocked fetch; ranked on what was read, never as zero"],
    [sheet.unchecked, "Not yet checked", "ranked on citation share; live signals unknown"]
  ];
  const shown = groups.map(([rows]) => rows.filter(inVertical));
  if (!shown.some((g) => g.length)) {
    tbody.append(el("tr", { class: "empty-row" }, el("td", { colspan: "8" }, "No publishers from this vertical in the sample.")));
    return;
  }
  // Group headings appear once any publisher has a stored check.
  const labelled = sheet.checked.length > 0;
  groups.forEach(([all, label, detail], i) => {
    if (!all.length || !shown[i].length) return;
    if (labelled) tbody.append(groupRow(`${label} · ${shown[i].length}`, detail));
    shown[i].forEach((x) => tbody.append(row(x)));
  });
}

function describeCoverage() {
  const n = Object.keys(live).filter((d) => readership.some((r) => r.domain === d)).length;
  const date = fmtDate(sampleDate(sample));
  document.getElementById("stamp").textContent = date ? `Dated sample · ${date}` : "Dated sample";
  status.textContent = `${readership.length} publishers cited in the sample. Live signals checked for ${n} of ${readership.length}.`;
  if (!coverageNote) return;
  clear(coverageNote);
  coverageNote.hidden = false;
  if (!n) {
    coverageNote.append(el("strong", {}, "Only citation share is collected so far. "),
      "Placement, programmatic, reachability and commerce come from a live check of each publisher. Until checks are stored, those weights can’t change the order. Use “Run” on any row to read them now.");
  } else {
    coverageNote.append(el("strong", {}, `Live signals checked for ${n} of ${readership.length} publishers. `),
      "Those are ranked first, on every signal known for them, so the weights re-rank them. The rest follow on citation share alone until they are checked. A signal not read is left out, never counted as zero.");
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

Promise.all([loadReadership(), loadSample().catch(() => null), loadLiveEvidence().catch(() => ({}))])
  .then(([r, s, l]) => {
    readership = r;
    sample = s;
    live = l;
    describeCoverage();
    render();
  })
  .catch(() => { status.textContent = "Sample data could not be read."; });
