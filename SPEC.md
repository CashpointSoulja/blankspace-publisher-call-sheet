# Publisher call sheet: build spec

Source of truth for the build. If code and this file disagree, this file wins until it is changed.

Unofficial concept by Ayo Ahmed for the blankspace Founding GTM Associate application. Not affiliated with blankspace.

---

## 0. Open decisions (owner: Ayo)

| Decision | Options | Default in code until decided |
|---|---|---|
| Site visibility | Public link vs unlisted or password | Public link, `<meta name="robots" content="noindex, nofollow">` on every page, plus `Disallow: /` in the site's own robots.txt |
| Citation sample size | Within the pre-approved ~$2 cap: fewer queries, one engine, or one run | Whatever was actually run, recorded in `sample.json` and `/method`. Never extrapolated |

---

## 1. Brand tokens

Measured values and the full component spec now live in `BRAND.md`, built from the owner-collected scrape in `research/`. Where this table and `BRAND.md` differ, `BRAND.md` wins.

### Colour

| Token | Value | Status |
|---|---|---|
| `--bg` | `rgb(0,0,0)` | Measured |
| `--text` | `rgba(255,255,255,0.92)` | Measured |
| `--heading` | `#ffffff` | Measured |
| `--accent` | `rgb(93,148,207)` | Measured. Pill buttons and highlighted stats |
| `--green` | `#3fb97a` | **Placeholder. Measure from live site.** Live status only |
| `--card` | `#0a1628` | **Placeholder. Measure dashboard card navy** |
| `--line` | `rgba(255,255,255,0.10)` | **Placeholder. Measure card border** |
| `--muted` | `rgba(255,255,255,0.62)` | Derived. Secondary text |
| `--on-accent` | `#ffffff` | **Check against live pill buttons.** If white, button text stays ≥ 19px bold to hold WCAG AA large-text contrast |

### Type

| Role | Face | Weight | Notes |
|---|---|---|---|
| Headings | Montserrat | 900 | White, tight line-height, slight negative tracking |
| Body | Nunito Sans | 400 / 600 | `--text` on `--bg` |
| Microcopy labels | Nunito Sans | 800 | Uppercase, wide tracking. Status tags, table headers, window titles only |
| Fallbacks | `"Helvetica Neue", Arial, sans-serif` | | Google Fonts is the only external dependency |

### Components

| Component | Spec |
|---|---|
| Wordmark | `/assets/logo-text-white.png` (1767 × 275, transparent). Always paired with an "Unofficial concept" pill |
| Pill button | `--accent` fill, fully rounded |
| Pill tabs | Small, rounded. Selected state is accent-tinted fill with accent border |
| Dashboard card | `--card` fill, 1px `--line` border, rounded |
| Window chrome | Mac three-dot bar on product-style panels (call sheet, scorecard) |
| Live dot | `--green`, the only animated element on the page; static under `prefers-reduced-motion` |
| Status tags | Uppercase microcopy: `DATED SAMPLE`, `LIVE`, `REMOVED`, `COMPANY CLAIM` |

### Usage rules

- Reuse blankspace component styles, never blankspace product vocabulary. No "AI Revenue", "monetise/observe" mode tags or similar on our own features, because that implies product functionality we don't have.
- Green appears only on live status. This build has no revenue data, so there are no green numbers.
- Tone: short declarative sentences, UK spelling, sentence case, no exclamation marks, typographic apostrophes and quotes in visible text.
- No generator or tool attribution anywhere: code, comments, meta tags, commit messages for shipped files.

---

## 2. Page map

| Route | Purpose | Data |
|---|---|---|
| `/` | Story: finding → assumption → scoring → live check → next steps → builder | `data/sample.json`, `data/readership.json`, `data/front.json` |
| `/targets` | Ranked call sheet, vertical filter, weight sliders that re-rank live | `data/readership.json` |
| `/p/{domain}` | Evidence page: raw signals, score breakdown, "why not higher", citation rows, angle, "can't see from outside", outreach draft and verifier log | `data/evidence/{domain}.json`, `data/drafts/{domain}.json`, `data/verifier/{domain}.json` |
| `/check?url=` | Live evidence page for any URL. Readership shows "Not in the dated sample ({date})"; score out of known maximum | Worker `/api/check` |
| `/pilots` | Pilot-health checklist, all questions, no data | Static |
| `/plan` | First 30 days, small-n testing argument, "if it's demand, not supply" (`#demand`) | Static |
| `/method` | Sample method, signal definitions, formulas, limitations, raw CSV download | Static + `data/citation-sample.csv` |

