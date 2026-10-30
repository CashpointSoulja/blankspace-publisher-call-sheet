#!/usr/bin/env node
// Build checks. Any failure exits 1. Run from anywhere:
//
//   node scripts/check.mjs            standing rules, links, data schemas
//   node scripts/check.mjs --release  also fails on placeholders (empty sample, unchecked
//                                     agents, unsourced company claims)
//
// No dependencies.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE = process.argv.includes("--release");
const SELF = "scripts/check.mjs";

const failures = [];
const warnings = [];
const fail = (area, msg) => failures.push(`[${area}] ${msg}`);
const warn = (area, msg) => warnings.push(`[${area}] ${msg}`);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

// --- Files --------------------------------------------------------------------------------

function listFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8" });
    return out.split("\0").filter(Boolean).filter((f) => existsSync(path.join(ROOT, f)));
  } catch {
    const walk = (dir) => readdirSync(path.join(ROOT, dir)).flatMap((n) => {
      const rel = dir ? `${dir}/${n}` : n;
      if (["node_modules", ".git", ".wrangler"].includes(n)) return [];
      return statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
    });
    return walk("");
  }
}

const FILES = listFiles();
const TEXT_EXT = /\.(html|css|js|mjs|cjs|json|jsonl|md|toml|txt|csv|svg|yml|yaml)$|(^|\/)(_headers|_redirects|\.gitignore)$/;
const TEXT_FILES = FILES.filter((f) => TEXT_EXT.test(f));
const HTML_FILES = FILES.filter((f) => f.endsWith(".html"));
const SITE_JS = FILES.filter((f) => f.startsWith("assets/js/") && f.endsWith(".js"));
const MD_FILES = FILES.filter((f) => f.endsWith(".md") && !f.startsWith("research/"));

// --- 1. No AI, model or tool attribution --------------------------------------------------
// Patterns are assembled from fragments so this file does not contain the strings it bans.

const j = (...p) => p.join("");
const ASSISTANT = j("cla", "ude");
const VENDOR = j("anthr", "opic");
const CRAWLER_TOKENS = new RegExp(`\\b${ASSISTANT}(bot|-searchbot|-user)\\b`, "gi");

const ATTRIBUTION = [
  { name: "assistant name", re: new RegExp(`\\b${ASSISTANT}\\b`, "i"), stripTokens: true },
  { name: "assistant vendor", re: new RegExp(VENDOR, "i"), allow: ["data/agents.json"] },
  { name: "model name", re: new RegExp(`\\b(${[j("son", "net"), j("op", "us"), j("hai", "ku"), j("fab", "le")].join("|")})\\b`, "i"), allowPrefix: ["data/", "research/"] },
  { name: "coding tool name", re: new RegExp(`\\b(${[j("Co", "pilot"), j("Co", "dex"), j("Cur", "sor"), j("Wind", "surf"), j("Ai", "der"), j("Lov", "able"), j("De", "vin")].join("|")})\\b`) },
  { name: "AI-generated label", re: new RegExp(j("\\bAI[- ]gen", "erated\\b"), "i") },
  { name: "generated-by line", re: new RegExp(j("\\bgen", "erated (by|with|using)\\b"), "i") },
  { name: "written-by-AI line", re: new RegExp(j("\\b(written|created|built) (by|with) (an )?", "AI\\b"), "i") },
  { name: "co-author trailer", re: new RegExp(j("co-auth", "ored-by"), "i") },
  { name: "generator meta tag", re: new RegExp(j("<meta[^>]+name=[\"']?gen", "erator"), "i") }
];

function attributionHits(text, file) {
  const hits = [];
  for (const rule of ATTRIBUTION) {
    if (rule.allow && rule.allow.includes(file)) continue;
    if (rule.allowPrefix && file && rule.allowPrefix.some((p) => file.startsWith(p))) continue;
    // Crawler product tokens are data (SPEC §4): the agent list and the per-agent results in
    // evidence files. The bare name stays forbidden everywhere, including there.
    const allowTokens = Boolean(file) && (file.startsWith("data/") || file === "SPEC.md" || file.startsWith("research/"));
    const subject = rule.stripTokens && allowTokens ? text.replace(CRAWLER_TOKENS, "") : text;
    const m = rule.re.exec(subject);
    if (m) {
      const line = subject.slice(0, m.index).split("\n").length;
      hits.push(`${rule.name} at line ${line}: “${m[0]}”`);
    }
  }
  return hits;
}

