// /p/{domain}/: evidence page for an in-sample publisher.
// Loads data/evidence/{domain}.json, plus the draft and verifier log when they exist.

import { el, clear, loadJSON, fmtNumber, fmtDate, fmtDateTime, VERTICALS } from "./common.js";
import { renderEvidence, resolvePointer } from "./evidence-view.js";
import { loadSampleSet, loadQualification, loadCitations, sampleDate, rankReadership, buildEvidence } from "./sample-data.js";

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;
const REASONS = {
  no_matching_evidence: "No matching evidence",
  value_mismatch: "Value did not match the evidence",
  unmarked_factual_sentence: "Factual sentence with no claim marker",
  company_claim_misphrased: "Company claim not in its required wording"
};

const root = document.getElementById("evidence");
const title = document.getElementById("page-title");
const sub = document.getElementById("page-sub");

function domainFromLocation() {
  const fromPath = location.pathname.match(/^\/p\/([^/]+)\/?$/);
  const raw = fromPath && fromPath[1] !== "index.html" ? decodeURIComponent(fromPath[1]) : new URLSearchParams(location.search).get("d");
  const d = (raw || "").toLowerCase().trim();
  return DOMAIN_RE.test(d) ? d : null;
}

function notice(...children) {
  clear(root);
  root.append(el("div", { class: "notice" }, ...children));
}

async function main() {
  const domain = domainFromLocation();
  if (!domain) {
    title.textContent = "Evidence";
    sub.textContent = "Pick a publisher from the call sheet to see its evidence.";
    notice(el("a", { href: "/targets/" }, "Open the call sheet"));
    return;
  }
  document.title = `${domain} | Evidence | Publisher call sheet`;
  title.textContent = domain;

  const [set, qualification, liveFile, draft, verifier, claims] = await Promise.all([
    loadSampleSet(),
    loadQualification(),
    loadJSON(`/data/evidence/${domain}.json`).catch(() => null),
    loadJSON(`/data/drafts/${domain}.json`).catch(() => null),
    loadJSON(`/data/verifier/${domain}.json`).catch(() => null),
    loadJSON("/data/company-claims.json").catch(() => [])
  ]);

  const { sample, readership, domains } = set;
  const account = qualification ? qualification.accounts.find((a) => a.domains.includes(domain)) : null;
  const ranked = rankReadership(readership);
  const row = ranked.find((r) => r.domain === domain);

  // Reclassified after review: show the dated correction with its sources, not a ranking.
  const fix = domains[domain] && domains[domain].corrected;
  if (fix) {
    sub.textContent = `Reclassified from ${fix.from} to ${fix.to} after review, so it isn’t ranked. ${fix.rationale}.`;
    clear(root);
    root.append(el("section", { class: "inner" },
      el("div", { class: "inner-head" }, el("span", {}, "Dated correction"), el("span", { class: "tag tag-neutral tag-sm" }, "Excluded")),
      el("div", { class: "inner-body" },
        el("p", { class: "small" }, fix.reason),
        el("ul", { class: "facts" }, fix.sources.map((x) => el("li", { class: "fact" },
          el("span", { class: "fact-text" }, x.finding),
          el("span", { class: "fact-value small" }, el("a", { href: x.url, rel: "noopener", target: "_blank" }, "Source")),
          el("span", { class: "ptr" }, `Read ${fmtDate(x.accessed)}`)))),
        el("p", { class: "small muted" }, "The collected sample and its citations are unchanged. ",
          liveFile ? [el("a", { href: `/data/evidence/${encodeURIComponent(domain)}.json` }, "The stored live check"), " is kept as collected. "] : null,
          el("a", { href: "/method/#corrections" }, "All corrections")))));
    return;
  }

  if (!row && !liveFile) {
    const cls = domains[domain];
    sub.textContent = cls
      ? `Cited in the sample, but classified as ${cls.class}, so it isn’t ranked. ${cls.rationale}.`
      : "This domain was not cited in the dated sample.";
    notice(
      el("strong", {}, `No call-sheet entry for ${domain}.`), " ",
      "Only publishers cited in the dated sample have an evidence page. ",
      el("a", { href: `/check/?url=${encodeURIComponent(domain)}` }, "Run a live check instead"), ".");
    return;
  }

  // A stored live check (data/evidence/{domain}.json) adds the live signals; citation share
  // always comes from readership.json, and the score is recomputed over everything known.
  const ev = row ? buildEvidence(row, sample, liveFile) : liveFile;

  const cls = domains[domain];
  sub.textContent = [
    row ? `Citation-share rank ${row.rank} of ${ranked.length}.` : null,
    ev.vertical ? `${VERTICALS[ev.vertical] || ev.vertical}.` : null,
    cls ? `Classified as a publisher: ${cls.rationale}.` : null,
    "Every line below points to the field it was read from."
  ].filter(Boolean).join(" ");
  clear(root);
  if (account) root.append(qualificationNote(account));
  root.append(renderEvidence(ev, { sampleDate: sampleDate(sample) }));

  if (row) root.append(await renderCitations(domain, row, cls));
  root.append(renderDraft(domain, ev, draft, verifier, claims || [], account));
}