---

## 3. Scoring

Each signal produces a normalised sub-score `s ∈ [0,1]` or `null` (unknown). Points = `w × s`. Unknown signals are excluded from both the total and the maximum. They are never scored as zero.

```
total = Σ (w_i × s_i)   over known signals
max   = Σ w_i           over known signals
display: "{round(total)} / {max}"
```

Default weights: readership 40, placement 20, programmatic 15, reachability 10, commerce 15 (sum 100).

`/targets` ranks in-sample domains only, so every row has max 100. With custom slider weights it ranks by `Σ w_i s_i / Σ w_i`. A live check of an out-of-sample URL shows `x / 60`.

### 3.1 Citation share (w = 40, dated sample only)

Shown as "Citation share". It is citation frequency on this sample only: not measured agent traffic, readership, all-engine visibility or revenue. The data key stays `readership` in evidence objects and weights.

```
share_v(d)  = probes in vertical v whose citations include domain d / total probes in v
s_readership = min(1, share_v(d) / 0.25)
```

A domain's vertical is the one where its share is highest. Stability is `both_runs` if cited in every run of at least one (query, engine) pair; `one_run` if only ever cited in a single run; `single_run_only` if the sample had one run per query. Out of sample: `null`.

### 3.2 Placement fit (w = 20, live)

Sitemap source: the `Sitemap:` line in robots.txt, else `/sitemap.xml`. For a sitemap index, take the first child whose URL contains `post`, `article`, `content`, `review` or `guide`, else the first child. Read up to 50 `<loc>` URLs.

```
slug pattern (case-insensitive):
(^|[-/])(best|top-?\d+|vs|versus|review|reviews|buying-guide|compared|alternatives)([-/]|$)

slug_share  = matched / sampled
schema      = 1 if ItemList, Product or Review JSON-LD found on homepage or two sampled matched URLs, else 0
s_placement = 0.75 × min(1, slug_share / 0.30) + 0.25 × schema
```

No sitemap reachable: slug part is `null`, so `s_placement = schema` and `max` drops by 15.

### 3.3 Programmatic stack (w = 15, live)

```
s_programmatic = (ads_txt_present + (ad_systems ≥ 5) + header_bidding_detected) / 3
```

- ads.txt: `https://{registrable domain}/ads.txt`. Absent if non-200, or the body starts with `<` (soft 404). Follow one redirect only within the same registrable domain; otherwise record `redirected_off_domain`.
- Records: non-comment lines with at least 3 comma-separated fields. `ad_systems` = distinct lowercased field 1. Report DIRECT/RESELLER counts and `MANAGERDOMAIN`, `OWNERDOMAIN`, `CONTACT` variables.
- Header bidding = Prebid (`prebid(.min)?.js`, `pbjs`) or Amazon (`apstag`, `c.amazon-adsystem.com`) in initial HTML. GPT (`securepubads.g.doubleclick.net/tag/js/gpt.js`) is reported as ad-server tag present, not header bidding, and not scored.
- Always labelled "initial HTML only". "Not detected" never means "absent".

### 3.4 Agent reachability (w = 10, live, declared policy)

Parse robots.txt per RFC 9309: case-insensitive product-token match on `User-agent`, fall back to `*`, longest match wins, ties go to Allow. Evaluate each listed agent against path `/`.

```
search group status = allowed (none disallowed) | partial | blocked (all disallowed)
s_reachability      = 1 | 0.5 | 0     (null if robots.txt unreachable)
```

Labelled "declared policy, not observed behaviour". `Content-Signal` lines are recorded verbatim and not scored.

### 3.5 Commerce monetisation (w = 15, live)

Link patterns in homepage plus sampled pages:

