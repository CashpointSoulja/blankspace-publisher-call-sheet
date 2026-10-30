// Readers for the dated citation sample: sample.json, readership.json, domains.json and
// citation-sample.csv. Pages read these files directly, so each figure exists in one place.

import { loadJSON, loadText, parseCSV } from "./common.js";
import { CANNOT_SEE, partsFromEvidence, score, missedPoints } from "./score.js";

export const sampleDate = (sample) => (sample && Array.isArray(sample.dates_utc) && sample.dates_utc[0]) || null;

export const loadSample = () => loadJSON("/data/sample.json");
export const loadReadership = () => loadJSON("/data/readership.json").then((r) => (Array.isArray(r) ? r : []));
export const loadDomains = () => loadJSON("/data/domains.json").then((d) => d || {});
export const loadCitations = () => loadText("/data/citation-sample.csv").then((t) => (t ? parseCSV(t) : []));

// Global rank: citation sub-score, then raw share, then name. Only citation share was collected
// for the sample, so this is the default order (SPEC §3).
export function rankReadership(rows) {
  return rows
    .slice()
    .sort((a, b) => b.s_citation_share - a.s_citation_share || b.share - a.share || a.domain.localeCompare(b.domain))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// The readership row as a SPEC §8.4 signal.
export function readershipSignal(row, sample) {
  return {
    status: "in_sample",
    sample_id: sample ? sample.sample_id : null,
    probes_total: row.vertical_probes_total,
    probes_cited: row.probes_cited_in_vertical,
    share: row.share,
    stability: row.stability,
    probe_ids: row.probe_ids
  };
}

// Evidence for an in-sample publisher before any live check: citation share only.
// Live signals are absent, which every page shows as "not collected".
export function evidenceFromSample(row, sample) {
  const signals = { readership: readershipSignal(row, sample) };
  const scored = score(partsFromEvidence(signals));
  const date = sampleDate(sample);
  return {
    domain: row.domain,
    vertical: row.vertical,
    source: "sample",
    checked_at: date ? `${date}T00:00:00Z` : null,
    signals,
    score: { ...scored, missed: missedPoints(signals) },
    stance: { code: "unknown", angle_label: null },
    cannot_see: CANNOT_SEE.slice()
  };
}
