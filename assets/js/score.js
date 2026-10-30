// Scoring and stance rules (SPEC §3 and §5). Shared by the site and the live-check worker,
// so the formula exists in exactly one place.
//
// A signal is a list of weighted parts. Each part has a share of the signal's weight and a
// value in [0, 1], or null when unknown. Unknown parts leave both the total and the maximum.

export const SIGNALS = ["readership", "placement", "programmatic", "reachability", "commerce"];

export const DEFAULT_WEIGHTS = Object.freeze({
  readership: 40,
  placement: 20,
  programmatic: 15,
  reachability: 10,
  commerce: 15
});

export const SIGNAL_LABELS = Object.freeze({
  readership: "Citation share",
  placement: "Placement fit",
  programmatic: "Programmatic stack",
  reachability: "Agent reachability",
  commerce: "Commerce monetisation"
});

// Angle text is Ayo's interpretation (SPEC §5). Pages label it as such.
export const STANCES = Object.freeze({
  "already-decided": {
    priority: "High",
    angle: "You’ve already decided AI search is welcome. Those visits earn nothing yet."
  },
  "reading-free": {
    priority: "High",
    angle: "AI agents read you every day, free."
  },
  "no-owner": {
    priority: "Medium",
    angle: "No stated AI policy usually means no owner yet. The first conversation is about who owns it."
  },
  "closed-door": {
    priority: "Low",
    angle: "Search agents are disallowed in robots.txt. The reason is not visible from outside."
  },
  unknown: {
    priority: "n/a",
    angle: null
  }
});

// What no outside check can see (SPEC §8.4 cannot_see).
export const CANNOT_SEE = Object.freeze([
  "Real agent traffic volumes",
  "Direct-sold ad revenue",
  "Who owns AI policy internally"
]);

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

// --- Sub-scores from raw evidence (SPEC §3.1 to §3.5) ---------------------------------

export function readershipParts(r) {
  if (!r || r.status !== "in_sample" || !isNum(r.share)) return [{ share: 1, value: null }];
  return [{ share: 1, value: clamp01(r.share / 0.25) }];
}

export function placementParts(p) {
  if (!p) return [{ share: 0.75, value: null }, { share: 0.25, value: null }];
  const slug = isNum(p.slug_share) && isNum(p.slugs_sampled) && p.slugs_sampled > 0
    ? clamp01(p.slug_share / 0.30)
    : null;
  const pagesChecked = Array.isArray(p.pages_checked) ? p.pages_checked.length : 0;
  const schema = pagesChecked > 0 ? (Array.isArray(p.schema_types) && p.schema_types.length > 0 ? 1 : 0) : null;
  return [{ share: 0.75, value: slug }, { share: 0.25, value: schema }];
}

export function programmaticParts(g) {
  const third = 1 / 3;
  if (!g) return [{ share: third, value: null }, { share: third, value: null }, { share: third, value: null }];
  const ads = g.ads_txt || {};
  const present = typeof ads.present === "boolean" ? (ads.present ? 1 : 0) : null;
  let systems = null;
  if (present === 0) systems = 0;
  else if (present === 1 && isNum(ads.ad_systems)) systems = ads.ad_systems >= 5 ? 1 : 0;
  const hb = g.header_bidding;
  const bidding = hb && Array.isArray(hb.detected) ? (hb.detected.length > 0 ? 1 : 0) : null;
  return [{ share: third, value: present }, { share: third, value: systems }, { share: third, value: bidding }];
}

export function reachabilityParts(r) {
  if (!r || !r.search) return [{ share: 1, value: null }];
  const map = { allowed: 1, partial: 0.5, blocked: 0 };
  return [{ share: 1, value: r.search in map ? map[r.search] : null }];
}

export function commerceParts(c) {
  if (!c || !Array.isArray(c.networks)) return [{ share: 1, value: null }];
  const n = c.networks.length;
  return [{ share: 1, value: n === 0 ? 0 : n === 1 ? 2 / 3 : 1 }];
}

export function partsFromEvidence(signals) {
  const s = signals || {};
  return {
    readership: readershipParts(s.readership),
    placement: placementParts(s.placement),
    programmatic: programmaticParts(s.programmatic),
    reachability: reachabilityParts(s.reachability),
    commerce: commerceParts(s.commerce)
  };
}