| Network | Patterns |
|---|---|
| Skimlinks | `go.skimresources.com`, `go.redirectingat.com` |
| Awin | `awin1.com` |
| Partnerize | `prf.hn` |
| Sovrn Commerce | `redirect.viglink.com`, `sovrn.co` |
| Amazon Associates | `amzn.to`, `amazon.` URLs with `tag=` |
| Rakuten | `click.linksynergy.com` |
| CJ | `anrdoezrs.net`, `jdoqocy.com`, `tkqlhce.com`, `dpbolvw.net`, `kqzyfj.com` |

```
s_commerce = 0 (none) | 2/3 (one network) | 1 (two or more)
```

### 3.6 CDN (shown, not scored)

| Provider | Evidence |
|---|---|
| Cloudflare | `cf-ray`, or `server: cloudflare` |
| Fastly | `x-fastly-request-id`, `fastly-*`, or `x-served-by: cache-*` with `via` containing varnish |
| CloudFront | `x-amz-cf-id`, `x-amz-cf-pop`, or `via` containing cloudfront |
| Akamai | `server: AkamaiGHost`, `x-akamai-*` |
| Vercel | `x-vercel-id` |

Record every match (layered setups exist). Otherwise `unidentified`. The page states why CDN isn't scored: which CDNs blankspace deploys on is unknown to us.

---

## 4. Agent lists

Stored in `data/agents.json`. Every entry carries the vendor documentation URL and the date checked. **Verify the user-agent strings against vendor docs at build time; do not ship from this list unchecked.**

| Group | Agents |
|---|---|
| Training | GPTBot, ClaudeBot, Google-Extended, CCBot, Applebot-Extended, Meta-ExternalAgent, Bytespider |
| Search / user-triggered | OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User |

---

## 5. Stance and opening angle

```
ai_rules_present = any robots.txt group names a listed agent, or any Content-Signal line exists
```

