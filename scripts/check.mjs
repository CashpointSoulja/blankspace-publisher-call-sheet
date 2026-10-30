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

// Stored live checks quote publishers' robots.txt verbatim, and robots.txt names crawlers and
// their operators. Exactly two fields are exempt, because they are the publisher's own words:
// signals.reachability.excerpt (and content_signal) and the keys of per_agent. Everything else
// in the file, and every page, is still scanned. The evidence itself is never altered.
const EVIDENCE_FILE = /^data\/evidence\/[^/]+\.json$/;
function withoutRobotsQuotes(text) {
  let ev;
  try { ev = JSON.parse(text); } catch { return text; }
  const re = ev && ev.signals && ev.signals.reachability;
  if (!re) return text;
  const copy = structuredClone(ev);
  const r = copy.signals.reachability;
  if (Array.isArray(r.excerpt)) r.excerpt = r.excerpt.map(() => "");
  if (Array.isArray(r.content_signal)) r.content_signal = r.content_signal.map(() => "");
  if (r.per_agent && typeof r.per_agent === "object") r.per_agent = Object.values(r.per_agent);
  return JSON.stringify(copy, null, 2);
}

for (const f of TEXT_FILES) {
  if (f === SELF) continue;
  const text = EVIDENCE_FILE.test(f) ? withoutRobotsQuotes(read(f)) : read(f);
  for (const h of attributionHits(text, f)) fail("attribution", `${f}: ${h}`);
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
// Files the site reads only if present. Their contents are checked in the data section.
const OPTIONAL = new Set(["/data/evidence-index.json"]);
const idCache = new Map();
const idsIn = (file) => {
  if (!idCache.has(file)) idCache.set(file, new Set([...read(file).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idCache.get(file);
};

function resolveInternal(href) {
  const [pathPart] = href.split(/[?#]/);
  if (!pathPart || OPTIONAL.has(pathPart)) return { ok: true };
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
  // The call sheet finds stored checks through data/evidence-index.json: it must list exactly
  // the files present, or the page would show a check as missing or fetch one that isn't there.
  const indexPath = "data/evidence-index.json";
  const evidenceIndex = FILES.includes(indexPath) ? checkJson(indexPath, "evidence-index") : null;
  const stored = Object.keys(data.evidence).sort();
  const indexed = evidenceIndex ? evidenceIndex.domains.slice().sort() : [];
  if (stored.length && !evidenceIndex) fail("data", `${stored.length} stored check(s) but no ${indexPath}`);
  else {
    for (const d of stored) if (!indexed.includes(d)) fail("data", `${indexPath}: evidence/${d}.json is not listed`);
    for (const d of indexed) if (!stored.includes(d)) fail("data", `${indexPath}: lists ${d}, which has no evidence file`);
  }
  for (const [domain, ev] of Object.entries(data.evidence)) {
    if (!ev) continue;
    if (ev.domain !== domain) fail("data", `evidence/${domain}.json: domain field is ${ev.domain}`);
    if (!data.readership.some((r) => r.domain === domain)) warn("data", `evidence/${domain}.json is not a sample publisher, so the call sheet ignores it`);
  }
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

  // Drafts and verifier logs (SPEC §8.6, §8.7, §9). The verifier resolves every claim against the
  // same evidence the page shows, so a published draft must equal its output.
  // Published drafts must be exactly what the verifier makes from outreach/ (ran_at aside).
  try {
    const { expectedDrafts, verifierExample } = await import("./drafts-lib.mjs");
    const expected = expectedDrafts(ROOT, "compare");
    const sources = new Set(expected.map((e) => e.domain));
    for (const e of expected) {
      const d = data.drafts[e.domain];
      const v = data.verifier[e.domain];
      if (!d || JSON.stringify(d) !== JSON.stringify(e.draft)) fail("drafts", `data/drafts/${e.domain}.json is not the verifier's output for outreach/${e.domain}.json; run node scripts/verify-drafts.mjs`);
      if (!v || JSON.stringify({ ...v, ran_at: null }) !== JSON.stringify({ ...e.log, ran_at: null })) fail("drafts", `data/verifier/${e.domain}.json is out of date; run node scripts/verify-drafts.mjs`);
    }
    for (const d of new Set([...Object.keys(data.drafts), ...Object.keys(data.verifier)])) {
      if (!sources.has(d)) fail("drafts", `data/drafts or data/verifier has ${d}, with no outreach/${d}.json source`);
    }
    if (JSON.stringify(data.front?.verifier_example ?? null) !== JSON.stringify(verifierExample(expected))) fail("drafts", "front.json verifier_example is stale; run node scripts/verify-drafts.mjs");
  } catch (e) {
    fail("drafts", `verifier could not run: ${e.message}`);
  }
  for (const [domain, draft] of Object.entries(data.drafts)) {
    if (draft && /[\w.+-]+@[\w-]+\.[\w.]+/.test(draft.body)) fail("drafts", `drafts/${domain}.json: contact details in the body`);
  }

  // Dated corrections (data/corrections.json) and manual qualification (data/qualification.json).
  const corrections = FILES.includes("data/corrections.json") ? checkJson("data/corrections.json", "corrections") : null;
  for (const c of (corrections && corrections.corrections) || []) {
    const d = data.domains[c.domain];
    if (!d) fail("data", `corrections.json: ${c.domain} is not in domains.json`);
    else if (d.class !== c.from) fail("data", `corrections.json: ${c.domain} is ${d.class} as collected, not ${c.from}`);
  }
  const corrected = new Map(((corrections && corrections.corrections) || []).map((c) => [c.domain, c]));
  const qualification = FILES.includes("data/qualification.json") ? checkJson("data/qualification.json", "qualification") : null;
  for (const a of (qualification && qualification.accounts) || []) {
    const at = `qualification.json ${a.account}`;
    for (const dom of a.domains) if (!data.domains[dom]) fail("data", `${at}: ${dom} is not in domains.json`);
    const gate = (g) => a.gates.find((x) => x.gate === g);
    if (a.decision === "ready_for_discovery") {
      if (!gate("commercial_route") || gate("commercial_route").status !== "passed") fail("data", `${at}: ready for discovery needs a verified commercial route`);
      if (a.gates.some((g) => g.status === "failed")) fail("data", `${at}: a failed gate can't be ready for discovery`);
      if (!a.next_question || !a.success_criteria_30d.length) fail("data", `${at}: needs a next question and 30-day criteria`);
      for (const dom of a.domains) if (corrected.has(dom) && corrected.get(dom).to !== "publisher") fail("data", `${at}: ${dom} was reclassified, so it can't be ready`);
    }
    if (a.decision === "hold" && !a.release_condition) fail("data", `${at}: a hold needs a release condition`);
    for (const dom of a.domains) if (corrected.has(dom) && corrected.get(dom).to !== "publisher" && a.decision !== "exclude") fail("data", `${at}: ${dom} was reclassified away from publisher; mark it excluded`);
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(JSON.stringify(a))) fail("data", `${at}: no contact details in qualification records`);
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
  if (!Object.keys(data.evidence).length) warn("gap", "no stored live checks in data/evidence/; live signals show as not collected");
}

// --- Report -----------------------------------------------------------------------------------

for (const w of warnings) console.log(`warn  ${w}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`\n${failures.length ? "FAILED" : "passed"}: ${failures.length} failure(s), ${warnings.length} warning(s)${RELEASE ? " (release mode)" : ""}. ${TEXT_FILES.length} text files, ${PAGES.length} pages.`);
process.exit(failures.length ? 1 : 0);
