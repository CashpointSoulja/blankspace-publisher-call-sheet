// Loaders for the dated citation sample and stored live checks. Pages read the collected files
// directly, so each figure exists in one place. Pure logic lives in evidence-model.js.

import { loadJSON, loadText, parseCSV } from "./common.js";

import { applyCorrections } from "./evidence-model.js";

export { sampleDate, readershipSignal, buildEvidence, evidenceFromSample, buildCallSheet, applyCorrections } from "./evidence-model.js";

export const loadSample = () => loadJSON("/data/sample.json");
export const loadReadership = () => loadJSON("/data/readership.json").then((r) => (Array.isArray(r) ? r : []));
export const loadDomains = () => loadJSON("/data/domains.json").then((d) => d || {});
export const loadCorrections = () => loadJSON("/data/corrections.json").catch(() => null);
export const loadQualification = () => loadJSON("/data/qualification.json").catch(() => null);

// The collected sample with dated corrections applied. `sample.original` keeps the figures as
// collected; `removed` lists domains no longer ranked as publishers.
export async function loadSampleSet() {
  const [sample, readership, domains, corrections] = await Promise.all([
    loadSample().catch(() => null), loadReadership().catch(() => []), loadDomains().catch(() => ({})), loadCorrections()
  ]);
  return applyCorrections({ sample, readership, domains }, corrections);
}

export const loadCitations = () => loadText("/data/citation-sample.csv").then((t) => (t ? parseCSV(t) : []));

// Stored live checks. data/evidence-index.json lists them, because a static host can't list a
// directory. A file that fails to load counts as unchecked.
export const loadEvidenceIndex = () => loadJSON("/data/evidence-index.json").catch(() => null);

export async function loadLiveEvidence(index) {
  index = index === undefined ? await loadEvidenceIndex() : index;
  if (!index || !Array.isArray(index.domains)) return {};
  const entries = await Promise.all(index.domains.map(async (domain) => {
    const ev = await loadJSON(`/data/evidence/${encodeURIComponent(domain)}.json`).catch(() => null);
    return ev && ev.signals ? [domain, ev] : null;
  }));
  return Object.fromEntries(entries.filter(Boolean));
}

// Citation-share rank only (the sample's own order).
export function rankReadership(rows) {
  return rows
    .slice()
    .sort((a, b) => b.s_citation_share - a.s_citation_share || b.share - a.share || a.domain.localeCompare(b.domain))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