for (const f of TEXT_FILES) {
  if (f === SELF) continue;
  for (const h of attributionHits(read(f), f)) fail("attribution", `${f}: ${h}`);
}

try {
  const log = execFileSync("git", ["log", "--format=%H%x00%an <%ae>%x00%cn <%ce>%x00%B%x01"], { cwd: ROOT, encoding: "utf8" });
  for (const entry of log.split("\x01").map((s) => s.trim()).filter(Boolean)) {
    const [hash, author, committer, body] = entry.split("\x00");
    const text = `${author}\n${committer}\n${body}`;
    for (const h of attributionHits(text, null)) fail("attribution", `commit ${hash.slice(0, 7)}: ${h}`);
    if (!/^Ayo Ahmed </.test(author)) fail("attribution", `commit ${hash.slice(0, 7)}: author is “${author}”, expected Ayo Ahmed`);
  }
} catch {
  warn("attribution", "git log unavailable; commit messages not checked");
}

// --- 2. Tone: no exclamation marks, British spellings ---------------------------------------

function visibleHtmlText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|pre|code)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
}

function jsStrings(src) {
  const out = [];
  const re = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = re.exec(src))) out.push(m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, " "));
  return out.join("\n");
}

function mdProse(md) {
  return md.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
}

const US_SPELLINGS = /\b(monetiz\w*|personaliz\w*|optimiz\w*|analyz\w*|organiz\w*|prioritiz\w*|recogniz\w*|summariz\w*|customiz\w*|standardiz\w*|behavior\w*|favorite\w*|catalog|catalogs)\b/i;

const toneSources = [
  ...HTML_FILES.map((f) => [f, visibleHtmlText(read(f))]),
  ...SITE_JS.map((f) => [f, jsStrings(read(f))]),
  ...MD_FILES.map((f) => [f, mdProse(read(f))])
];
for (const [f, text] of toneSources) {
  const clean = text.replace(/https?:\/\/\S+/g, " ");
  const bang = /[A-Za-z0-9’”)][!](\s|$)/.exec(clean);
  if (bang) fail("tone", `${f}: exclamation mark near “${clean.slice(Math.max(0, bang.index - 30), bang.index + 2).trim()}”`);
  const us = US_SPELLINGS.exec(clean);
  if (us) fail("tone", `${f}: US spelling “${us[0]}”`);
}

// --- 3. Page rules ----------------------------------------------------------------------------

const NOINDEX = /<meta\s+name="robots"\s+content="noindex,\s*nofollow"\s*>/i;
const FOOTER = "Unofficial concept, not affiliated with blankspace.";
const PAGES = HTML_FILES.filter((f) => !f.startsWith("research/") && !f.startsWith("worker/"));
for (const f of PAGES) {
  const html = read(f);
  if (!NOINDEX.test(html)) fail("pages", `${f}: missing <meta name="robots" content="noindex, nofollow">`);
  if (!html.includes(FOOTER)) fail("pages", `${f}: missing footer label “${FOOTER}”`);
  if (!/<html lang="en-GB">/.test(html)) fail("pages", `${f}: html lang should be en-GB`);
}
if (existsSync(path.join(ROOT, "index.html"))) {
  const front = read("index.html");
  for (const phrase of ["not affiliated with blankspace", "Citation data is a dated sample", "live checks read public files only", "nothing here can send email"]) {
    if (!front.includes(phrase)) fail("pages", `index.html: honest-framing line is missing “${phrase}” (SPEC §10.1)`);
  }
}
const methodHtml = existsSync(path.join(ROOT, "method/index.html")) ? read("method/index.html") : "";
if (!/no send function anywhere in the codebase/i.test(methodHtml)) fail("pages", "method/index.html must state plainly that there is no send function");
if ((methodHtml.match(/Results vary from run to run\./g) || []).length !== 1) fail("pages", "method/index.html must say “Results vary from run to run.” exactly once (SPEC §10.4)");
if (!/id="crawler"/.test(methodHtml)) fail("pages", "method/index.html needs #crawler, the user-agent points there");
if (!existsSync(path.join(ROOT, "robots.txt")) || !/Disallow:\s*\/\s*$/m.test(read("robots.txt"))) fail("pages", "robots.txt must disallow everything (SPEC §0)");

