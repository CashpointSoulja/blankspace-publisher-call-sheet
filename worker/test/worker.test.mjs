import { test } from "node:test";
import assert from "node:assert/strict";

import { normaliseTarget, isPrivateV4, isPrivateV6, TargetError } from "../src/guard.js";
import { parseRobots, isAllowed, summarisePolicy } from "../src/robots.js";
import {
  parseAdsTxt, headerBidding, hasGpt, extractLinks, affiliateEvidence, schemaTypes,
  parseSitemap, pickChildSitemap, slugMatches, detectCdn
} from "../src/signals.js";
import { runCheck, userAgentFor } from "../src/check.js";
import worker from "../src/index.js";
import { score, partsFromEvidence, partsFromSubscores, stanceFrom, ratio } from "../../assets/js/score.js";

// --- Mock network -----------------------------------------------------------------------

function mockFetch(routes, { dns = {} } = {}) {
  const calls = [];
  const fn = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://cloudflare-dns.com/")) {
      const u = new URL(url);
      const name = u.searchParams.get("name");
      const type = u.searchParams.get("type");
      const ip = dns[name] || "93.184.216.34";
      const isV6 = ip.includes(":");
      const Answer = (type === "A" && !isV6) ? [{ type: 1, data: ip }] : (type === "AAAA" && isV6) ? [{ type: 28, data: ip }] : [];
      return new Response(JSON.stringify({ Answer }), { headers: { "content-type": "application/dns-json" } });
    }
    calls.push({ url, ua: init.headers && init.headers["user-agent"] });
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404 });
    if (route.throw) throw Object.assign(new Error("boom"), { name: route.throw });
    return new Response(route.body ?? "", { status: route.status ?? 200, headers: route.headers ?? {} });
  };
  fn.calls = calls;
  return fn;
}

const SITE = "https://callsheet.example.org";

// --- Guard ------------------------------------------------------------------------------

test("normaliseTarget accepts a bare domain and normalises to https://host/", () => {
  const t = normaliseTarget("  News.Example.co.uk/some/path?q=1 ");
  assert.equal(t.url, "https://news.example.co.uk/");
  assert.equal(t.registrable, "example.co.uk");
});

test("normaliseTarget rejects non-http schemes, IPs, local and reserved names", () => {
  const bad = {
    "javascript:alert(1)": "unsupported_scheme",
    "file:///etc/passwd": "unsupported_scheme",
    "ftp://example.com": "unsupported_scheme",
    "mailto:a@example.com": "unsupported_scheme",
    "data:text/html,hi": "unsupported_scheme",
    "http://127.0.0.1/": "ip_literal",
    "http://2130706433/": "ip_literal",
    "http://0x7f.0.0.1/": "ip_literal",
    "http://[::1]/": "ip_literal",
    "10.0.0.1": "ip_literal",
    "localhost": "reserved_name",
    "localhost:8080": "reserved_name",
    "printer.local": "reserved_name",
    "db.internal": "reserved_name",
    "router.home.arpa": "reserved_name",
    "https://user:pw@example.com/": "credentials_in_url",
    "https://example.com:8443/": "non_standard_port",
    "foo.notarealtld": "not_public_suffix",
    "": "missing_url"
  };
  for (const [input, code] of Object.entries(bad)) {
    assert.throws(() => normaliseTarget(input), (e) => e instanceof TargetError && e.code === code, `${input} → ${code}`);
  }
});

test("private address ranges", () => {
  for (const ip of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1"]) {
    assert.equal(isPrivateV4(ip), true, ip);
  }
  for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "1.1.1.1"]) assert.equal(isPrivateV4(ip), false, ip);
  for (const ip of ["::1", "::", "fe80::1", "fd00::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "2001:db8::1", "ff02::1", "64:ff9b::a00:1"]) {
    assert.equal(isPrivateV6(ip), true, ip);
  }
  for (const ip of ["2606:4700:4700::1111", "2a00:1450:4009:81f::200e", "::ffff:8.8.8.8"]) assert.equal(isPrivateV6(ip), false, ip);
});

// --- robots.txt -------------------------------------------------------------------------

