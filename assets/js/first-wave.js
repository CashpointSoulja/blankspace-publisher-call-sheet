// /first-wave/: the manual commercial qualification (data/qualification.json), separate from the
// automated score. Each account shows what was verified, with source and date, what is still a
// question, and the gates before anything could go live. Ready for discovery means worth a first
// conversation, not a qualified lead.

import { el, clear, fmtDate, VERTICALS } from "./common.js";
import { STANCES, stanceFrom } from "./score.js";
import { loadSampleSet, loadQualification, loadLiveEvidence } from "./sample-data.js";

const DECISIONS = {
  ready_for_discovery: { label: "Ready for discovery", tag: "tag" },
  hold: { label: "Hold", tag: "tag tag-neutral" },
  exclude: { label: "Excluded", tag: "tag tag-neutral" }
};
const GATES = {
  commercial_route: "Commercial route",
  editorial_policy: "Editorial policy allows agent-facing placements",
  seo_signoff: "SEO sign-off",
  edge_deployment: "Edge deployment",
  pilot_terms: "Pilot terms and pick-up method"
};
const STATUS = { passed: "Verified", open: "Open question", failed: "Failed" };

const root = document.getElementById("wave");

function sourceList(items) {
  return el("ul", { class: "facts" }, items.map((v) => el("li", { class: "fact" },
    el("span", { class: "fact-text" }, v.finding),
    el("span", { class: "fact-value small" }, el("a", { href: v.source_url, rel: "noopener", target: "_blank" }, "Source")),
    el("span", { class: "ptr" }, `Read ${fmtDate(v.accessed)}`))));
}

// Facts already held for a domain: citation counts and the declared robots.txt policy.
function sampleLine(domain, set, live) {
  const row = set.readership.find((r) => r.domain === domain);
  const parts = [];
  if (row) parts.push(`${domain}: cited in ${row.probes_cited_in_vertical} of ${row.vertical_probes_total} ${VERTICALS[row.vertical].toLowerCase()} answers in the dated sample`);
  else if (set.domains[domain]) parts.push(`${domain}: not ranked (${set.domains[domain].class})`);
  const ev = live[domain];
  if (ev && ev.signals && ev.signals.reachability) parts.push(`robots.txt: ${STANCES[stanceFrom(ev.signals.reachability)].label}`);
  return parts.join(". ") + ".";
}

// Card order answers four questions in turn: why this decision, what to ask and whom, what still
// blocks activation, and the sources behind it. A hold shows what would lift it straight after the reason.
function card(a, set, live) {
  const d = DECISIONS[a.decision];
  const active = a.decision !== "exclude";
  return el("article", { class: "card wave-card", id: a.domains[0] },
    el("div", { class: "wave-head" },
      el("h3", {}, a.account),
      el("span", { class: d.tag }, d.label)),
    el("p", { class: "wave-reason" }, a.decision_reason),
    active && a.release_condition ? [el("h4", { class: "micro wave-sub" }, "What would lift the hold"), el("p", { class: "small" }, a.release_condition)] : null,
    el("p", { class: "small muted" }, a.domains.map((dom, i) => [i ? " " : null, sampleLine(dom, set, live), " ",
      el("a", { href: `/p/${encodeURIComponent(dom)}/` }, "Evidence")])),
    active ? [
      a.next_question ? [el("h4", { class: "micro wave-sub" }, "Next question"), el("p", { class: "wave-question" }, a.next_question)] : null,
      el("h4", { class: "micro wave-sub" }, "Who to ask"),
      el("p", { class: "small" }, a.owner_role),
      a.gates.length ? [
        el("h4", { class: "micro wave-sub" }, "Gates before activation"),
        el("ul", { class: "facts" }, a.gates.map((g) => el("li", { class: "fact" },
          el("span", { class: "fact-text" }, GATES[g.gate], el("br"), el("span", { class: "muted small" }, g.note)),
          el("span", { class: `fact-value${g.status === "open" ? " unknown" : ""}` }, STATUS[g.status]))))
      ] : null
    ] : null,
    el("h4", { class: "micro wave-sub" }, "Verified from current sources"),
    sourceList(a.verified),
    active && a.success_criteria_30d.length ? [
      el("h4", { class: "micro wave-sub" }, "30-day success criteria, to agree, not results"),
      el("ul", { class: "wave-list" }, a.success_criteria_30d.map((c) => el("li", {}, c)))
    ] : null);
}

async function main() {
  const [q, set, live] = await Promise.all([loadQualification(), loadSampleSet(), loadLiveEvidence().catch(() => ({}))]);
  clear(root);
  if (!q) { root.append(el("p", { class: "notice" }, "The qualification file could not be read.")); return; }
  const by = (k) => q.accounts.filter((a) => a.decision === k);
  const counts = document.getElementById("wave-counts");
  if (counts) counts.textContent = `Reviewed ${fmtDate(q.reviewed_at)}: ${by("ready_for_discovery").length} ready for discovery, ${by("hold").length} on hold, ${by("exclude").length} excluded.`;

  const path = q.company_path;
  root.append(el("div", { class: "callout" },
    el("strong", {}, "The company-published path. "), path.finding, " ",
    el("a", { href: path.source_url, rel: "noopener", target: "_blank" }, "Playbook"),
    el("span", { class: "muted small" }, `, published ${fmtDate(path.published)}, read ${fmtDate(path.accessed)}. ${path.note}`)));

  for (const [key, title, sub] of [
    ["ready_for_discovery", "Ready for discovery", "Worth a first conversation, not a qualified lead. A commercial route is verified; the remaining gates are open questions."],
    ["hold", "On hold", "Something found in a current source blocks a first conversation, or no commercial route was found."],
    ["exclude", "Excluded", "Not a publisher on current evidence."]
  ]) {
    const list = by(key);
    if (!list.length) continue;
    root.append(el("section", { class: "wave-group", "aria-label": title },
      el("h2", { class: "wave-title" }, `${title} · ${list.length}`),
      el("p", { class: "sub" }, sub),
      el("div", { class: "grid-2 wave-grid" }, list.map((a) => card(a, set, live)))));
  }
}

main().catch(() => { clear(root); root.append(el("p", { class: "notice" }, "The first wave could not be read.")); });