| Code | Condition | Angle (Ayo's interpretation, labelled) | Priority |
|---|---|---|---|
| `already-decided` | Search allowed; training blocked or partial | "You’ve already decided AI search is welcome. Those visits earn nothing yet." | High |
| `reading-free` | Search allowed; training allowed; AI rules present | "AI agents read you every day, free." | High |
| `no-owner` | Search allowed; no AI rules present | "No stated AI policy usually means no owner yet." First conversation is about who owns it | Medium |
| `closed-door` | Search blocked or partial | Shown with the reason. No speculation about why | Low |
| `unknown` | robots.txt unreachable | No angle | n/a |

---

## 6. Citation sample method

- Queries: `data/queries.json`, three verticals, ids `auto-01…`, `ce-01…`, `sport-01…`. Model names refreshed at build time.
- Conditions: UK-phrased queries, logged out, the engines and runs recorded in `sample.json`. Every probe is one (query, engine, run).
- Capture every cited URL from the answer's sources, in order. Registrable domain via the Public Suffix List.
- Classification (`data/domains.json`, one line of rationale per domain): `publisher` (main revenue is content monetisation via ads or affiliate, so comparison and release-tracking sites count), `retailer`, `brand`, `ugc` (forums, Reddit, video), `other`.
- Only `publisher` domains are ranked. Class shares are published as a finding in their own right.
- `/method` states n, dates, engines, runs, and once: results vary from run to run.

---

## 7. Live check worker

`GET /api/check?url={input}` returns an evidence object (§8.4) with `"source": "live"`.

- Input normalised to `https://{host}/`. Reject IP literals, non-HTTP schemes, `localhost`, private and reserved ranges, and hosts that fail public suffix parsing.
- User-agent: `AyoGTMResearch/0.1 (+https://{site}/method#crawler)`. Never spoofs AI agent user-agents. `/method` says so.
- Obeys robots.txt for everything except robots.txt and ads.txt themselves.
- Budget: at most 8 requests per check, 8s timeout each, first 512 KB of any HTML. Cache by host for 24 hours. Rate-limit per client IP.
- A blocked fetch is evidence, not an error: record `{url, status}` and continue. Show "Blocked our fetch (403)".
- No other outbound effects. No send function exists anywhere in the codebase.

---

## 8. Data schemas

```
data/
  front.json
  sample.json
  readership.json
  raw/probes.jsonl
  queries.json
  agents.json
  domains.json
  company-claims.json
  citation-sample.csv
  evidence/{domain}.json
  drafts/{domain}.json
  verifier/{domain}.json
```

### 8.1 front.json

Front-page fields that are not sample data. Sample figures come from `sample.json` and `readership.json`, so each exists once.

```json
{
  "verifier_example": { "domain": "string", "removed_text": "string", "reason": "no_matching_evidence" },
  "builder": { "name": "string", "bio": "string|null", "repo_url": "string" }
}
```

`verifier_example` stays `null` until a verified draft exists.

### 8.2 sample.json and readership.json

`sample.json` records the sample's conditions and counts: `sample_id`, `dates_utc`, `engines`, `runs_per_query`, `queries`, `probes`, `condition`, `total_citations`, `unique_domains`, `publishers_cited`, `citation_buckets` (class, share, count), `collection_cost_usd` and `signal_definition`. The front page and `/method` read their numbers from it.

`readership.json` is the call sheet's source. It has one row per publisher-class domain, in its highest-share vertical:

```json
{
  "domain": "string",
  "vertical": "automotive|consumer_electronics|sportswear",
  "probes_cited_in_vertical": 0,
  "vertical_probes_total": 80,
  "share": 0.0,
  "stability": "both_runs|one_run|single_run_only",
  "probe_ids": ["every probe, in any vertical, whose answer cited the domain"],
  "s_citation_share": 0.0
}
```

`/targets` ranks by `s_citation_share`, then `share`. The live signals for in-sample publishers come from a live check, stored as `evidence/{domain}.json` when kept. Until then they are unknown, and each row scores out of 40.

Raw probes are kept in `data/raw/probes.jsonl`. Field definitions for every file are in `data/schema/`.

### 8.3 citation-sample.csv

One row per cited URL. A probe with zero citations gets one row with empty `cited_url`.

```
probe_id,sample_id,date_utc,engine,run,vertical,query_id,query,location,logged_in,citation_rank,cited_url,cited_domain,domain_class
```

### 8.4 evidence/{domain}.json (same shape from the worker)

```json
{
  "domain": "string",
  "vertical": "string|null",
  "source": "sample|live",
  "checked_at": "ISO-8601",
  "fetch": {
    "user_agent": "string",
    "requests": 7,
    "blocked": [{ "url": "string", "status": 403 }],
    "skipped": [{ "url": "string", "reason": "robots_disallow|budget|timeout|off_domain|unsafe_target|fetch_error" }]
  },
  "signals": {
    "readership": {
      "status": "in_sample|not_in_sample",
      "sample_id": "string",
      "probes_total": 0,
      "probes_cited": 0,
      "share": 0.0,
      "stability": "string",
      "probe_ids": ["string"]
    },
    "placement": {
      "sitemap_url": "string|null",
      "slugs_sampled": 0,
      "slugs_matched": 0,
      "slug_share": 0.0,
      "matched_examples": ["string"],
      "schema_types": ["ItemList"],
      "pages_checked": ["string"]
    },
    "programmatic": {
      "ads_txt": {
        "present": true,
        "url": "string",
        "records": 0,
        "ad_systems": 0,
        "direct": 0,
        "reseller": 0,
        "managerdomain": null,
        "ownerdomain": null,
        "note": null
      },
      "header_bidding": { "detected": ["prebid"], "scope": "initial_html" },
      "ad_server_tag": { "gpt": true }
    },
    "reachability": {
      "robots_url": "string",
      "status": 200,
      "training": "allowed|partial|blocked",
      "search": "allowed|partial|blocked",
      "per_agent": { "GPTBot": "blocked" },
      "ai_rules_present": true,
      "content_signal": ["string"],
      "excerpt": ["User-agent: GPTBot", "Disallow: /"]
    },
    "commerce": {
      "networks": ["skimlinks"],
      "evidence": [{ "network": "skimlinks", "pattern": "go.skimresources.com", "page": "string" }]
    },
    "cdn": { "providers": ["cloudflare"], "evidence_headers": ["cf-ray"] }
  },
  "score": {
    "weights": {},
    "subscores": {},
    "points": {},
    "total": 0,
    "max": 100,
    "missed": ["string"]
  },
  "stance": { "code": "already-decided", "angle_label": "string" },
  "cannot_see": ["Real agent traffic volumes", "Direct-sold ad revenue", "Who owns AI policy internally"]
}
```

Every user-facing statement on an evidence page must resolve to a JSON pointer in this object (e.g. `/signals/reachability/excerpt/0`).

Additions made at build time, defined in `data/schema/evidence.schema.json`: `score.maxima` (points available per known signal), `programmatic.ads_txt.status` and `.contact`, and, from the worker only, `cache: { hit, stored_at }`. `ads_txt.present`, `header_bidding.detected`, `ad_server_tag.gpt` and `commerce.networks` are `null` when the file or page could not be read.

### 8.5 company-claims.json

```json
[
  {
    "id": "cpm",
    "statement": "~$15 average CPM",
    "required_phrasing": "blankspace reports an average CPM of around $15",
    "source_url": "string",
    "accessed": "YYYY-MM-DD"
  }
]
```

Entries: `cpm`, `pickup` (98% ad pick-up), `sole-supplier-growth` (282% agent-traffic growth), `sole-supplier-referrals` (5x ChatGPT referrals). Fill in source URLs and access dates from the pages actually read.

### 8.6 drafts/{domain}.json

```json
{
  "domain": "string",
  "angle_code": "string",
  "recipient_role": "Head of Ad Ops",
  "subject": "string",
  "body": "Markdown. Every factual sentence ends with a claim marker [^c1].",
  "claims": [
    {
      "id": "c1",
      "text": "string",
      "type": "evidence|company_claim",
      "ref": "/signals/reachability/excerpt/0 | company-claims#cpm",
      "asserted_value": "any"
    }
  ],
  "verifier_run_id": "string"
}
```

No named individuals anywhere in the artifact.

### 8.7 verifier/{domain}.json

```json
{
  "run_id": "string",
  "domain": "string",
  "ran_at": "ISO-8601",
  "claims_in": 0,
  "kept": ["c1"],
  "tagged_company_claims": ["c3"],
  "removed": [
    {
      "text": "string",
      "reason": "no_matching_evidence|value_mismatch|unmarked_factual_sentence|company_claim_misphrased"
    }
  ]
}
```

---

## 9. Verifier rules

1. Resolve each claim's `ref`. An unresolvable pointer means removal (`no_matching_evidence`).
2. Compare `asserted_value` to the resolved value. A mismatch means removal (`value_mismatch`).
3. A company claim must use `required_phrasing`. Otherwise removal (`company_claim_misphrased`). Kept ones are tagged `COMPANY CLAIM`.
4. A second pass flags factual sentences with no claim marker. Those are removed (`unmarked_factual_sentence`).
5. The draft shown is the post-verifier text. The log shows everything removed, verbatim.

---

## 10. Honest-framing rules

1. **One line up front, front page only:** "Unofficial concept by {name}, not affiliated with blankspace. Citation data is a dated sample ({date}, n = {probes} probes); live checks read public files only; nothing here can send email."
2. **Persistent footer, every page:** "Unofficial concept, not affiliated with blankspace." This is a label, not a disclaimer.
3. **Supply-side assumption:** front page section 2 and `/plan` only, stated as an assumption from the JD and interviews.
4. **Dated sample:** after the front-page line, citation figures carry only a quiet `DATED SAMPLE · {date}` tag. "Results vary run to run" appears once on `/method` and once as the stability tooltip.
5. **Interpretation is labelled:** angles and "why not higher" lines are marked as Ayo's reading.
6. **Unknown is not zero.** Unknown signals never lower a score.
7. **No synthetic data, no invented prospect metrics, no traffic or revenue estimates.**
8. **blankspace figures** appear only as attributed company claims.
9. **No named individuals.** No send function.

---

## 11. JD requirement map (rendered on the front page)

| JD requirement | Where it lives |
|---|---|
| Top-of-funnel outreach that books qualified publisher meetings | Call sheet, evidence pages, verified drafts |
| The GTM machine: lists, research agents, analytics | Live check worker, scoring, verifier, method |
| Sequences and CRM | Not built. A CRM is a buying decision, not a demo. `/plan` covers set-up |
| A/B testing | `/plan`: small-n test design |
| Keeping pilots on track | `/pilots` |
| AI-native, end-to-end project you can demo | This site and its repository |