async function renderCitations(domain, row, cls) {
  const ids = new Set(row.probe_ids);
  const all = await loadCitations().catch(() => []);
  const rows = all.filter((c) => ids.has(c.probe_id) && c.cited_domain === domain);
  const totals = cls ? `${fmtNumber(cls.citations)} citations in ${fmtNumber(cls.probes_cited)} probes across the whole sample` : null;
  return el("section", { class: "inner", "aria-labelledby": "cite-h" },
    el("div", { class: "inner-head" }, el("span", { id: "cite-h" }, `Citation rows · ${rows.length}`), el("span", { class: "tag tag-neutral tag-sm" }, "Dated sample")),
    el("div", { class: "inner-body small muted" },
      `Every answer in the sample that cited it, in any vertical, from citation-sample.csv. Its citation share counts only the ${row.probes_cited_in_vertical} in ${VERTICALS[row.vertical] || row.vertical}.${totals ? ` ${totals}.` : ""}`),
    rows.length
      ? el("div", { class: "table-scroll" }, el("table", { class: "data-table" },
          el("caption", { class: "visually-hidden" }, `Citations of ${domain} in the sample`),
          el("thead", {}, el("tr", {}, ["Probe", "Engine", "Run", "Query", "Position", "Cited URL"].map((h) => el("th", { scope: "col" }, h)))),
          el("tbody", {}, rows.map((row) => el("tr", {},
            el("td", {}, row.probe_id),
            el("td", {}, row.engine),
            el("td", { class: "num" }, row.run),
            el("td", { class: "strong" }, row.query),
            el("td", { class: "num" }, row.citation_rank),
            el("td", {}, el("a", { href: row.cited_url, rel: "noopener", target: "_blank" }, row.cited_url)))))))
      : el("div", { class: "inner-body small muted" }, "The probe ids are listed in the evidence file, but no matching rows were found in citation-sample.csv."),
    el("div", { class: "inner-body" }, el("a", { href: "/data/citation-sample.csv", download: "" }, "Download the full sample (CSV)")));
}

const DECISION_LABELS = { ready_for_discovery: "Ready for discovery", hold: "Hold", exclude: "Excluded" };

// Manual commercial qualification, kept apart from the automated evidence below.
function qualificationNote(a) {
  return el("section", { class: "inner" },
    el("div", { class: "inner-head" }, el("span", {}, `First wave · ${a.account}`),
      el("span", { class: a.decision === "ready_for_discovery" ? "tag tag-sm" : "tag tag-neutral tag-sm" }, DECISION_LABELS[a.decision])),
    el("div", { class: "inner-body" },
      el("p", { class: "small" }, a.decision_reason, " ",
        el("a", { href: `/first-wave/#${encodeURIComponent(a.domains[0])}` }, "Sources, gates and the next question"))));
}