// Call-sheet rows carry one sub-score per signal (number or null).
export function partsFromSubscores(subscores) {
  const out = {};
  for (const k of SIGNALS) {
    const v = subscores ? subscores[k] : null;
    out[k] = [{ share: 1, value: isNum(v) ? clamp01(v) : null }];
  }
  return out;
}

// --- Totals ---------------------------------------------------------------------------

const round1 = (x) => Math.round(x * 10) / 10;

export function score(parts, weights = DEFAULT_WEIGHTS) {
  const result = { weights: {}, subscores: {}, points: {}, maxima: {}, total: 0, max: 0 };
  for (const k of SIGNALS) {
    const w = isNum(weights[k]) ? weights[k] : 0;
    let got = 0;
    let known = 0;
    for (const part of parts[k] || []) {
      if (part.value === null || part.value === undefined) continue;
      got += part.share * part.value;
      known += part.share;
    }
    result.weights[k] = w;
    if (known === 0) {
      result.subscores[k] = null;
      result.points[k] = null;
      result.maxima[k] = 0;
      continue;
    }
    result.subscores[k] = round1(got / known * 100) / 100;
    result.points[k] = round1(w * got);
    result.maxima[k] = round1(w * known);
    result.total += w * got;
    result.max += w * known;
  }
  result.total = round1(result.total);
  result.max = round1(result.max);
  return result;
}

// Ranking key for custom weights: Σ w·s / Σ w over known signals (SPEC §3).
export function ratio(scored) {
  return scored.max > 0 ? scored.total / scored.max : null;
}

export function display(scored) {
  return `${Math.round(scored.total)} / ${Math.round(scored.max)}`;
}

// --- Stance (SPEC §5) -----------------------------------------------------------------

export function stanceFrom(reachability) {
  const r = reachability || {};
  if (!r.search) return "unknown";
  if (r.search === "blocked" || r.search === "partial") return "closed-door";
  if (r.training === "blocked" || r.training === "partial") return "already-decided";
  if (r.ai_rules_present) return "reading-free";
  return "no-owner";
}

// --- Why not higher -------------------------------------------------------------------
// Plain statements of where points were lost, derived only from evidence values.

const pct = (x) => `${Math.round(x * 100)}%`;

export function missedPoints(signals, weights = DEFAULT_WEIGHTS) {
  const s = signals || {};
  const out = [];
  const r = s.readership;
  if (r && r.status === "in_sample" && isNum(r.share) && r.share < 0.25) {
    out.push(`Citation share: cited in ${pct(r.share)} of its vertical’s sampled probes. Full marks start at 25%.`);
  }
  const p = s.placement;
  if (p) {
    if (isNum(p.slug_share) && p.slugs_sampled > 0 && p.slug_share < 0.30) {
      out.push(`Placement: ${p.slugs_matched} of ${p.slugs_sampled} sampled sitemap URLs look like roundups, comparisons or reviews (${pct(p.slug_share)}). Full marks start at 30%.`);
    }
    if (Array.isArray(p.pages_checked) && p.pages_checked.length > 0 && (!p.schema_types || p.schema_types.length === 0)) {
      out.push(`Placement: no ItemList, Product or Review markup on the ${p.pages_checked.length} page${p.pages_checked.length === 1 ? "" : "s"} checked.`);
    }
  }
  const g = s.programmatic;
  if (g) {
    if (g.ads_txt && g.ads_txt.present === false) out.push("Programmatic: no ads.txt found.");
    else if (g.ads_txt && g.ads_txt.present && isNum(g.ads_txt.ad_systems) && g.ads_txt.ad_systems < 5) {
      out.push(`Programmatic: ads.txt lists ${g.ads_txt.ad_systems} ad system${g.ads_txt.ad_systems === 1 ? "" : "s"}. The mark is five.`);
    }
    if (g.header_bidding && Array.isArray(g.header_bidding.detected) && g.header_bidding.detected.length === 0) {
      out.push("Programmatic: no header bidding seen in the initial HTML. It may load later.");
    }
  }
  const re = s.reachability;
  if (re && (re.search === "partial" || re.search === "blocked")) {
    out.push(`Reachability: search and user-triggered agents are ${re.search === "blocked" ? "all disallowed" : "partly disallowed"} in robots.txt.`);
  }
  const c = s.commerce;
  if (c && Array.isArray(c.networks) && c.networks.length < 2) {
    out.push(c.networks.length === 0
      ? "Commerce: no affiliate network links found in the pages checked."
      : "Commerce: one affiliate network found. Full marks need two.");
  }
  return out;
}
