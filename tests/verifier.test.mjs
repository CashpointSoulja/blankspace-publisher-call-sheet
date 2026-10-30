// Verifier rules (SPEC §9). Evidence and claims here are test inputs, not data.

import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyDraft, splitSentences, isFactual } from "../assets/js/verifier.js";

const EVIDENCE = {
  domain: "example.co.uk",
  vertical: "automotive",
  signals: { readership: { status: "in_sample", probes_cited: 54, probes_total: 80, share: 0.675, stability: "both_runs" } }
};
const CLAIMS = [
  { id: "cpm", statement: "x", required_phrasing: "blankspace reports a $15.02 average CPM on live accounts", source_url: "https://blankspace.so/", accessed: "2026-10-30" },
  { id: "pickup", statement: "x", required_phrasing: "blankspace reports that 98% of the ads it serves are successfully picked up by agents", source_url: null, accessed: null }
];
const ctx = { evidence: EVIDENCE, companyClaims: CLAIMS, ranAt: "2026-10-30T12:00:00Z" };

const draft = (body, claims, extra = {}) => ({
  domain: "example.co.uk", angle_code: "unknown", recipient_role: "Head of Commercial",
  subject: "AI search and example.co.uk", body, claims, ...extra
});
const ev = (id, ref, asserted_value) => ({ id, text: id, type: "evidence", ref, asserted_value });

test("supported sentences survive unchanged", () => {
  const { draft: out, log } = verifyDraft(draft(
    "Hello,\n\nexample.co.uk was cited in 54 of the 80 automotive answers in the sample.[^c1][^c2] Would a short call be useful?",
    [ev("c1", "/signals/readership/probes_cited", 54), ev("c2", "/signals/readership/probes_total", 80)]), ctx);
  assert.deepEqual(log.removed, []);
  assert.deepEqual(log.kept, ["c1", "c2"]);
  assert.equal(out.body, "Hello,\n\nexample.co.uk was cited in 54 of the 80 automotive answers in the sample.[^c1][^c2] Would a short call be useful?");
});

test("rejects an unsupported traffic claim that points at evidence that doesn’t exist", () => {
  const { draft: out, log } = verifyDraft(draft(
    "Agents visit your reviews 2 million times a month.[^c1] Would a short call be useful?",
    [ev("c1", "/signals/traffic/monthly_agent_visits", 2000000)]), ctx);
  assert.deepEqual(log.removed, [{ text: "Agents visit your reviews 2 million times a month.[^c1]", reason: "no_matching_evidence" }]);
  assert.deepEqual(log.kept, []);
  assert.equal(out.body, "Would a short call be useful?");
});

test("rejects unmarked traffic and revenue statements", () => {
  const { log } = verifyDraft(draft(
    "Most of that agent traffic earns nothing today. You are leaving revenue on the table. Thanks for reading.",
    []), ctx);
  assert.deepEqual(log.removed.map((r) => r.reason), ["unmarked_factual_sentence", "unmarked_factual_sentence"]);
  assert.deepEqual(log.removed.map((r) => r.text), ["Most of that agent traffic earns nothing today.", "You are leaving revenue on the table."]);
});

test("rejects a value that doesn’t match the evidence", () => {
  const { log } = verifyDraft(draft(
    "example.co.uk was cited in 56 of the 80 automotive answers.[^c1][^c2]",
    [ev("c1", "/signals/readership/probes_cited", 56), ev("c2", "/signals/readership/probes_total", 80)]), ctx);
  assert.equal(log.removed[0].reason, "value_mismatch");
  assert.deepEqual(log.kept, []);
});

test("company claims: exact wording is kept and tagged; anything else is removed", () => {
  const cc = (id, ref) => ({ id, text: "company figure", type: "company_claim", ref, asserted_value: null });
  const { log } = verifyDraft(draft(
    "For context, blankspace reports a $15.02 average CPM on live accounts.[^c1] blankspace says CPMs are about $15.[^c2] blankspace reports that 98% of the ads it serves are successfully picked up by agents.[^c3] Something else is claimed here.[^c4]",
    [cc("c1", "company-claims#cpm"), cc("c2", "company-claims#cpm"), cc("c3", "company-claims#pickup"), cc("c4", "company-claims#nonexistent")]), ctx);
  assert.deepEqual(log.kept, ["c1"]);
  assert.deepEqual(log.tagged_company_claims, ["c1"]);
  assert.deepEqual(log.removed.map((r) => r.reason), ["company_claim_misphrased", "no_matching_evidence", "no_matching_evidence"]);
});

test("a marker with no matching claim removes its sentence", () => {
  const { log } = verifyDraft(draft("It was cited in every run.[^c9]", []), ctx);
  assert.deepEqual(log.removed, [{ text: "It was cited in every run.[^c9]", reason: "no_matching_evidence" }]);
});

test("a sentence goes if any one of its claims fails", () => {
  const { log } = verifyDraft(draft(
    "It was cited in 54 of 80 answers.[^c1][^c2]",
    [ev("c1", "/signals/readership/probes_cited", 54), ev("c2", "/signals/readership/probes_total", 81)]), ctx);
  assert.equal(log.removed[0].reason, "value_mismatch");
  assert.deepEqual(log.kept, []);
});

test("sentence splitting ignores dots in domains and decimals", () => {
  assert.deepEqual(splitSentences("pcmag.com was cited.[^c1] blankspace reports $15.02 here. Next one?"),
    ["pcmag.com was cited.[^c1]", "blankspace reports $15.02 here.", "Next one?"]);
  assert.deepEqual(splitSentences("Compare, e.g. reviews vs. guides. Done."), ["Compare, e.g. reviews vs. guides.", "Done."]);
  assert.deepEqual(splitSentences("autoexpress.co.uk was cited in 54 answers.[^c1][^c2] Would 20 minutes work?"),
    ["autoexpress.co.uk was cited in 54 answers.[^c1][^c2]", "Would 20 minutes work?"]);
});

test("questions and pleasantries are not factual; numbers and measurable subjects are", () => {
  assert.equal(isFactual("Would 20 minutes next week work?"), false);
  assert.equal(isFactual("Hello,"), false);
  assert.equal(isFactual("I’m writing about AI search."), false);
  assert.equal(isFactual("Your site was cited often."), true);
  assert.equal(isFactual("It earns more than most."), true);
});

test("deterministic: same input, same run id; different evidence, different id", () => {
  const d = draft("It was cited in 54 answers.[^c1]", [ev("c1", "/signals/readership/probes_cited", 54)]);
  const a = verifyDraft(d, ctx).log.run_id;
  assert.equal(verifyDraft(d, ctx).log.run_id, a);
  const other = { ...ctx, evidence: { ...EVIDENCE, signals: { readership: { ...EVIDENCE.signals.readership, probes_cited: 55 } } } };
  assert.notEqual(verifyDraft(d, other).log.run_id, a);
});

test("refuses factual subject lines and contact details", () => {
  assert.throws(() => verifyDraft(draft("Hello.", [], { subject: "You were cited in 54 answers" }), ctx), /subject/);
  assert.throws(() => verifyDraft(draft("Write to someone@example.com.", []), ctx), /contact/);
  assert.throws(() => verifyDraft(draft("Call +44 20 7946 0000 today.", []), ctx), /contact/);
});