// blankspace figures only through data/company-claims.json (SPEC §8.5, §10.8)
const FIGURES = /\$\s?15\b|\b98\s?%|\b282\s?%|\b5x\b/i;
for (const f of [...PAGES, ...SITE_JS]) {
  const text = f.endsWith(".html") ? visibleHtmlText(read(f)) : jsStrings(read(f));
  const m = FIGURES.exec(text);
  if (m) fail("claims", `${f}: blankspace figure “${m[0]}” written directly; it must come from data/company-claims.json with its source`);
}

// --- 4. No send or outreach capability ------------------------------------------------------

const SEND = [
  /mailto:/i, /nodemailer/i, /sendgrid/i, /mailgun/i, /postmark/i, /\bsmtp\b/i, /sendBeacon/,
  /\bsend(Mail|Email|Message)\b/i, /api\.resend\.com/i, /hooks\.slack\.com/i, /api\.twilio\.com/i,
  /method\s*:\s*["'](POST|PUT|PATCH|DELETE)["']/i, /<form[^>]+method=["']?post/i
];
const CODE = FILES.filter((f) => /\.(js|mjs|html|toml)$/.test(f) && !f.startsWith("worker/test/") && !f.startsWith("research/") && f !== SELF && !f.includes("node_modules"));
for (const f of CODE) {
  const src = read(f);
  for (const re of SEND) {
    const m = re.exec(src);
    if (m) fail("no-send", `${f}: “${m[0]}” looks like send or write capability`);
  }
}
for (const f of FILES.filter((x) => x.startsWith("worker/src/"))) {
  const src = read(f);
  if (/Mozilla\/|Chrome\/|Safari\//.test(src)) fail("crawler", `${f}: a browser user-agent string appears; the crawler must identify itself honestly`);
}
if (existsSync(path.join(ROOT, "worker/src/check.js")) && !read("worker/src/check.js").includes("AyoGTMResearch/0.1 (+")) {
  fail("crawler", "worker/src/check.js: honest user-agent AyoGTMResearch/0.1 (+{site}/method#crawler) not found");
}

// --- 5. Internal links ------------------------------------------------------------------------

const DYNAMIC = [/^\/p\/[^/]+\/$/, /^\/api\//];
const idCache = new Map();
const idsIn = (file) => {
  if (!idCache.has(file)) idCache.set(file, new Set([...read(file).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idCache.get(file);
};

function resolveInternal(href) {
  const [pathPart] = href.split(/[?#]/);
  if (!pathPart) return { ok: true };
  if (DYNAMIC.some((re) => re.test(pathPart))) {
    return { ok: existsSync(path.join(ROOT, "p/index.html")) || pathPart.startsWith("/api/"), file: null };
  }
  const rel = pathPart.replace(/^\//, "");
  const candidates = pathPart.endsWith("/") ? [`${rel}index.html`] : [rel, `${rel}/index.html`, `${rel}.html`];
  const found = candidates.find((c) => existsSync(path.join(ROOT, c)) && statSync(path.join(ROOT, c)).isFile());
  return { ok: Boolean(found), file: found, needsSlash: !pathPart.endsWith("/") && found && found.endsWith("/index.html") && !rel.includes(".") };
}

function checkLink(from, href, fromFile) {
  if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(href) || href.startsWith("//")) return;
  if (href.includes("${") || href.includes("{")) return;
  if (href.startsWith("#")) {
    const id = href.slice(1);
    if (id && fromFile && !idsIn(fromFile).has(id)) fail("links", `${from}: #${id} has no matching id on the page`);
    return;
  }
  if (!href.startsWith("/")) return;
  const r = resolveInternal(href);
  if (!r.ok) { fail("links", `${from}: ${href} does not resolve to a file`); return; }
  if (r.needsSlash) warn("links", `${from}: ${href} redirects; link to ${href.split(/[?#]/)[0]}/ instead`);
  const hash = href.includes("#") ? href.split("#")[1] : null;
  if (hash && r.file && r.file.endsWith(".html") && !idsIn(r.file).has(hash)) fail("links", `${from}: ${href} — no id="${hash}" in ${r.file}`);
}

for (const f of PAGES) {
  const html = read(f);
  for (const m of html.matchAll(/\s(?:href|src|action)="([^"]*)"/g)) checkLink(f, m[1], f);
}
for (const f of SITE_JS) {
  for (const m of read(f).matchAll(/["'`](\/(?:data|assets|targets|check|pilots|plan|method|p)\b[^"'`\s]*)["'`]/g)) checkLink(f, m[1], null);
}
for (const f of MD_FILES) {
  for (const m of read(f).matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const target = path.normalize(path.join(path.dirname(f), href.split("#")[0]));
    if (!existsSync(path.join(ROOT, target))) fail("links", `${f}: ${href} does not exist`);
  }
}

// --- 6. Data against schemas ------------------------------------------------------------------

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function validate(value, schema, root, at = "") {
  const errs = [];
  if (schema.$ref) return validate(value, schema.$ref.replace(/^#\//, "").split("/").reduce((a, k) => a[k], root), root, at);
  const t = typeOf(value);
  if (schema.type) {
    const types = [].concat(schema.type);
    const ok = types.includes(t) || (t === "integer" && types.includes("number"));
    if (!ok) return [`${at || "/"}: expected ${types.join(" or ")}, got ${t}`];
  }
  if (schema.const !== undefined && value !== schema.const) errs.push(`${at}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.map((x) => JSON.stringify(x)).join(", ")}`);
  if (t === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${at}: “${value}” does not match ${schema.pattern}`);
    if (schema.minLength && value.length < schema.minLength) errs.push(`${at}: too short`);
  }
  if ((t === "number" || t === "integer")) {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${at}: above ${schema.maximum}`);
  }
  if (t === "array") {
    if (schema.minItems && value.length < schema.minItems) errs.push(`${at}: needs at least ${schema.minItems} items`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(v, schema.items, root, `${at}/${i}`)));
  }
  if (t === "object") {
    for (const k of schema.required || []) if (!(k in value)) errs.push(`${at}/${k}: required`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties && k in schema.properties) errs.push(...validate(v, schema.properties[k], root, `${at}/${k}`));
      else if (schema.additionalProperties === false) errs.push(`${at}/${k}: not allowed by the schema`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") errs.push(...validate(v, schema.additionalProperties, root, `${at}/${k}`));
    }
  }
  return errs;
}

const schema = (name) => JSON.parse(read(`data/schema/${name}.schema.json`));
const data = {};

function checkJson(rel, schemaName) {
  let value;
  try {
    value = JSON.parse(read(rel));
  } catch (e) {
    fail("data", `${rel}: not valid JSON (${e.message})`);
    return null;
  }
  const s = schema(schemaName);
  for (const e of validate(value, s, s)) fail("data", `${rel}${e}`);
  return value;
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

if (existsSync(path.join(ROOT, "data"))) {
  data.front = checkJson("data/front.json", "front");
  data.sample = checkJson("data/sample.json", "sample");
  data.readership = checkJson("data/readership.json", "readership") || [];
  data.queries = checkJson("data/queries.json", "queries") || [];
  data.domains = checkJson("data/domains.json", "domains") || {};
  data.agents = checkJson("data/agents.json", "agents");
  data.claims = checkJson("data/company-claims.json", "company-claims") || [];

  const dirFiles = (dir) => FILES.filter((f) => f.startsWith(`data/${dir}/`) && f.endsWith(".json"));
  data.evidence = Object.fromEntries(dirFiles("evidence").map((f) => [path.basename(f, ".json"), checkJson(f, "evidence")]));
  data.drafts = Object.fromEntries(dirFiles("drafts").map((f) => [path.basename(f, ".json"), checkJson(f, "draft")]));
  data.verifier = Object.fromEntries(dirFiles("verifier").map((f) => [path.basename(f, ".json"), checkJson(f, "verifier")]));
  const S = data.sample || {};

  // citation-sample.csv (SPEC §8.3)
  const CSV_HEAD = ["probe_id", "sample_id", "date_utc", "engine", "run", "vertical", "query_id", "query", "location", "logged_in", "citation_rank", "cited_url", "cited_domain", "domain_class"];
  const [head, ...body] = parseCSV(read("data/citation-sample.csv"));
  if (!head || head.join(",") !== CSV_HEAD.join(",")) fail("data", `data/citation-sample.csv: header must be exactly ${CSV_HEAD.join(",")}`);
  const csv = [];
  body.forEach((cols, i) => {
    if (cols.length !== CSV_HEAD.length) { fail("data", `citation-sample.csv line ${i + 2}: expected ${CSV_HEAD.length} columns, found ${cols.length}`); return; }
    csv.push(Object.fromEntries(CSV_HEAD.map((h, k) => [h, cols[k]])));
  });
  const queryById = Object.fromEntries(data.queries.map((q) => [q.id, q]));
  const citedBy = new Map(); // probe_id -> Set(domain)
  for (const [i, r] of csv.entries()) {
    const at = `citation-sample.csv line ${i + 2}`;
    if (S.sample_id && r.sample_id !== S.sample_id) fail("data", `${at}: sample_id ${r.sample_id} is not ${S.sample_id}`);
    if (S.dates_utc && !S.dates_utc.includes(r.date_utc)) fail("data", `${at}: date ${r.date_utc} is not a sample date`);
    const q = queryById[r.query_id];
    if (!q) fail("data", `${at}: query_id ${r.query_id} is not in queries.json`);
    else if (q.q !== r.query || q.vertical !== r.vertical) fail("data", `${at}: query text or vertical differs from queries.json ${r.query_id}`);
    if (!citedBy.has(r.probe_id)) citedBy.set(r.probe_id, new Set());
    if (r.cited_url) {
      const d = data.domains[r.cited_domain];
      if (!d) fail("data", `${at}: ${r.cited_domain} is not classified in domains.json`);
      else if (d.class !== r.domain_class) fail("data", `${at}: ${r.cited_domain} is ${r.domain_class} here but ${d.class} in domains.json`);
      citedBy.get(r.probe_id).add(r.cited_domain);
    }
  }
  const withUrl = csv.filter((r) => r.cited_url);

  // raw/probes.jsonl
  const probesFile = "data/raw/probes.jsonl";
  const probes = existsSync(path.join(ROOT, probesFile))
    ? read(probesFile).split("\n").filter(Boolean).map((l, i) => { try { return JSON.parse(l); } catch { fail("data", `${probesFile} line ${i + 1}: not valid JSON`); return null; } }).filter(Boolean)
    : (fail("data", `${probesFile} is missing`), []);
  const probeIds = new Set(probes.map((p) => p.probe_id));
  if (probeIds.size !== probes.length) fail("data", `${probesFile}: duplicate probe_id`);
  for (const p of probes) {
    if (S.sample_id && p.sample_id !== S.sample_id) fail("data", `${probesFile} ${p.probe_id}: sample_id differs`);
    if (!citedBy.has(p.probe_id)) fail("data", `${probesFile} ${p.probe_id}: no rows in citation-sample.csv`);
    else if ((p.citations || []).length !== csv.filter((r) => r.probe_id === p.probe_id && r.cited_url).length) fail("data", `${probesFile} ${p.probe_id}: citation count differs from the CSV`);
  }
  for (const id of citedBy.keys()) if (!probeIds.has(id)) fail("data", `citation-sample.csv: probe ${id} is not in ${probesFile}`);

  // sample.json figures, recomputed from the raw files
  if (data.sample) {
    if (S.queries !== data.queries.length) fail("data", `sample.json queries ${S.queries} ≠ ${data.queries.length} in queries.json`);
    if (S.probes !== probes.length) fail("data", `sample.json probes ${S.probes} ≠ ${probes.length} in ${probesFile}`);
    if (S.probes !== S.queries * S.engines.length * S.runs_per_query) fail("data", "sample.json probes ≠ queries × engines × runs_per_query");
    if (S.total_citations !== withUrl.length) fail("data", `sample.json total_citations ${S.total_citations} ≠ ${withUrl.length} CSV rows with a URL`);
    if (S.unique_domains !== Object.keys(data.domains).length) fail("data", `sample.json unique_domains ≠ ${Object.keys(data.domains).length} in domains.json`);
    const publishers = Object.values(data.domains).filter((d) => d.class === "publisher").length;
    if (S.publishers_cited !== publishers) fail("data", `sample.json publishers_cited ${S.publishers_cited} ≠ ${publishers} publishers in domains.json`);
    for (const b of S.citation_buckets) {
      const n = withUrl.filter((r) => r.domain_class === b.class).length;
      if (b.count !== n) fail("data", `sample.json bucket ${b.class}: count ${b.count} ≠ ${n} in the CSV`);
      if (!near(b.share, n / withUrl.length, 0.0001)) fail("data", `sample.json bucket ${b.class}: share ${b.share} ≠ ${(n / withUrl.length).toFixed(4)}`);
    }
    const cost = probes.reduce((a, p) => a + (p.cost_usd || 0), 0);
    if (typeof S.collection_cost_usd === "number" && !near(cost, S.collection_cost_usd, 0.0001)) fail("data", `sample.json collection_cost_usd ${S.collection_cost_usd} ≠ ${cost.toFixed(4)} summed from ${probesFile}`);
  }
  if (new Set(data.queries.map((q) => q.id)).size !== data.queries.length) fail("data", "queries.json: duplicate id");

  // readership.json (SPEC §3.1)
  if (data.readership.length !== S.publishers_cited) fail("data", `readership.json has ${data.readership.length} rows; sample.json says ${S.publishers_cited} publishers`);
  const seen = new Set();
  for (const r of data.readership) {
    const at = `readership.json ${r.domain}`;
    if (seen.has(r.domain)) fail("data", `${at}: duplicate`);
    seen.add(r.domain);
    const d = data.domains[r.domain];
    if (!d || d.class !== "publisher") fail("data", `${at}: only publisher-class domains are ranked`);
    // probe_ids lists every probe citing the domain, in any vertical; the share counts only its own.
    const probeById = new Map(probes.map((p) => [p.probe_id, p]));
    const inVertical = r.probe_ids.filter((id) => probeById.get(id) && probeById.get(id).vertical === r.vertical).length;
    if (probes.length && inVertical !== r.probes_cited_in_vertical) fail("data", `${at}: ${inVertical} probe ids in ${r.vertical} but probes_cited_in_vertical is ${r.probes_cited_in_vertical}`);
    const allCiting = [...citedBy].filter(([, ds]) => ds.has(r.domain)).length;
    if (allCiting !== r.probe_ids.length) fail("data", `${at}: ${r.probe_ids.length} probe ids, but ${allCiting} probes cite it in the CSV`);
    if (!near(r.share, r.probes_cited_in_vertical / r.vertical_probes_total, 0.0005)) fail("data", `${at}: share ≠ probes_cited_in_vertical ÷ vertical_probes_total`);
    if (!near(r.s_citation_share, Math.min(1, r.share / 0.25), 1e-9)) fail("data", `${at}: s_citation_share ≠ min(1, share ÷ 0.25)`);
    const total = probes.filter((p) => p.vertical === r.vertical).length;
    if (probes.length && r.vertical_probes_total !== total) fail("data", `${at}: vertical_probes_total ${r.vertical_probes_total} ≠ ${total} probes in ${r.vertical}`);
    for (const id of r.probe_ids) {
      if (!citedBy.get(id) || !citedBy.get(id).has(r.domain)) fail("data", `${at}: probe ${id} does not cite it in citation-sample.csv`);
    }
  }

  // agents.json (SPEC §4)
  for (const a of data.agents?.agents || []) {
    if (a.verified === false && (!a.note || !a.corroboration_url)) fail("data", `agents.json ${a.token}: unverified tokens need a note and a corroboration_url`);
    if (a.verified === true && !a.doc_url) fail("data", `agents.json ${a.token}: verified tokens need the vendor doc_url`);
  }

  // company-claims.json (SPEC §8.5)
  const claimIds = new Set(data.claims.map((c) => c.id));
  for (const id of ["cpm", "pickup", "sole-supplier-growth", "sole-supplier-referrals"]) {
    if (!claimIds.has(id)) fail("data", `company-claims.json: missing entry “${id}”`);
  }

  // Drafts and verifier logs (SPEC §8.6, §8.7, §9)
  const pointer = (obj, ptr) => ptr.split("/").slice(1).reduce((a, k) => (a == null ? undefined : a[k.replace(/~1/g, "/").replace(/~0/g, "~")]), obj);
  for (const [domain, draft] of Object.entries(data.drafts)) {
    if (!draft) continue;
    const row = data.readership.find((r) => r.domain === domain);
    const ev = data.evidence[domain] || (row ? { signals: { readership: { status: "in_sample", share: row.share, probes_cited: row.probes_cited_in_vertical, probes_total: row.vertical_probes_total, stability: row.stability, probe_ids: row.probe_ids } } } : null);
    const draftIds = new Set(draft.claims.map((c) => c.id));
    for (const c of draft.claims) {
      if (c.type === "company_claim") {
        const cc = data.claims.find((x) => `company-claims#${x.id}` === c.ref);
        if (!cc) fail("data", `drafts/${domain}.json ${c.id}: ${c.ref} is not in company-claims.json`);
        else if (!cc.source_url) fail("data", `drafts/${domain}.json ${c.id}: cites ${cc.id}, which has no source_url`);
        else if (!c.text.includes(cc.required_phrasing)) fail("data", `drafts/${domain}.json ${c.id}: company claim must use “${cc.required_phrasing}”`);
      } else if (!ev || pointer(ev, c.ref) === undefined) {
        fail("data", `drafts/${domain}.json ${c.id}: ${c.ref} does not resolve in this domain's evidence`);
      }
    }
    for (const m of draft.body.matchAll(/\[\^(c\d+)\]/g)) if (!draftIds.has(m[1])) fail("data", `drafts/${domain}.json: body marker ${m[1]} has no claim`);
    const v = data.verifier[domain];
    if (!v) fail("data", `drafts/${domain}.json has no verifier/${domain}.json`);
    else for (const id of [...v.kept, ...v.tagged_company_claims]) if (!draftIds.has(id)) fail("data", `verifier/${domain}.json: ${id} is not a claim in the draft`);
  }
  const ex = data.front?.verifier_example;
  if (ex) {
    const v = data.verifier[ex.domain];
    if (!v || !v.removed.some((r) => r.text === ex.removed_text)) fail("data", "front.json verifier_example.removed_text must appear verbatim in that domain's verifier log");
  }

  // Release: no placeholders.
  const rel = RELEASE ? fail : warn;
  if (!data.sample) rel("placeholder", "sample.json missing");
  if (!data.readership.length) rel("placeholder", "readership.json has no rows");
  for (const c of data.claims) if (!c.source_url || !c.accessed) rel("placeholder", `company-claims.json: ${c.id} has no source; pages will not show it`);
  if (!data.front?.builder?.repo_url) rel("placeholder", "front.json: builder.repo_url not set");
  // Not placeholders, but gaps worth seeing on every run.
  const unverified = (data.agents?.agents || []).filter((a) => !a.verified).map((a) => a.token);
  if (unverified.length) warn("gap", `agents.json: ${unverified.join(", ")} unverified on vendor pages (corroborated instead)`);
  if (!Object.keys(data.drafts).length) warn("gap", "no outreach drafts yet; evidence pages say so");
  if (!Object.keys(data.evidence).length) warn("gap", "no stored live checks in data/evidence/; live signals show as not collected");
}

// --- Report -----------------------------------------------------------------------------------

for (const w of warnings) console.log(`warn  ${w}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`\n${failures.length ? "FAILED" : "passed"}: ${failures.length} failure(s), ${warnings.length} warning(s)${RELEASE ? " (release mode)" : ""}. ${TEXT_FILES.length} text files, ${PAGES.length} pages.`);
process.exit(failures.length ? 1 : 0);
