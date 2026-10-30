# Working on this repository

Read `SPEC.md` first. It is the source of truth for behaviour. `BRAND.md` is the source of truth for anything visual. Where the code disagrees with either, the code is wrong.

The author is Ayo Ahmed. This is an unofficial concept, not affiliated with blankspace.

## Standing rules

Breaking any of these fails the build. `node scripts/check.mjs` enforces each one marked ✓.

1. **No AI, model or tool attribution, anywhere.** ✓ That covers files, comments, meta tags, READMEs, commit messages, commit trailers and git author fields. Every commit is authored as Ayo Ahmed. Do not name an AI assistant, its vendor, a model or a coding tool. Do not add lines that credit a tool with the work, co-author trailers, or a generator meta tag. Before your first commit, check `git config user.name`.
   - *The one exception:* crawler product tokens are data. The agent list in `data/agents.json` and the per-agent results in `data/evidence/*.json` name the crawlers that robots.txt rules address, as SPEC §4 requires. Those tokens may appear in `data/`, `SPEC.md` and `research/` only, and only as exact tokens. The checker strips the tokens before scanning, so the bare names still fail everywhere.
   - Stored live checks quote publishers' robots.txt verbatim, and robots.txt names crawlers and their operators. In `data/evidence/*.json` only, the checker skips `signals.reachability.excerpt`, `content_signal` and the `per_agent` keys. Everything else in those files is scanned. Never edit evidence to pass the check.
2. **No fabricated data presented as real.** No invented prospect metrics, customer results, traffic or revenue figures. Never put test fixtures in `data/`. Keep them in a scratch directory and preview them with `node scripts/serve.mjs --data <dir>`.
3. **Unknown is unknown.** ✓ (schemas) A value that couldn't be read is `null` in the data and "Unknown" on the page. Scoring leaves it out of both the total and the maximum. Never write `0` for a value you don't have.
4. **No send or outreach capability.** ✓ No email, messaging, webhook or form-post code anywhere. The worker makes GET requests and DNS lookups only. `/method/` states plainly that no send function exists. Keep that sentence.
5. **noindex, nofollow on every page.** ✓ Every HTML page keeps `<meta name="robots" content="noindex, nofollow">`. `robots.txt` keeps `Disallow: /`. `_headers` keeps `X-Robots-Tag`.
6. **blankspace figures are their claims, with a source.** ✓ The CPM, pick-up and The Sole Supplier figures live only in `data/company-claims.json`, each with `required_phrasing`, `source_url` and `accessed`. Pages render them through `assets/js/claims.js`, which shows nothing until a source is recorded. Never type those figures into a page or script.
7. **Tone.** ✓ (partly) Short declarative sentences. No exclamation marks. British spelling: monetise, personalised, behaviour, organisation. Sentence case. Typographic apostrophes and quotes in visible text. Lowercase "blankspace". Interpretation (angles, "why not higher") is labelled as Ayo's reading.
8. **Honest crawler.** ✓ The live check sends `AyoGTMResearch/0.1 (+{site}/method#crawler)` and never another agent's user-agent. It obeys robots.txt except for robots.txt and ads.txt. It refuses non-http(s) schemes, IP literals, reserved names and private address ranges. It holds the 8-request budget.
9. **No named individuals** in drafts, data or pages. Address roles.
10. **Plain HTML, CSS and JS.** No frameworks and no build step for the site. Montserrat and Nunito Sans from Google Fonts are the only external dependency. The worker may use npm packages, because Wrangler bundles it.

## Checks

```bash
node scripts/check.mjs
```

```bash
node scripts/check.mjs --release
```

```bash
node --test tests/*.test.mjs
```

```bash
cd worker && npm install && npm test
```

`check.mjs` covers:
- attribution strings in every tracked file and in git history;
- tone in visible text;
- required page elements;
- that internal links and `#anchors` resolve;
- every data file against `data/schema/`, plus cross-file consistency;
- that published drafts and logs are exactly the verifier's output from `outreach/`.

`--release` also fails on placeholders. Use it before the link goes to anyone.

Run both checks before every commit.

## Where things live

| Path | What |
|---|---|
| `index.html`, `targets/`, `p/`, `check/`, `pilots/`, `plan/`, `method/`, `404.html` | Pages. Each one repeats the same nav and footer markup. Change all of them together. |
| `assets/css/site.css` | All styles. Tokens at the top mirror BRAND.md §1 to §4. |
| `assets/js/score.js` | Scoring and stance rules (SPEC §3, §5). Shared with the worker. |
| `assets/js/evidence-model.js` | Evidence merging and call-sheet ordering. No DOM, so tests and scripts use it too. |
| `assets/js/verifier.js` | The draft verifier (SPEC §9). Deterministic, with no network access. |
| `outreach/` | First drafts, before the verifier. Not deployed. Only for accounts ready for discovery. `node scripts/verify-drafts.mjs` writes `data/drafts/` and `data/verifier/`. |
| `data/qualification.json` | Manual commercial qualification. Every verified finding needs a source and access date. Never guess a parent company, and never treat robots.txt, CDN headers or affiliate links as readiness. |
| `data/corrections.json` | Dated classification corrections. Correct here; never edit the collected sample files. |
| `tests/` | Call-sheet and verifier tests: `node --test tests/*.test.mjs` |
| `assets/js/evidence-view.js` | Evidence renderer for `/p/` and `/check/`. Every fact shows its JSON pointer. |
| `assets/js/config.js` | The worker endpoint |
| `data/` | Runtime data and its schemas. See `data/README.md`. |
| `worker/` | The live-check worker. See `worker/README.md`. |
| `research/` | Owner-collected blankspace scrape. Reference only. Not deployed. |
| `scripts/serve.mjs` | Local preview with the production routing rules |

## Changing the brand

Change `BRAND.md` first, with its source (a line in `research/blankspace-main.css` or a pixel sample). Then change the token in `site.css`. Do not introduce colours, weights or radii that aren't in BRAND.md.