test("robots: longest match wins, ties go to Allow, groups merge, * fallback", () => {
  const r = parseRobots([
    "User-agent: *",
    "Disallow: /private",
    "",
    "User-agent: GPTBot",
    "User-agent: CCBot",
    "Disallow: /",
    "",
    "User-agent: gptbot",
    "Allow: /news$",
    "",
    "User-agent: TieBot",
    "Disallow: /a",
    "Allow: /a",
    "",
    "Sitemap: https://example.com/sitemap_index.xml"
  ].join("\n"));
  assert.equal(isAllowed(r, "GPTBot", "/"), false);
  assert.equal(isAllowed(r, "GPTBot", "/news"), true, "merged group allows /news");
  assert.equal(isAllowed(r, "GPTBot", "/news/x"), false, "$ anchors");
  assert.equal(isAllowed(r, "ccbot", "/"), false, "case-insensitive");
  assert.equal(isAllowed(r, "OtherBot", "/"), true, "* allows /");
  assert.equal(isAllowed(r, "OtherBot", "/private/x"), false);
  assert.equal(isAllowed(r, "TieBot", "/a"), true, "tie goes to Allow");
  assert.deepEqual(r.sitemaps, ["https://example.com/sitemap_index.xml"]);
});

test("robots: wildcard and empty Disallow", () => {
  const r = parseRobots("User-agent: *\nDisallow:\nUser-agent: X\nDisallow: /*.pdf$\n");
  assert.equal(isAllowed(r, "Y", "/anything"), true);
  assert.equal(isAllowed(r, "X", "/files/a.pdf"), false);
  assert.equal(isAllowed(r, "X", "/files/a.pdf?x"), true);
});

const AGENTS = [
  { token: "GPTBot", group: "training" },
  { token: "CCBot", group: "training" },
  { token: "OAI-SearchBot", group: "search" },
  { token: "PerplexityBot", group: "search" }
];

test("policy summary and stance codes (SPEC §5)", () => {
  const decided = summarisePolicy(parseRobots("User-agent: GPTBot\nDisallow: /\nUser-agent: CCBot\nDisallow: /\n"), AGENTS);
  assert.equal(decided.training, "blocked");
  assert.equal(decided.search, "allowed");
  assert.equal(stanceFrom(decided), "already-decided");
  assert.deepEqual(decided.excerpt, ["User-agent: GPTBot", "Disallow: /", "User-agent: CCBot", "Disallow: /"]);

  const free = summarisePolicy(parseRobots("User-agent: GPTBot\nAllow: /\n"), AGENTS);
  assert.equal(stanceFrom(free), "reading-free");

  const signalOnly = summarisePolicy(parseRobots("User-agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /\n"), AGENTS);
  assert.equal(signalOnly.ai_rules_present, true);
  assert.deepEqual(signalOnly.content_signal, ["Content-Signal: search=yes, ai-train=no"]);

  const none = summarisePolicy(parseRobots("User-agent: *\nDisallow: /admin\n"), AGENTS);
  assert.equal(stanceFrom(none), "no-owner");

  const closed = summarisePolicy(parseRobots("User-agent: PerplexityBot\nDisallow: /\n"), AGENTS);
  assert.equal(closed.search, "partial");
  assert.equal(stanceFrom(closed), "closed-door");

  assert.equal(stanceFrom({ search: null }), "unknown");
});

// --- Signals ----------------------------------------------------------------------------

test("ads.txt parsing", () => {
  const a = parseAdsTxt([
    "# comment",
    "google.com, pub-1, DIRECT, f08c47fec0942fa0",
    "Rubiconproject.com, 1, RESELLER",
    "rubiconproject.com, 2, reseller # trailing",
    "openx.com, 3, DIRECT",
    "MANAGERDOMAIN=manager.example",
    "OWNERDOMAIN=example.com",
    "CONTACT=ads@example.com",
    "not a record"
  ].join("\n"));
  assert.deepEqual(a, { records: 4, ad_systems: 3, direct: 2, reseller: 2, managerdomain: "manager.example", ownerdomain: "example.com", contact: ["ads@example.com"] });
});

test("initial HTML signals", () => {
  const html = `<script src="/js/prebid.min.js"></script><script>apstag.init()</script>
    <script async src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script>
    <a href="https://go.skimresources.com/?id=1">x</a>
    <a href='https://www.amazon.co.uk/dp/B0?tag=pub-21'>y</a>
    <a href=https://www.awin1.com/cread.php>z</a>
    <a href="https://www.amazon.co.uk/dp/B1">no tag</a>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"ItemList"},{"@type":["Thing","Product"]}]}</script>`;
  assert.deepEqual(headerBidding(html), ["prebid", "amazon"]);
  assert.equal(hasGpt(html), true);
  const ev = affiliateEvidence(extractLinks(html, "https://example.com/"), "https://example.com/");
  assert.deepEqual(ev.map((e) => e.network), ["skimlinks", "amazon", "awin"]);
  assert.deepEqual(schemaTypes(html), ["ItemList", "Product"]);
  assert.deepEqual(headerBidding("<p>nothing</p>"), []);
});

