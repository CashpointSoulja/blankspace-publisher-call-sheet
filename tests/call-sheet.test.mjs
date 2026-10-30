// Call-sheet ordering with partial live coverage. Fixtures are built here, never in data/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCallSheet, buildEvidence } from "../assets/js/evidence-model.js";
import { DEFAULT_WEIGHTS } from "../assets/js/score.js";

const SAMPLE = { sample_id: "sample-test", dates_utc: ["2026-10-30"] };

function reader(domain, share, vertical = "automotive") {
  const cited = Math.round(share * 80);
  return {
    domain, vertical, probes_cited_in_vertical: cited, vertical_probes_total: 80, share,
    stability: "both_runs", probe_ids: [`p-${domain}`], s_citation_share: Math.min(1, share / 0.25)
  };
}

// A stored live check in the worker's shape. Each argument is a sub-score driver.
function liveCheck(domain, { slugShare = 0.3, schema = true, ads = true, systems = 6, bidding = true, search = "allowed", networks = 2, robots = true } = {}) {
  return {
    domain, vertical: null, source: "live", checked_at: "2026-10-31T09:00:00Z",
    fetch: { user_agent: "AyoGTMResearch/0.1 (+https://example.org/method#crawler)", requests: 7, blocked: [], skipped: [] },
    signals: {
      readership: { status: "not_in_sample" },
      placement: { sitemap_url: "x", slugs_sampled: 50, slugs_matched: Math.round(slugShare * 50), slug_share: slugShare, matched_examples: [], schema_types: schema ? ["ItemList"] : [], pages_checked: ["x"] },
      programmatic: {
        ads_txt: { present: ads, url: "x", ad_systems: ads ? systems : null },
        header_bidding: { detected: bidding ? ["prebid"] : [], scope: "initial_html" },
        ad_server_tag: { gpt: true }
      },
      reachability: robots
        ? { robots_url: "x", status: 200, training: "blocked", search, per_agent: {}, ai_rules_present: true, content_signal: [], excerpt: [] }
        : { robots_url: "x", status: null, training: null, search: null, per_agent: {}, ai_rules_present: null, content_signal: [], excerpt: [] },
      commerce: { networks: Array.from({ length: networks }, (_, i) => ["skimlinks", "awin", "cj"][i]), evidence: [] },
      cdn: { providers: ["cloudflare"], evidence_headers: ["cf-ray"] }
    },
    score: { total: 0, max: 60 },
    stance: { code: "already-decided", angle_label: "x" },
    cannot_see: []
  };
}

const READERSHIP = [reader("alpha.co.uk", 0.6), reader("bravo.co.uk", 0.3), reader("charlie.co.uk", 0.1), reader("delta.co.uk", 0.05, "sportswear")];

test("no stored checks: one group, citation share order, every row out of 40", () => {
  const sheet = buildCallSheet(READERSHIP, {}, DEFAULT_WEIGHTS, SAMPLE);
  assert.equal(sheet.checked.length, 0);
  assert.deepEqual(sheet.unchecked.map((x) => x.domain), ["alpha.co.uk", "bravo.co.uk", "charlie.co.uk", "delta.co.uk"]);
  assert.deepEqual(sheet.unchecked.map((x) => x.position), [1, 2, 3, 4]);
  for (const x of sheet.unchecked) {
    assert.equal(x.scored.max, 40);
    assert.equal(x.known, 1);
  }
  // alpha and bravo both saturate at 40; raw share breaks the tie.
  assert.equal(sheet.unchecked[0].scored.total, 40);
  assert.equal(sheet.unchecked[1].scored.total, 40);
});

test("a stored check moves the publisher into the checked group, scored on every known signal", () => {
  const sheet = buildCallSheet(READERSHIP, { "charlie.co.uk": liveCheck("charlie.co.uk") }, DEFAULT_WEIGHTS, SAMPLE);
  assert.deepEqual(sheet.checked.map((x) => x.domain), ["charlie.co.uk"]);
  const c = sheet.checked[0];
  assert.equal(c.position, 1);
  assert.equal(c.known, 5);
  assert.equal(c.scored.max, 100);
  // 40 × 0.4 + 20 + 15 + 10 + 15 = 76
  assert.equal(c.scored.total, 76);
  assert.equal(c.stance, "already-decided");
  assert.deepEqual(sheet.unchecked.map((x) => x.position), [2, 3, 4]);
});

