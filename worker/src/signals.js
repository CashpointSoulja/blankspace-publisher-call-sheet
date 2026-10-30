// Signal extraction from public files (SPEC §3.2, §3.3, §3.5, §3.6). Pure functions.

// --- ads.txt (SPEC §3.3) --------------------------------------------------------------

export function parseAdsTxt(text) {
  const systems = new Set();
  let records = 0, direct = 0, reseller = 0;
  let managerdomain = null, ownerdomain = null;
  const contact = [];
  for (const raw of String(text || "").split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const fields = line.split(",").map((f) => f.trim());
    if (fields.length >= 3) {
      records++;
      systems.add(fields[0].toLowerCase());
      const kind = fields[2].toUpperCase();
      if (kind === "DIRECT") direct++;
      else if (kind === "RESELLER") reseller++;
      continue;
    }
    const eq = line.indexOf("=");
    if (eq > 0 && fields.length === 1) {
      const key = line.slice(0, eq).trim().toUpperCase();
      const value = line.slice(eq + 1).trim();
      if (key === "MANAGERDOMAIN" && managerdomain === null) managerdomain = value;
      else if (key === "OWNERDOMAIN" && ownerdomain === null) ownerdomain = value;
      else if (key === "CONTACT") contact.push(value);
    }
  }
  return { records, ad_systems: systems.size, direct, reseller, managerdomain, ownerdomain, contact };
}

export function looksLikeHtml(text) {
  return /^\s*</.test(String(text || ""));
}

// --- Initial HTML (SPEC §3.3) ---------------------------------------------------------

export function headerBidding(html) {
  const found = [];
  if (/prebid(\.min)?\.js/i.test(html) || /\bpbjs\b/.test(html)) found.push("prebid");
  if (/\bapstag\b/.test(html) || /c\.amazon-adsystem\.com/i.test(html)) found.push("amazon");
  return found;
}

export function hasGpt(html) {
  return /securepubads\.g\.doubleclick\.net\/tag\/js\/gpt\.js/i.test(html);
}

// --- Links and affiliate networks (SPEC §3.5) -----------------------------------------

export function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = (m[1] ?? m[2] ?? m[3] ?? "").replace(/&amp;/g, "&").trim();
    if (!href) continue;
    try {
      const u = new URL(href, baseUrl);
      if (u.protocol === "http:" || u.protocol === "https:") out.push(u);
    } catch { /* ignore unparseable links */ }
  }
  return out;
}

const hostIs = (host, domain) => host === domain || host.endsWith("." + domain);

export const NETWORKS = [
  { network: "skimlinks", patterns: ["go.skimresources.com", "go.redirectingat.com"] },
  { network: "awin", patterns: ["awin1.com"] },
  { network: "partnerize", patterns: ["prf.hn"] },
  { network: "sovrn", patterns: ["redirect.viglink.com", "sovrn.co"] },
  { network: "amazon", patterns: ["amzn.to"], amazonTag: true },
  { network: "rakuten", patterns: ["click.linksynergy.com"] },
  { network: "cj", patterns: ["anrdoezrs.net", "jdoqocy.com", "tkqlhce.com", "dpbolvw.net", "kqzyfj.com"] }
];

export function affiliateEvidence(links, page) {
  const evidence = [];
  const seen = new Set();
  for (const u of links) {
    const host = u.hostname.toLowerCase();
    for (const n of NETWORKS) {
      if (seen.has(n.network)) continue;
      let pattern = n.patterns.find((p) => hostIs(host, p));
      if (!pattern && n.amazonTag && /(^|\.)amazon\.[a-z.]+$/.test(host) && u.searchParams.has("tag")) pattern = "amazon.* with tag=";
      if (pattern) {
        seen.add(n.network);
        evidence.push({ network: n.network, pattern, page });
      }
    }
  }
  return evidence;
}

// --- JSON-LD (SPEC §3.2) --------------------------------------------------------------

const WANTED_TYPES = ["ItemList", "Product", "Review"];

export function schemaTypes(html) {
  const found = new Set();
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    walk(data, (node) => {
      const t = node["@type"];
      for (const v of Array.isArray(t) ? t : [t]) {
        if (typeof v !== "string") continue;
        const name = v.replace(/^https?:\/\/schema\.org\//, "");
        if (WANTED_TYPES.includes(name)) found.add(name);
      }
    });
  }
  return WANTED_TYPES.filter((t) => found.has(t));
}

function walk(node, fn, depth = 0) {
  if (!node || typeof node !== "object" || depth > 20) return;
  if (Array.isArray(node)) { for (const n of node) walk(n, fn, depth + 1); return; }
  fn(node);
  for (const v of Object.values(node)) if (v && typeof v === "object") walk(v, fn, depth + 1);
}

// --- Sitemaps (SPEC §3.2) -------------------------------------------------------------

export function parseSitemap(xml) {
  const text = String(xml || "");
  const isIndex = /<sitemapindex[\s>]/i.test(text);
  const locs = [];
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(text))) locs.push(m[1].replace(/&amp;/g, "&").trim());
  return { isIndex, locs };
}

export function pickChildSitemap(locs) {
  return locs.find((l) => /post|article|content|review|guide/i.test(l)) || locs[0] || null;
}

export const SLUG_RE = /(^|[-/])(best|top-?\d+|vs|versus|review|reviews|buying-guide|compared|alternatives)([-/]|$)/i;

export function slugMatches(url) {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    return SLUG_RE.test(path);
  } catch {
    return false;
  }
}

// --- CDN headers (SPEC §3.6) ----------------------------------------------------------

export function detectCdn(headers) {
  const h = (name) => (headers && headers.get(name)) || "";
  const names = headers ? [...headers.keys()].map((k) => k.toLowerCase()) : [];
  const providers = [];
  const evidence = [];
  const hit = (provider, header) => {
    if (!providers.includes(provider)) providers.push(provider);
    if (!evidence.includes(header)) evidence.push(header);
  };
  const server = h("server").toLowerCase();
  const via = h("via").toLowerCase();

  if (h("cf-ray")) hit("cloudflare", "cf-ray");
  if (server === "cloudflare") hit("cloudflare", "server: cloudflare");

  if (h("x-fastly-request-id")) hit("fastly", "x-fastly-request-id");
  for (const n of names) if (n.startsWith("fastly-")) hit("fastly", n);
  if (/^cache-/i.test(h("x-served-by")) && via.includes("varnish")) hit("fastly", "x-served-by + via: varnish");

  if (h("x-amz-cf-id")) hit("cloudfront", "x-amz-cf-id");
  if (h("x-amz-cf-pop")) hit("cloudfront", "x-amz-cf-pop");
  if (via.includes("cloudfront")) hit("cloudfront", "via: cloudfront");

  if (server === "akamaighost") hit("akamai", "server: AkamaiGHost");
  for (const n of names) if (n.startsWith("x-akamai-")) hit("akamai", n);

  if (h("x-vercel-id")) hit("vercel", "x-vercel-id");

  return providers.length ? { providers, evidence_headers: evidence } : { providers: ["unidentified"], evidence_headers: [] };
}
