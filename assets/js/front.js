// Front page: fills slots from data/sample.json, data/readership.json and data/front.json.
// Unknown values stay as visible empty slots.

import { el, clear, loadJSON, fmtNumber, fmtDate, fmtPct, VERTICALS, CLASS_LABELS, initTabs } from "./common.js";
import { loadSample, loadReadership, loadLiveEvidence, sampleDate, buildCallSheet } from "./sample-data.js";

const REASONS = {
  no_matching_evidence: "No matching evidence",
  value_mismatch: "Value did not match the evidence",
  unmarked_factual_sentence: "Factual sentence with no claim marker",
  company_claim_misphrased: "Company claim not in its required wording"
};

// "perplexity/sonar (live web search, …)" → "Sonar"
function shortEngine(engine) {
  if (!engine) return null;
  const name = String(engine).split(" (")[0].split("/").pop();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const get = (obj, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), obj);

function format(value, kind) {
  if (value === null || value === undefined || value === "") return null;
  if (kind === "number") return fmtNumber(value);
  if (kind === "date") return fmtDate(value);
  return String(value);
}

initTabs();

const tbody = document.getElementById("preview-rows");
const status = document.getElementById("preview-status");
let previewRows = [];

function renderPreview(vertical) {
  clear(tbody);
  const rows = previewRows
    .filter((r) => vertical === "all" || r.vertical === vertical)
    .sort((a, b) => a.position - b.position)
    .slice(0, 5);
  if (!rows.length) {
    tbody.append(el("tr", { class: "empty-row" }, el("td", { colspan: "5" },
      previewRows.length ? "No publishers from this vertical in the sample." : "No sample rows found.")));
    return;
  }
  for (const x of rows) {
    const { row: r, scored } = x;
    tbody.append(el("tr", {},
      el("td", { class: "num" }, String(x.position)),
      el("td", {}, el("a", { class: "domain-link", href: `/p/${encodeURIComponent(r.domain)}/` }, r.domain)),
      el("td", { class: "hide-sm" }, VERTICALS[r.vertical] || r.vertical),
      el("td", { class: "num" }, fmtPct(r.share, 1)),
      el("td", { class: "score-cell hide-sm" }, el("strong", {}, String(Math.round(scored.total))), el("span", {}, ` / ${Math.round(scored.max)}`))));
  }
}

document.querySelectorAll("[data-vertical]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-vertical]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    renderPreview(btn.dataset.vertical);
  });
});

function renderBuckets(buckets) {
  const list = document.getElementById("buckets");
  if (!Array.isArray(buckets) || !buckets.length) return;
  clear(list);
  for (const cls of Object.keys(CLASS_LABELS)) {
    const b = buckets.find((x) => x.class === cls);
    const share = b && typeof b.share === "number" ? Math.max(0, Math.min(1, b.share)) : null;
    list.append(el("li", { class: cls === "publisher" ? "hi" : "" },
      el("div", { class: "bar-meta" }, el("span", {}, CLASS_LABELS[cls]), el("span", {}, share === null ? "Unknown" : `${Math.round(share * 100)}%`)),
      el("div", { class: "bar-track" }, el("div", { class: "bar-fill", style: `width:${share === null ? 0 : share * 100}%` }))));
  }
}

function fill(data) {
  // data merges sample.json (sample figures) and front.json (builder, verifier example).
  document.querySelectorAll("[data-slot]").forEach((node) => {
    const v = format(get(data, node.dataset.slot), node.dataset.format);
    if (v !== null) { node.textContent = v; node.classList.remove("is-empty"); }
  });
  document.querySelectorAll("[data-href-slot]").forEach((node) => {
    const href = get(data, node.dataset.hrefSlot);
    if (typeof href === "string" && /^https:\/\//.test(href)) { node.setAttribute("href", href); node.hidden = false; }
  });

  // The numeric headline only appears once both numbers exist.
  if (typeof data.publishers_cited === "number" && typeof data.queries === "number") {
    document.getElementById("hero-title-empty").hidden = true;
    document.getElementById("hero-title-data").hidden = false;
  }

  previewRows = data.ranked || [];
  renderPreview("all");
  status.textContent = previewRows.length ? "Top five from the call sheet. Positions are across all verticals." : "No sample rows found.";
  renderBuckets(data.citation_buckets);

  const v = data.verifier_example;
  if (v && v.removed_text) {
    const log = document.getElementById("verifier-example");
    clear(log);
    log.append(
      el("span", { class: "micro" }, `Verifier log, ${v.domain}`),
      el("div", { class: "log-row" },
        el("span", { class: "tag tag-neutral tag-sm" }, "Removed"),
        el("q", {}, v.removed_text),
        el("span", { class: "why" }, REASONS[v.reason] || v.reason)));
  }
}

document.querySelectorAll("[data-slot]").forEach((n) => n.classList.add("is-empty"));
renderPreview("all");

Promise.all([loadSample(), loadReadership(), loadJSON("/data/front.json").catch(() => null), loadLiveEvidence().catch(() => ({}))])
  .then(([sample, readership, front, live]) => {
    const sheet = buildCallSheet(readership, live, undefined, sample);
    if (!sample) { status.textContent = "Sample data not found at /data/sample.json."; return; }
    fill({
      ...(front || {}),
      ...sample,
      sample_date: sampleDate(sample),
      // Short engine name for the hero; the full engine and gateway string is on /method/.
      engine_short: shortEngine(sample.engines[0]),
      ranked: [...sheet.checked, ...sheet.unchecked]
    });
  })
  .catch(() => { status.textContent = "Sample data could not be read."; });
