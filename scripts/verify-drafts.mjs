#!/usr/bin/env node
// Runs the verifier over outreach/*.json and writes the published drafts and their logs:
//   data/drafts/{domain}.json    the post-verifier draft (SPEC §8.6)
//   data/verifier/{domain}.json  everything kept, tagged and removed (SPEC §8.7)
// and the front page's verifier example in data/front.json.
// A log's ran_at only changes when its result does, so re-running is a no-op.
// Nothing here sends anything.
//
//   node scripts/verify-drafts.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectedDrafts, verifierExample } from "./drafts-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = (rel, value) => writeFileSync(path.join(ROOT, rel), JSON.stringify(value, null, 2) + "\n");
const readIf = (rel) => (existsSync(path.join(ROOT, rel)) ? JSON.parse(readFileSync(path.join(ROOT, rel), "utf8")) : null);
const sameExceptTime = (a, b) => a && b && JSON.stringify({ ...a, ran_at: null }) === JSON.stringify({ ...b, ran_at: null });

const results = expectedDrafts(ROOT, new Date().toISOString());
for (const { domain, draft, log } of results) {
  const old = readIf(`data/verifier/${domain}.json`);
  if (sameExceptTime(old, log)) log.ran_at = old.ran_at;
  write(`data/drafts/${domain}.json`, draft);
  write(`data/verifier/${domain}.json`, log);
  console.log(`${domain}: ${log.kept.length} claim(s) kept, ${log.removed.length} sentence(s) removed`);
}

// Drop published drafts whose source is gone.
const keep = new Set(results.map((r) => `${r.domain}.json`));
for (const dir of ["data/drafts", "data/verifier"]) {
  for (const f of readdirSync(path.join(ROOT, dir)).filter((x) => x.endsWith(".json") && !keep.has(x))) {
    unlinkSync(path.join(ROOT, dir, f));
    console.log(`removed ${dir}/${f}`);
  }
}

const front = readIf("data/front.json");
front.verifier_example = verifierExample(results);
write("data/front.json", front);
