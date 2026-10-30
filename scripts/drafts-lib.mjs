// Shared by scripts/verify-drafts.mjs (writes) and scripts/check.mjs (compares).
// For every outreach/{domain}.json, builds the publisher's evidence exactly as the evidence
// page does (dated sample plus any stored live check) and runs the verifier.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { buildEvidence } from "../assets/js/evidence-model.js";
import { verifyDraft } from "../assets/js/verifier.js";

export function expectedDrafts(root, ranAt) {
  const json = (rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));
  const dir = path.join(root, "outreach");
  if (!existsSync(dir)) return [];
  const sample = json("data/sample.json");
  const readership = json("data/readership.json");
  const companyClaims = json("data/company-claims.json");
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
    const candidate = json(`outreach/${f}`);
    const domain = path.basename(f, ".json");
    if (candidate.domain !== domain) throw new Error(`outreach/${f}: domain is ${candidate.domain}`);
    const row = readership.find((r) => r.domain === domain);
    if (!row) throw new Error(`outreach/${f}: ${domain} is not a publisher in the sample`);
    const livePath = `data/evidence/${domain}.json`;
    const live = existsSync(path.join(root, livePath)) ? json(livePath) : null;
    const evidence = buildEvidence(row, sample, live);
    const { draft, log } = verifyDraft(candidate, { evidence, companyClaims, ranAt });
    return { domain, sampleRank: readership.filter((r) => r.share > row.share).length + 1, draft, log };
  });
}

// The first removal on the highest-cited drafted publisher: the front page's example.
export function verifierExample(results) {
  const withRemovals = results.filter((r) => r.log.removed.length).sort((a, b) => a.sampleRank - b.sampleRank);
  if (!withRemovals.length) return null;
  const r = withRemovals[0];
  return { domain: r.domain, removed_text: r.log.removed[0].text, reason: r.log.removed[0].reason };
}