function renderDraft(domain, ev, draft, verifier, claims, account) {
  const wrap = el("section", { class: "panel", "aria-labelledby": "draft-h" },
    el("span", { class: "eyebrow" }, "Outreach draft"),
    el("h2", { id: "draft-h", style: "font-size:1.75rem; margin-bottom:1rem" }, "The message I’d send"),
    el("p", { class: "sub" }, "Text only. Nothing in this codebase can send email or any other message. Addressed to a role, never a named person."));

  if (!draft) {
    wrap.append(el("p", { class: "notice", style: "margin-top:1.5rem" }, account && account.decision !== "ready_for_discovery"
      ? `No draft. ${account.account} is on ${account.decision === "hold" ? "hold" : "the excluded list"}: ${account.decision_reason}`
      : `No draft for ${domain}. Drafts are written only for accounts ready for discovery.`));
    return wrap;
  }

  // A company claim with no recorded source is never shown (SPEC §10.8).
  const byId = Object.fromEntries(claims.map((c) => [c.id, c]));
  const unsourced = (draft.claims || []).filter((c) => c.type === "company_claim").filter((c) => {
    const id = String(c.ref).replace(/^company-claims#/, "");
    return !byId[id] || !byId[id].source_url;
  });
  if (unsourced.length) {
    wrap.append(el("p", { class: "notice", style: "margin-top:1.5rem" }, "This draft cites a company claim with no recorded source, so it is withheld until data/company-claims.json has one."));
    return wrap;
  }

  const tagged = new Set(verifier ? verifier.tagged_company_claims : []);
  const body = el("div", { class: "draft-body" });
  for (const para of String(draft.body).split(/\n{2,}/)) {
    const p = el("p");
    const parts = para.split(/(\[\^c\d+\])/);
    for (const part of parts) {
      const m = /^\[\^(c\d+)\]$/.exec(part);
      if (m) p.append(el("sup", {}, el("a", { href: `#claim-${m[1]}` }, m[1])));
      else p.append(part);
    }
    body.append(p);
  }

  const claimItems = (draft.claims || []).map((c) => {
    let source = null;
    if (c.type === "company_claim") {
      const cc = byId[String(c.ref).replace(/^company-claims#/, "")];
      source = cc ? el("a", { href: cc.source_url, rel: "noopener", target: "_blank" }, "Source") : null;
    } else {
      const v = resolvePointer(ev, c.ref);
      source = el("span", {}, "Evidence value: ", el("code", { class: "inline" }, v === undefined ? "missing" : JSON.stringify(v)));
    }
    return el("li", { id: `claim-${c.id}` },
      el("strong", { style: "color:var(--text)" }, c.id), " ",
      c.type === "company_claim" || tagged.has(c.id) ? el("span", { class: "tag tag-sm" }, "Company claim") : null, " ",
      c.text, el("br"),
      el("code", { class: "ptr" }, c.ref), " · ", source);
  });

  wrap.append(
    el("div", { class: "grid-2", style: "margin-top:2rem" },
      el("div", {},
        el("p", { class: "micro" }, `To: ${draft.recipient_role}`),
        el("p", { style: "color:var(--heading); font-weight:700; margin:.5rem 0 1rem" }, draft.subject),
        body),
      el("div", { class: "inner" },
        el("div", { class: "inner-head" }, el("span", {}, "Claims"), el("span", {}, String((draft.claims || []).length))),
        el("ul", { class: "claim-list inner-body" }, claimItems))));

  wrap.append(renderVerifier(verifier));
  return wrap;
}

function renderVerifier(v) {
  if (!v) return el("p", { class: "notice", style: "margin-top:1.5rem" }, "No verifier log for this draft.");
  return el("div", { class: "inner", style: "margin-top:2rem" },
    el("div", { class: "inner-head" }, el("span", {}, `Verifier log · ${v.run_id}`), el("span", {}, fmtDateTime(v.ran_at) || "")),
    el("div", { class: "inner-body" },
      el("p", { class: "small muted" }, `${v.claims_in} claims in. ${v.kept.length} kept. ${v.tagged_company_claims.length} tagged as company claims. ${v.removed.length} removed, shown verbatim below.`),
      v.removed.length
        ? v.removed.map((r) => el("div", { class: "log-row" },
            el("span", { class: "tag tag-neutral tag-sm" }, "Removed"),
            el("q", {}, r.text),
            el("span", { class: "why" }, REASONS[r.reason] || r.reason)))
        : el("p", { class: "small muted" }, "Nothing was removed.")));
}

main().catch(() => notice("The evidence could not be read."));
