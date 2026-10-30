# Outreach sources

First drafts, as written, before the verifier. One file per publisher. They are not published: the site shows only the verifier's output in `data/drafts/`, with the log of everything removed in `data/verifier/`.

- Address a role (`recipient_role`), never a named person. No contact details.
- Every factual sentence ends with a claim marker `[^cN]`. Each claim points at a JSON pointer into the publisher's evidence, or at `company-claims#{id}`.
- Evidence means the dated sample (`data/readership.json`), plus a stored live check in `data/evidence/` when one exists. Never assert a value you haven't read.
- Nothing in this repository can send a draft.

After editing a source, or when evidence changes:

```bash
node scripts/verify-drafts.mjs
```

`node scripts/check.mjs` fails if `data/drafts/` or `data/verifier/` no longer match what the verifier produces from these sources.
