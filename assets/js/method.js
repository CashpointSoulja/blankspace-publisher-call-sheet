// /method/: sample facts, queries, classifications and crawler lists, read from data/.

import { el, clear, loadJSON, fmtNumber, fmtDate, VERTICALS, CLASS_LABELS } from "./common.js";

const val = (v, f = (x) => x) => (v === null || v === undefined || (Array.isArray(v) && !v.length) ? "Not yet recorded" : f(v));

async function sampleFacts() {
  const front = await loadJSON("/data/front.json").catch(() => null);
  const q = await loadJSON("/data/queries.json").catch(() => null);
  const box = document.getElementById("sample-facts");
  clear(box);
  const rows = [
    ["Sample id", val(front && front.sample_id)],
    ["Date (UTC)", val(front && front.sample_date, fmtDate)],
    ["Engines", val(front && front.engines, (e) => e.join(", "))],
    ["Runs per query", val(front && front.runs_per_query, fmtNumber)],
    ["Queries", val(front && front.queries, fmtNumber)],
    ["Probes (query × engine × run)", val(front && front.probes, fmtNumber)],
    ["Location", val(q && q.location)],
    ["Logged in", q ? (q.logged_in ? "Yes" : "No") : "Not yet recorded"]
  ];
  box.append(el("table", { class: "data-table lg" },
    el("caption", { class: "visually-hidden" }, "Sample conditions"),
    el("tbody", {}, rows.map(([k, v]) => el("tr", {}, el("th", { scope: "row" }, k), el("td", { class: "strong" }, v))))));

  const list = document.getElementById("queries");
  clear(list);
  if (!q || !q.queries.length) {
    list.append(el("p", { class: "notice" }, "The query list is published here once the sample is run."));
  } else {
    for (const v of Object.keys(VERTICALS)) {
      const items = q.queries.filter((x) => x.vertical === v);
      if (!items.length) continue;
      list.append(el("h3", { style: "margin:1.5rem 0 .5rem" }, VERTICALS[v]),
        el("ul", { class: "facts" }, items.map((x) => el("li", { class: "fact" }, el("span", { class: "fact-text" }, x.text), el("code", { class: "ptr" }, x.id)))));
    }
  }
  if (q && q.engines && q.engines.length) {
    list.append(el("p", { class: "small muted" }, "Engines as shown on the day: ",
      q.engines.map((e) => `${e.engine}${e.model ? ` (${e.model})` : ""}${e.checked ? `, checked ${fmtDate(e.checked)}` : ""}`).join("; "), "."));
  }
}

async function classifications() {
  const d = await loadJSON("/data/domains.json").catch(() => null);
  const box = document.getElementById("domains");
  clear(box);
  if (!d || !d.domains.length) {
    box.append(el("p", { class: "notice" }, "Every cited domain and its class will be listed here, with one line of rationale each."));
    return;
  }
  box.append(el("div", { class: "table-scroll" }, el("table", { class: "data-table lg" },
    el("caption", { class: "visually-hidden" }, "Domain classification"),
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Domain"), el("th", { scope: "col" }, "Class"), el("th", { scope: "col" }, "Why"))),
    el("tbody", {}, d.domains.map((x) => el("tr", {},
      el("td", { class: "strong" }, x.domain),
      el("td", {}, CLASS_LABELS[x.class] || x.class),
      el("td", {}, x.rationale)))))));
}

async function agents() {
  const a = await loadJSON("/data/agents.json").catch(() => null);
  const box = document.getElementById("agents");
  clear(box);
  if (!a) return;
  box.append(el("div", { class: "table-scroll" }, el("table", { class: "data-table lg" },
    el("caption", { class: "visually-hidden" }, "AI agents evaluated against robots.txt"),
    el("thead", {}, el("tr", {}, ["Token", "Group", "Operator", "Documentation", "Checked"].map((h) => el("th", { scope: "col" }, h)))),
    el("tbody", {}, a.agents.map((x) => el("tr", {},
      el("td", { class: "strong" }, el("code", { class: "inline" }, x.token)),
      el("td", {}, x.group === "search" ? "Search / user-triggered" : "Training"),
      el("td", {}, x.vendor),
      el("td", {}, x.doc_url ? el("a", { href: x.doc_url, rel: "noopener", target: "_blank" }, "Vendor page") : "None found"),
      el("td", {}, x.checked ? fmtDate(x.checked) : "Not yet confirmed")))))));
}

Promise.all([sampleFacts(), classifications(), agents()]).catch(() => { /* each section keeps its notice */ });
