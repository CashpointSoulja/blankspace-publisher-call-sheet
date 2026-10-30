// One live check: public files only, at most 8 requests to the publisher (SPEC §7).
// Builds the evidence object described in SPEC §8.4 with "source": "live".

import agentsData from "../../data/agents.json" with { type: "json" };
import { normaliseTarget, registrableDomain } from "./guard.js";
import { Session } from "./fetcher.js";
import { summarisePolicy } from "./robots.js";
import {
  parseAdsTxt, looksLikeHtml, headerBidding, hasGpt, extractLinks, affiliateEvidence,
  schemaTypes, parseSitemap, pickChildSitemap, slugMatches, detectCdn
} from "./signals.js";
import { DEFAULT_WEIGHTS, STANCES, partsFromEvidence, score, stanceFrom, missedPoints } from "../../assets/js/score.js";

export const CANNOT_SEE = [
  "Real agent traffic volumes",
  "Direct-sold ad revenue",
  "Who owns AI policy internally"
];

const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";
const SITEMAP_LIMIT = 50;

export function userAgentFor(siteOrigin) {
  return `AyoGTMResearch/0.1 (+${siteOrigin.replace(/\/$/, "")}/method#crawler)`;
}

const isOk = (res) => res && !res.error && res.status >= 200 && res.status < 300;
const isHtml = (res) => isOk(res) && /<(!doctype\s+html|html[\s>]|head[\s>]|body[\s>])/i.test(res.text.slice(0, 4096));
const isSitemap = (res) => isOk(res) && /<(urlset|sitemapindex)[\s>]/i.test(res.text);

