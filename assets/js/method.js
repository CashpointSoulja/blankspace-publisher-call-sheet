// /method/: sample facts, queries, classifications and crawler lists, read from data/.

import { el, clear, loadJSON, fmtNumber, fmtDate, fmtPct, VERTICALS, CLASS_LABELS } from "./common.js";
import { loadSample, loadDomains } from "./sample-data.js";

const val = (v, f = (x) => x) => (v === null || v === undefined || (Array.isArray(v) && !v.length) ? "Not recorded" : f(v));

async function sampleFacts() {
  const [s, q] = await Promise.all([loadSample().catch(() => null), loadJSON("/data/queries.json").catch(() => null)]);
  const box = document.getElementById("sample-facts");
  clear(box);
  const rows = [
    ["Sample id", val(s && s.sample_id)],
    ["Date (UTC)", val(s && s.dates_utc, (d) => d.map(fmtDate).join(", "))],
    ["Engine", val(s && s.engines, (e) => e.join(", "))],
    ["Runs per query", val(s && s.runs_per_query, fmtNumber)],
    ["Queries", val(s && s.queries, fmtNumber)],
    ["Probes (query × engine × run)", val(s && s.probes, fmtNumber)],
    ["Citations captured", val(s && s.total_citations, fmtNumber)],
    ["Distinct domains cited", val(s && s.unique_domains, fmtNumber)],
    ["Publishers among them", val(s && s.publishers_cited, fmtNumber)],
    ["Collection cost", val(s && s.collection_cost_usd, (c) => `US$${c.toFixed(2)}`)]
  ];
  box.append(el("table", { class: "data-table lg" },
    el("caption", { class: "visually-hidden" }, "Sample conditions"),
    el("tbody", {}, rows.map(([k, v]) => el("tr", {}, el("th", { scope: "row" }, k), el("td", { class: "strong" }, v))))));
  if (s && s.condition) {
    box.append(el("div", { class: "inner-body small" }, el("span", { class: "micro" }, "Conditions, as recorded"), el("p", { style: "margin:.375rem 0 0" }, s.condition)));
  }

  const def = document.getElementById("signal-definition");
  if (def && s && s.signal_definition) {
    clear(def);
    def.append(el("strong", {}, "What citation share is, as recorded. "), s.signal_definition);
  }

  const buckets = document.getElementById("class-shares");
  if (buckets && s && Array.isArray(s.citation_buckets)) {
    clear(buckets);
    for (const b of s.citation_buckets) {
      buckets.append(el("li", { class: b.class === "publisher" ? "hi" : "" },
        el("div", { class: "bar-meta" }, el("span", {}, CLASS_LABELS[b.class] || b.class), el("span", {}, `${fmtPct(b.share, 1)} · ${fmtNumber(b.count)}`)),
        el("div", { class: "bar-track" }, el("div", { class: "bar-fill", style: `width:${b.share * 100}%` }))));
    }
  }

  const list = document.getElementById("queries");
  clear(list);
  if (!Array.isArray(q) || !q.length) {
    list.append(el("p", { class: "notice" }, "The query list could not be read."));
    return;
  }
  for (const v of Object.keys(VERTICALS)) {
    const items = q.filter((x) => x.vertical === v);
    if (!items.length) continue;
    list.append(el("details", { class: "faq" },
      el("summary", {}, `${VERTICALS[v]} · ${items.length} queries`),
      el("ul", { class: "facts faq-body" }, items.map((x) => el("li", { class: "fact" }, el("span", { class: "fact-text" }, x.q), el("code", { class: "ptr" }, x.id))))));
  }
}