test("sitemaps and slug pattern", () => {
  const idx = parseSitemap("<sitemapindex><sitemap><loc>https://e.com/page-sitemap.xml</loc></sitemap><sitemap><loc>https://e.com/post-sitemap.xml</loc></sitemap></sitemapindex>");
  assert.equal(idx.isIndex, true);
  assert.equal(pickChildSitemap(idx.locs), "https://e.com/post-sitemap.xml");
  for (const u of ["https://e.com/best-running-shoes", "https://e.com/reviews/x", "https://e.com/a-vs-b", "https://e.com/top10-cars", "https://e.com/top-5-tvs", "https://e.com/buying-guide/"]) {
    assert.equal(slugMatches(u), true, u);
  }
  for (const u of ["https://e.com/bestseller", "https://e.com/news/review-policy-update-x", "https://e.com/about"]) {
    // "review-policy..." does match: review is followed by "-". Keep only the clear negatives.
    if (u.includes("review-policy")) continue;
    assert.equal(slugMatches(u), false, u);
  }
});

test("CDN headers, layered setups recorded", () => {
  const h = new Headers({ "cf-ray": "abc", "x-amz-cf-id": "x", via: "1.1 abc.cloudfront.net (CloudFront)" });
  assert.deepEqual(detectCdn(h).providers, ["cloudflare", "cloudfront"]);
  assert.deepEqual(detectCdn(new Headers({ server: "nginx" })), { providers: ["unidentified"], evidence_headers: [] });
});

// --- Scoring ----------------------------------------------------------------------------

test("unknown signals leave both total and max", () => {
  const s = score(partsFromSubscores({ readership: null, placement: 1, programmatic: 1, reachability: 1, commerce: 1 }));
  assert.equal(s.max, 60);
  assert.equal(s.total, 60);
  const p = score(partsFromEvidence({
    readership: { status: "not_in_sample" },
    placement: { slugs_sampled: null, slug_share: null, schema_types: ["ItemList"], pages_checked: ["https://e.com/"] }
  }));
  assert.equal(p.maxima.placement, 5, "no sitemap: slug part (15) drops out");
  assert.equal(p.points.placement, 5);
  assert.equal(p.max, 5, "every other signal unknown");
  assert.equal(ratio(score(partsFromSubscores({}))), null);
});

// --- End to end -------------------------------------------------------------------------

function publisherRoutes() {
  const sitemap = `<urlset>${["best-electric-cars", "news/launch", "reviews/model-y", "a-vs-b", "about"].map((p) => `<url><loc>https://www.pub.co.uk/${p}</loc></url>`).join("")}</urlset>`;
  return {
    "https://pub.co.uk/robots.txt": { status: 301, headers: { location: "https://www.pub.co.uk/robots.txt" } },
    "https://www.pub.co.uk/robots.txt": {
      body: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: AyoGTMResearch\nDisallow: /reviews/\n\nUser-agent: *\nAllow: /\nSitemap: https://www.pub.co.uk/sitemap.xml\nSitemap: https://cdn.other.com/sitemap.xml\n"
    },
    "https://pub.co.uk/": { status: 301, headers: { location: "https://www.pub.co.uk/" } },
    "https://www.pub.co.uk/": {
      body: `<html><script src="prebid.js"></script><a href="https://go.redirectingat.com/x">a</a></html>`,
      headers: { "cf-ray": "1", "content-type": "text/html" }
    },
    "https://pub.co.uk/ads.txt": { status: 403, body: "<html>denied</html>" },
    "https://www.pub.co.uk/sitemap.xml": { body: sitemap },
    "https://www.pub.co.uk/best-electric-cars": { body: `<html><script type="application/ld+json">{"@type":"ItemList"}</script></html>` }
  };
}