test("checked publishers are never ranked against unchecked ones on mismatched maxima", () => {
  // bravo is checked and weak on live signals: its ratio (0.4) is below alpha's unchecked
  // ratio (1.0). It still leads, because the two ratios measure different things.
  const weak = liveCheck("bravo.co.uk", { slugShare: 0, schema: false, ads: false, bidding: false, search: "blocked", networks: 0 });
  const sheet = buildCallSheet(READERSHIP, { "bravo.co.uk": weak }, DEFAULT_WEIGHTS, SAMPLE);
  assert.equal(sheet.checked[0].domain, "bravo.co.uk");
  assert.equal(sheet.checked[0].scored.total, 40);
  assert.equal(sheet.checked[0].scored.max, 100);
  assert.equal(sheet.unchecked[0].domain, "alpha.co.uk");
});

test("weight sliders re-rank the checked group", () => {
  const live = {
    "alpha.co.uk": liveCheck("alpha.co.uk", { slugShare: 0, schema: false, networks: 2 }),   // weak placement, strong commerce
    "bravo.co.uk": liveCheck("bravo.co.uk", { slugShare: 0.3, schema: true, networks: 0, ads: false }) // strong placement only
  };
  // Default weights: alpha 40 + 0 + 15 + 10 + 15 = 80; bravo 40 + 20 + 5 + 10 + 0 = 75.
  const byDefault = buildCallSheet(READERSHIP, live, DEFAULT_WEIGHTS, SAMPLE).checked.map((x) => x.domain);
  assert.deepEqual(byDefault, ["alpha.co.uk", "bravo.co.uk"]);
  // Placement-heavy: alpha 10 + 0 + 10 + 10 + 10 = 40; bravo 10 + 60 + 3.3 + 10 + 0 = 83.3.
  const placementHeavy = { readership: 10, placement: 60, programmatic: 10, reachability: 10, commerce: 10 };
  const reranked = buildCallSheet(READERSHIP, live, placementHeavy, SAMPLE).checked.map((x) => x.domain);
  assert.deepEqual(reranked, ["bravo.co.uk", "alpha.co.uk"]);
});

test("unknown stays unknown: an unreadable robots.txt shrinks the maximum, not the total", () => {
  const sheet = buildCallSheet(READERSHIP, { "alpha.co.uk": liveCheck("alpha.co.uk", { robots: false }) }, DEFAULT_WEIGHTS, SAMPLE);
  const a = sheet.checked[0];
  assert.equal(a.known, 4);
  assert.equal(a.scored.max, 90);
  assert.equal(a.scored.total, 90);
  assert.equal(a.scored.subscores.reachability, null);
  assert.equal(a.key, 1, "ratio over known signals, not 90 / 100");
});

test("citation share always comes from the sample, and the score is recomputed", () => {
  const ev = buildEvidence(READERSHIP[2], SAMPLE, liveCheck("charlie.co.uk"));
  assert.equal(ev.signals.readership.status, "in_sample");
  assert.equal(ev.signals.readership.share, 0.1);
  assert.equal(ev.score.max, 100, "the stored file said 60; with citation share known it is 100");
  assert.equal(ev.source, "live");
  assert.equal(ev.vertical, "automotive");
});

test("a check with unreadable signals never outranks one read in full", () => {
  // alpha blocked most of the check: only citation share, programmatic (ads.txt) and
  // reachability are known, all at full marks, so its ratio is 1. bravo was read in full and
  // scores 76 / 100. bravo still leads: the two ratios are over different signals.
  const blocked = liveCheck("alpha.co.uk");
  blocked.signals.placement = { sitemap_url: null, slugs_sampled: null, slugs_matched: null, slug_share: null, matched_examples: [], schema_types: [], pages_checked: [] };
  blocked.signals.programmatic.header_bidding = { detected: null, scope: "initial_html" };
  blocked.signals.commerce = { networks: null, evidence: [] };
  const live = { "alpha.co.uk": blocked, "bravo.co.uk": liveCheck("bravo.co.uk", { networks: 0 }) };
  const sheet = buildCallSheet(READERSHIP, live, DEFAULT_WEIGHTS, SAMPLE);
  assert.deepEqual(sheet.complete.map((x) => x.domain), ["bravo.co.uk"]);
  assert.deepEqual(sheet.partial.map((x) => x.domain), ["alpha.co.uk"]);
  const a = sheet.partial[0];
  assert.equal(a.known, 3);
  assert.equal(a.key, 1);
  assert.ok(a.key > sheet.complete[0].key, "higher ratio, yet ranked after the complete check");
  assert.deepEqual(sheet.all.map((x) => x.domain).slice(0, 2), ["bravo.co.uk", "alpha.co.uk"]);
  assert.equal(a.scored.max, 60, "its unknowns are left out, not scored as zero");
});

test("vertical filter keeps global positions", () => {
  const sheet = buildCallSheet(READERSHIP, {}, DEFAULT_WEIGHTS, SAMPLE);
  const sport = [...sheet.checked, ...sheet.unchecked].filter((x) => x.vertical === "sportswear");
  assert.deepEqual(sport.map((x) => [x.domain, x.position]), [["delta.co.uk", 4]]);
});