async function classifications() {
  const d = await loadDomains().catch(() => ({}));
  const box = document.getElementById("domains");
  clear(box);
  const entries = Object.entries(d).sort((a, b) => b[1].citations - a[1].citations || a[0].localeCompare(b[0]));
  if (!entries.length) {
    box.append(el("p", { class: "notice" }, "The classification file could not be read."));
    return;
  }
  const tbody = el("tbody");
  const filters = el("div", { class: "filters", role: "group", "aria-label": "Filter by class" });
  const draw = (cls) => {
    clear(tbody);
    for (const [domain, x] of entries.filter(([, x]) => cls === "all" || x.class === cls)) {
      tbody.append(el("tr", {},
        el("td", { class: "strong" }, domain),
        el("td", {}, CLASS_LABELS[x.class] || x.class),
        el("td", { class: "num right" }, fmtNumber(x.citations)),
        el("td", {}, x.rationale)));
    }
  };
  for (const cls of ["all", ...Object.keys(CLASS_LABELS)]) {
    const n = cls === "all" ? entries.length : entries.filter(([, x]) => x.class === cls).length;
    const b = el("button", { class: "filter", type: "button", "aria-pressed": String(cls === "all") }, `${cls === "all" ? "All" : CLASS_LABELS[cls]} · ${n}`);
    b.addEventListener("click", () => {
      filters.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      draw(cls);
    });
    filters.append(b);
  }
  draw("all");
  box.append(filters, el("div", { class: "inner", style: "margin-top:1rem" }, el("div", { class: "table-scroll scroll-y" }, el("table", { class: "data-table" },
    el("caption", { class: "visually-hidden" }, "Domain classification"),
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Domain"), el("th", { scope: "col" }, "Class"), el("th", { scope: "col", class: "right" }, "Citations"), el("th", { scope: "col" }, "Why"))),
    tbody))));
}

const GROUPS = { training: "Training", search_user_triggered: "Search / user-triggered", ads: "Ads validation (reported, not grouped)" };

async function agents() {
  const a = await loadJSON("/data/agents.json").catch(() => null);
  const box = document.getElementById("agents");
  clear(box);
  if (!a) return;
  box.append(el("div", { class: "table-scroll" }, el("table", { class: "data-table lg" },
    el("caption", { class: "visually-hidden" }, "AI agents evaluated against robots.txt"),
    el("thead", {}, el("tr", {}, ["Token", "Group", "Operator", "Status", "Source"].map((h) => el("th", { scope: "col" }, h)))),
    el("tbody", {}, a.agents.map((x) => el("tr", {},
      el("td", { class: "strong" }, el("code", { class: "inline" }, x.token)),
      el("td", {}, GROUPS[x.group] || x.group),
      el("td", {}, x.vendor),
      el("td", {}, x.verified ? `Verified ${fmtDate(x.date_checked)}` : `Unverified, ${fmtDate(x.date_checked)}`, x.note ? el("div", { class: "muted" }, x.note) : null),
      el("td", {},
        x.doc_url ? el("a", { href: x.doc_url, rel: "noopener", target: "_blank" }, "Vendor page") : "No vendor page",
        x.corroboration_url ? [el("br"), el("a", { href: x.corroboration_url, rel: "noopener", target: "_blank" }, "Corroboration")] : null)))))));
}

// Where the full-marks cap bites, and how thin the long tail is, from readership.json.
async function scaleFacts() {
  const r = await loadJSON("/data/readership.json").catch(() => null);
  const box = document.getElementById("scale-facts");
  if (!box || !Array.isArray(r) || !r.length) return;
  const capped = r.filter((x) => x.s_citation_share >= 1);
  const thin = r.filter((x) => x.probes_cited_in_vertical <= 2);
  const byVertical = Object.keys(VERTICALS).map((v) => `${capped.filter((x) => x.vertical === v).length} in ${VERTICALS[v].toLowerCase()}`).join(", ");
  clear(box);
  box.append(`In this sample ${capped.length} of ${r.length} publishers reach the cap (${byVertical}). Below it the scale is linear. ${thin.length} publishers were cited in only one or two of their vertical’s probes, which a re-run could easily change, so small differences in the tail mean little.`);
}

Promise.all([sampleFacts(), classifications(), agents(), scaleFacts()]).catch(() => { /* each section keeps its notice */ });
