# Data

The site reads every number from these files at runtime. The citation sample was collected on 30 Oct 2026. Pages read the collected files directly, with no derived copies.

Rules for anything written here:

- Unknown is `null`, never `0`. Pages show `null` as unknown, and scoring leaves it out of both the total and the maximum.
- Nothing synthetic. Every value comes from a recorded probe or a fetched public file.
- `node scripts/check.mjs` validates every file against `schema/`. `node scripts/check.mjs --release` also fails on placeholders: no sample, company claims with no source, or no repository link.

Collected files are kept exactly as collected, so field definitions live in the JSON Schemas in `schema/`, not in the files. `front.json` carries a `$comment` and a `$schema` pointer.

| File | Schema | Contents |
|---|---|---|
| `sample.json` | `schema/sample.schema.json` | Sample conditions, counts, class shares, cost and the signal definition. Front page and `/method/`. |
| `readership.json` | `schema/readership.schema.json` | Citation share per publisher. The call sheet ranks from it. |
| `raw/probes.jsonl` | none (one JSON object per line) | Every probe as returned, with its cited URLs and cost |
| `front.json` | `schema/front.schema.json` | Builder details and the verifier example. Not sample data. |
| `queries.json` | `schema/queries.schema.json` | Queries as sent, with ids `auto-NN`, `ce-NN` and `sport-NN` |
| `agents.json` | `schema/agents.schema.json` | Crawler tokens tested in robots.txt, verified against vendor pages or marked unverified with corroboration. The worker imports this file. |
| `domains.json` | `schema/domains.schema.json` | Every cited domain, keyed by domain: class, one-line rationale and counts |
| `company-claims.json` | `schema/company-claims.schema.json` | blankspace's own figures. An array, per SPEC §8.5. Pages show a claim only once `source_url` and `accessed` are set. |
| `citation-sample.csv` | Header row below | One row per cited URL. A probe with no citations gets one row with an empty `cited_url`. |
| `evidence/{domain}.json` | `schema/evidence.schema.json` | A stored live check, in the worker's shape. Citation share and the score are merged in from the sample at display time. |
| `evidence-index.json` | `schema/evidence-index.schema.json` | The stored checks the call sheet loads. Must list exactly the files in `evidence/`. |
| `drafts/{domain}.json` | `schema/draft.schema.json` | Post-verifier draft, written by `scripts/verify-drafts.mjs` from `outreach/{domain}.json`. Don't edit it by hand. |
| `verifier/{domain}.json` | `schema/verifier.schema.json` | Verifier log. Removed sentences are kept verbatim. |

`citation-sample.csv` columns, in order:

```
probe_id,sample_id,date_utc,engine,run,vertical,query_id,query,location,logged_in,citation_rank,cited_url,cited_domain,domain_class
```

## Cross-file checks

`scripts/check.mjs` also checks the following:

- Every figure in `sample.json` is recomputed from the CSV, `raw/probes.jsonl`, `queries.json` and `domains.json`, including class counts and shares, publishers cited and collection cost.
- Every CSV row has the sample's id and date, a query that matches `queries.json`, and a domain whose class matches `domains.json`.
- Each `readership.json` row is a publisher, with `share` = cited ÷ total, `s_citation_share` = min(1, share ÷ 0.25), and `probe_ids` equal to every probe that cites it.
- An unverified agent token has a note and a corroboration URL.
- Every draft claim's `ref` resolves: a JSON pointer into that domain's evidence, or `company-claims#{id}`.
- Every company claim a draft cites has a source.
- Verifier `kept` and `tagged_company_claims` ids exist in the draft.
- The front page's verifier example appears verbatim in that domain's verifier log.

## Preview with collected data before committing

```bash
node scripts/serve.mjs --data /path/to/collected/data
```
