# Data

The site reads every number from these files at runtime. They ship as empty placeholders. Real collected data replaces them in the data-wiring pass.

Rules for anything written here:

- Unknown is `null`, never `0`. Pages show `null` as unknown, and scoring leaves it out of both the total and the maximum.
- Nothing synthetic. Every value comes from a recorded probe or a fetched public file.
- `node scripts/check.mjs` validates every file against `schema/`. `node scripts/check.mjs --release` also fails on placeholders: an empty sample, unchecked agents, or company claims with no source.

JSON has no comments, so each object file carries a `$comment` and a `$schema` pointer. The full field definitions are the JSON Schemas in `schema/`.

| File | Schema | Contents |
|---|---|---|
| `front.json` | `schema/front.schema.json` | Front-page summary: sample date, engines, n, class shares, preview rows, verifier example, builder |
| `targets.json` | `schema/targets.schema.json` | Ranked call sheet. One row per in-sample publisher, with sub-scores in [0, 1] or null |
| `queries.json` | `schema/queries.schema.json` | Queries as typed, with ids `auto-NN`, `ce-NN` and `sport-NN`, plus engine and model names on the day |
| `agents.json` | `schema/agents.schema.json` | Crawler tokens tested in robots.txt, with the vendor page and the date checked. The worker imports this file. |
| `domains.json` | `schema/domains.schema.json` | Class and one-line rationale for every cited domain |
| `company-claims.json` | `schema/company-claims.schema.json` | blankspace's own figures. An array, per SPEC §8.5. Pages show a claim only once `source_url` and `accessed` are set. |
| `citation-sample.csv` | Header row below | One row per cited URL. A probe with no citations gets one row with an empty `cited_url`. |
| `evidence/{domain}.json` | `schema/evidence.schema.json` | Evidence object per publisher. The worker returns the same shape. |
| `drafts/{domain}.json` | `schema/draft.schema.json` | Post-verifier draft. Every factual sentence ends in a claim marker `[^cN]`. |
| `verifier/{domain}.json` | `schema/verifier.schema.json` | Verifier log. Removed sentences are kept verbatim. |

`citation-sample.csv` columns, in order:

```
probe_id,sample_id,date_utc,engine,run,vertical,query_id,query,location,logged_in,citation_rank,cited_url,cited_domain,domain_class
```

## Cross-file checks

`scripts/check.mjs` also checks the following:

- Every `targets.json` row has `evidence/{domain}.json`.
- `sample_id` is the same in `front.json`, `targets.json`, `queries.json` and the CSV.
- Every draft claim's `ref` resolves: a JSON pointer into that domain's evidence, or `company-claims#{id}`.
- Every company claim a draft cites has a source.
- Verifier `kept` and `tagged_company_claims` ids exist in the draft.
- The front page's verifier example appears verbatim in that domain's verifier log.

## Preview with collected data before committing

```bash
node scripts/serve.mjs --data /path/to/collected/data
```