export async function runCheck(input, { siteOrigin, fetchImpl = fetch, dnsCheck = true, now = () => new Date() }) {
  const target = normaliseTarget(input); // throws TargetError for unsafe or invalid input
  const session = new Session({
    userAgent: userAgentFor(siteOrigin),
    registrable: target.registrable,
    fetchImpl,
    dnsCheck
  });
  await session.ensureHostSafe(target.host); // throws if the name resolves inward

  // 1. robots.txt for the given host (exempt from itself).
  const robots = await session.robotsFor(target.host);

  // 2. Homepage. Redirects within the registrable domain are followed (e.g. to www).
  const home = await session.get(target.url, { maxRedirects: 2, accept: HTML_ACCEPT });
  const finalHost = home && home.url ? new URL(home.url).hostname : target.host;

  // 3. ads.txt on the registrable domain (exempt from robots.txt). One same-domain redirect.
  const adsUrl = `https://${target.registrable}/ads.txt`;
  const ads = await session.get(adsUrl, { respectRobots: false, maxRedirects: 1, accept: "text/plain,*/*;q=0.5" });

  // 4. Sitemap: the Sitemap line in robots.txt if it is on this domain, else /sitemap.xml.
  const declared = robots.parsed ? robots.parsed.sitemaps : [];
  let sitemapUrl = declared.find((s) => {
    try { return registrableDomain(new URL(s).hostname) === target.registrable; } catch { return false; }
  }) || null;
  if (!sitemapUrl) {
    for (const s of declared) session.skip(s, "off_domain");
    sitemapUrl = `https://${finalHost}/sitemap.xml`;
  }

  let sitemapUsed = null;
  let locs = null;
  const first = await session.get(sitemapUrl, { maxRedirects: 1, accept: "application/xml,text/xml,*/*;q=0.5" });
  if (isSitemap(first)) {
    const parsed = parseSitemap(first.text);
    if (parsed.isIndex) {
      const child = pickChildSitemap(parsed.locs);
      if (child) {
        const second = await session.get(child, { maxRedirects: 1, accept: "application/xml,text/xml,*/*;q=0.5" });
        if (isSitemap(second)) {
          sitemapUsed = second.url;
          locs = parseSitemap(second.text).locs;
        }
      }
    } else {
      sitemapUsed = first.url;
      locs = parsed.locs;
    }
  }
  const sampled = locs ? locs.slice(0, SITEMAP_LIMIT) : null;
  const matched = sampled ? sampled.filter(slugMatches) : [];

  // 5. Up to two matched pages, for markup and affiliate links.
  const pages = [];
  if (isHtml(home)) pages.push(home);
  // Pages robots.txt disallows are skipped and the next match is tried instead.
  let attempted = 0;
  for (const url of matched) {
    if (attempted >= 2 || session.requests >= session.maxRequests) break;
    let sameDomain = false;
    try { sameDomain = registrableDomain(new URL(url).hostname) === target.registrable; } catch { /* skip */ }
    if (!sameDomain) { session.skip(url, "off_domain"); continue; }
    const res = await session.get(url, { maxRedirects: 1, accept: HTML_ACCEPT });
    if (res === null) continue;
    attempted++;
    if (isHtml(res)) pages.push(res);
  }

  // --- Signals ---------------------------------------------------------------------
  const agents = agentsData.agents.map(({ token, group }) => ({ token, group }));

  const reachability = robots.unreachable
    ? { robots_url: robots.url, status: robots.status ?? null, training: null, search: null, per_agent: {}, ai_rules_present: null, content_signal: [], excerpt: [] }
    : { robots_url: robots.url, status: robots.status, ...summarisePolicy(robots.parsed, agents) };

  let adsTxt;
  if (!ads || ads.error === "off_domain") {
    adsTxt = { present: null, url: adsUrl, status: null, note: ads && ads.redirectedOffDomain ? "redirected_off_domain" : "skipped" };
  } else if (ads.error) {
    adsTxt = { present: null, url: adsUrl, status: null, note: ads.error };
  } else if (ads.redirectLimit) {
    adsTxt = { present: null, url: adsUrl, status: ads.status, note: "too_many_redirects" };
  } else if (ads.status === 200 && !looksLikeHtml(ads.text)) {
    adsTxt = { present: true, url: ads.url, status: 200, ...parseAdsTxt(ads.text), note: ads.truncated ? "truncated_at_512kb" : null };
  } else {
    adsTxt = { present: false, url: ads.url, status: ads.status, note: ads.status === 200 ? "soft_404" : null };
  }

  const html = pages.map((p) => p.text).join("\n");
  const commerceEvidence = pages.flatMap((p) => affiliateEvidence(extractLinks(p.text, p.url), p.url));
  const networks = [];
  const evidence = [];
  for (const e of commerceEvidence) {
    if (networks.includes(e.network)) continue;
    networks.push(e.network);
    evidence.push(e);
  }

  const cdnSource = (home && home.headers) || (robots.res && robots.res.headers) || null;

  const signals = {
    readership: { status: "not_in_sample" },
    placement: {
      sitemap_url: sitemapUsed,
      slugs_sampled: sampled ? sampled.length : null,
      slugs_matched: sampled ? matched.length : null,
      slug_share: sampled && sampled.length ? round3(matched.length / sampled.length) : null,
      matched_examples: matched.slice(0, 5),
      schema_types: mergeTypes(pages.map((p) => schemaTypes(p.text))),
      pages_checked: pages.map((p) => p.url)
    },
    programmatic: {
      ads_txt: adsTxt,
      header_bidding: { detected: pages.length ? headerBidding(html) : null, scope: "initial_html" },
      ad_server_tag: { gpt: pages.length ? hasGpt(html) : null }
    },
    reachability,
    commerce: { networks: pages.length ? networks : null, evidence },
    cdn: cdnSource ? detectCdn(cdnSource) : { providers: ["unidentified"], evidence_headers: [] }
  };

  const scored = score(partsFromEvidence(signals), DEFAULT_WEIGHTS);
  const code = stanceFrom(reachability);

  return {
    domain: target.registrable,
    vertical: null,
    source: "live",
    checked_at: now().toISOString(),
    fetch: {
      user_agent: session.userAgent,
      requests: session.requests,
      blocked: session.blocked,
      skipped: session.skipped
    },
    signals,
    score: {
      weights: scored.weights,
      subscores: scored.subscores,
      points: scored.points,
      maxima: scored.maxima,
      total: scored.total,
      max: scored.max,
      missed: missedPoints(signals)
    },
    stance: { code, angle_label: STANCES[code].angle },
    cannot_see: CANNOT_SEE.slice()
  };
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

function mergeTypes(lists) {
  const all = new Set(lists.flat());
  return ["ItemList", "Product", "Review"].filter((t) => all.has(t));
}
