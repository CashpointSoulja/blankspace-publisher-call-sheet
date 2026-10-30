// Evidence objects and call-sheet ordering. No DOM: the site, the checks and the verifier
// script all import this module.

import { SIGNALS, CANNOT_SEE, DEFAULT_WEIGHTS, partsFromEvidence, score, ratio, missedPoints, stanceFrom, STANCES } from "./score.js";

export const sampleDate = (sample) => (sample && Array.isArray(sample.dates_utc) && sample.dates_utc[0]) || null;

// A readership.json row as the SPEC §8.4 readership signal.
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

// Evidence for one publisher. Citation share always comes from readership.json. Live signals
// come from a stored check (data/evidence/{domain}.json) when one exists; otherwise they are
// absent, which pages show as "not collected" and scoring leaves out.
export function buildEvidence(row, sample, live = null, weights = DEFAULT_WEIGHTS) {
  const signals = { ...(live ? live.signals : {}), readership: readershipSignal(row, sample) };
  const scored = score(partsFromEvidence(signals), weights);
  const date = sampleDate(sample);
  const code = live ? stanceFrom(signals.reachability) : "unknown";
  return {
    ...(live || {}),
    domain: row.domain,
    vertical: row.vertical,
    source: live ? "live" : "sample",
    checked_at: live ? live.checked_at : date ? `${date}T00:00:00Z` : null,
    signals,
    score: { ...scored, missed: missedPoints(signals) },
    stance: live && live.stance ? live.stance : { code, angle_label: STANCES[code].angle },
    cannot_see: CANNOT_SEE.slice()
  };
}

export const evidenceFromSample = (row, sample) => buildEvidence(row, sample, null);

// Number of the five signals with at least one known part.
export function coverage(scored) {
  return SIGNALS.filter((k) => scored.subscores[k] !== null).length;
}

// The call sheet (SPEC §3), ordered fairly when evidence is uneven.
//
// Ranking by Σ w·s / Σ w over known signals compares like with like only when publishers
// know the same signals. Mixed together, a publisher that blocked half the check could outrank
// one that was read in full, and an unchecked publisher (citation share only) could outrank a
// checked one, purely because less is known. So publishers are grouped by how much was read:
//   1. complete:  live-checked, all five signals known;
//   2. partial:   live-checked, some signal unreadable (usually a blocked fetch), more known first;
//   3. unchecked: citation share only.
// Within that: ratio, then raw citation share, then domain. Unknown is never scored as zero,
// and no publisher is ranked above another because less of it is known.
// `position` is the place in the combined list; `sampleRank` is the citation-share rank.
export function buildCallSheet(readership, liveByDomain = {}, weights = DEFAULT_WEIGHTS, sample = null) {
  const bySample = readership
    .slice()
    .sort((a, b) => b.s_citation_share - a.s_citation_share || b.share - a.share || a.domain.localeCompare(b.domain));
  const rows = bySample.map((row, i) => {
    const live = liveByDomain[row.domain] || null;
    const ev = buildEvidence(row, sample, live, weights);
    return {
      row,
      domain: row.domain,
      vertical: row.vertical,
      checked: Boolean(live),
      checkedAt: live ? live.checked_at : null,
      stance: live ? ev.stance.code : null,
      scored: ev.score,
      key: ratio(ev.score),
      known: coverage(ev.score),
      sampleRank: i + 1
    };
  });
  const order = (a, b) => (b.key ?? -1) - (a.key ?? -1) || b.row.share - a.row.share || a.domain.localeCompare(b.domain);
  const complete = rows.filter((r) => r.checked && r.known === SIGNALS.length).sort(order);
  const partial = rows.filter((r) => r.checked && r.known < SIGNALS.length).sort((a, b) => b.known - a.known || order(a, b));
  const unchecked = rows.filter((r) => !r.checked).sort(order);
  const all = [...complete, ...partial, ...unchecked];
  all.forEach((r, i) => { r.position = i + 1; });
  return { complete, partial, unchecked, checked: [...complete, ...partial], all, total: rows.length };
}