test("live check: honest UA, robots respected, blocked fetch recorded, budget held", async () => {
  const f = mockFetch(publisherRoutes());
  const ev = await runCheck("pub.co.uk", { siteOrigin: SITE, fetchImpl: f, now: () => new Date("2026-10-30T12:00:00Z") });

  assert.equal(ev.source, "live");
  assert.equal(ev.domain, "pub.co.uk");
  assert.equal(ev.fetch.user_agent, userAgentFor(SITE));
  assert.match(ev.fetch.user_agent, /^AyoGTMResearch\/0\.1 \(\+https:\/\/callsheet\.example\.org\/method#crawler\)$/);
  for (const c of f.calls) assert.equal(c.ua, ev.fetch.user_agent, "every request carries the honest UA");
  assert.ok(ev.fetch.requests <= 8);
  assert.equal(ev.fetch.requests, f.calls.length);

  assert.deepEqual(ev.fetch.blocked, [{ url: "https://pub.co.uk/ads.txt", status: 403 }]);
  assert.ok(ev.fetch.skipped.some((s) => s.url === "https://www.pub.co.uk/reviews/model-y" && s.reason === "robots_disallow"));
  assert.ok(ev.fetch.skipped.some((s) => s.url === "https://cdn.other.com/sitemap.xml" && s.reason === "off_domain") === false, "first same-domain sitemap is used, the other is ignored");
  assert.ok(!f.calls.some((c) => c.url.includes("/reviews/")), "disallowed page never fetched");

  const s = ev.signals;
  assert.equal(s.readership.status, "not_in_sample");
  assert.equal(s.reachability.training, "partial");
  assert.equal(s.reachability.search, "allowed");
  assert.equal(s.reachability.per_agent.GPTBot, "blocked");
  assert.equal(ev.stance.code, "already-decided");
  assert.equal(s.placement.slugs_sampled, 5);
  assert.equal(s.placement.slugs_matched, 3);
  assert.deepEqual(s.placement.schema_types, ["ItemList"]);
  assert.equal(s.programmatic.ads_txt.present, false);
  assert.deepEqual(s.programmatic.header_bidding.detected, ["prebid"]);
  assert.deepEqual(s.commerce.networks, ["skimlinks"]);
  assert.deepEqual(s.cdn.providers, ["cloudflare"]);

  assert.equal(ev.score.max, 60, "readership unknown out of sample");
  assert.equal(ev.score.subscores.readership, null);
  assert.equal(ev.cannot_see.length, 3);
});

test("live check refuses a public name that resolves to a private address", async () => {
  const f = mockFetch({}, { dns: { "evil.example.com": "10.0.0.5" } });
  await assert.rejects(runCheck("evil.example.com", { siteOrigin: SITE, fetchImpl: f }), (e) => e.code === "private_address");
  assert.equal(f.calls.length, 0, "no request reached the target");
});

test("unreachable robots.txt means reachability unknown and nothing else crawled", async () => {
  const f = mockFetch({ "https://down.co.uk/robots.txt": { throw: "AbortError" }, "https://down.co.uk/ads.txt": { body: "a.com, 1, DIRECT" } });
  const ev = await runCheck("down.co.uk", { siteOrigin: SITE, fetchImpl: f });
  assert.equal(ev.signals.reachability.search, null);
  assert.equal(ev.stance.code, "unknown");
  assert.equal(ev.score.subscores.reachability, null);
  assert.ok(ev.fetch.skipped.some((s) => s.reason === "timeout"));
  assert.deepEqual(f.calls.map((c) => c.url).sort(), ["https://down.co.uk/ads.txt", "https://down.co.uk/robots.txt"]);
  assert.equal(ev.signals.programmatic.ads_txt.present, true, "ads.txt is exempt from robots.txt");
});

// --- HTTP handler -----------------------------------------------------------------------

test("handler: routing, validation and rate limit", async () => {
  const env = { SITE_ORIGIN: SITE };
  const req = (path, ip = "203.0.113.9") => new Request(`https://w.example/${path}`, { headers: { "cf-connecting-ip": ip } });

  assert.equal((await worker.fetch(req("other"), env)).status, 404);
  const bad = await worker.fetch(req("api/check?url=javascript:alert(1)", "198.51.100.1"), env);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "unsupported_scheme");

  let last;
  for (let i = 0; i < 11; i++) last = await worker.fetch(req("api/check?url=localhost", "198.51.100.2"), env);
  assert.equal(last.status, 429);

  const limited = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await worker.fetch(req("api/check?url=example.com"), limited)).status, 429);
});
