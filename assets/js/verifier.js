// Draft verifier (SPEC §9). Pure and deterministic: the same draft, evidence and claims always
// give the same output. No network, no clock (the caller passes ranAt), no send capability.
//
// Rules, applied per sentence:
//   1. Every claim's ref must resolve: a JSON pointer into the publisher's evidence, or
//      company-claims#{id} for a claim with a recorded source. Otherwise: no_matching_evidence.
//   2. The claim's asserted_value must equal the resolved value exactly. Otherwise: value_mismatch.
//   3. A company claim's sentence must contain its required_phrasing verbatim. Otherwise:
//      company_claim_misphrased. Kept company claims are tagged.
//   4. A factual sentence with no claim marker is removed: unmarked_factual_sentence.
// A sentence goes if any of its claims fails. The log keeps every removed sentence verbatim.

export const VERIFIER_VERSION = "1";

const MARKER = /\[\^(c\d+)\]/g;

// Sentence ends: . ? or ! plus any claim markers, then whitespace. Dots inside domains
// (pcmag.com) and decimals ($15.02) are never followed by a space, so they don't split. The next
// sentence may start in lowercase ("blankspace", a domain). Common abbreviations are rejoined.
const BOUNDARY = /(?<=[.?!](?:\[\^c\d+\])*)\s+/;
const ABBREVIATION = /\b(e\.g|i\.e|etc|vs|approx|incl|no)\.$/i;

// A sentence is factual if it states a number or touches a measurable subject. Questions are
// not statements, so they are exempt.
const FACTUAL = /\d|%|[£$€]|\b(traffic|visits?|visitors?|readers?|readership|audience|revenue|earn(s|ed|ing)?|income|cpm|rpm|impressions?|cited|citations?|answers?|ranked|ranks?|grew|grow(s|th)?|share|robots\.txt|ads\.txt|agents?|crawlers?|monetis\w*|most|majority|percent|million|thousand|billion)\b/i;
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s()-]{8,}\d/;

export function splitSentences(paragraph) {
  const out = [];
  for (const piece of paragraph.trim().split(BOUNDARY)) {
    if (out.length && ABBREVIATION.test(out[out.length - 1])) out[out.length - 1] += ` ${piece}`;
    else out.push(piece);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

export function isFactual(sentence) {
  const plain = sentence.replace(MARKER, "").trim();
  if (plain.endsWith("?")) return false;
  return FACTUAL.test(plain);
}

export function resolvePointer(obj, ptr) {
  if (typeof ptr !== "string" || !ptr.startsWith("/")) return undefined;
  return ptr.split("/").slice(1).reduce((a, k) => {
    if (a === null || a === undefined || typeof a !== "object") return undefined;
    const key = k.replace(/~1/g, "/").replace(/~0/g, "~");
    return Object.prototype.hasOwnProperty.call(a, key) ? a[key] : undefined;
  }, obj);
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deepEqual(a[k], b[k]));
}

// FNV-1a over a canonical JSON string: a stable id for one verifier input.
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Check one claim. Returns null when it stands, or the removal reason.
function judgeClaim(claim, sentence, evidence, companyClaims) {
  if (!claim) return "no_matching_evidence";
  if (claim.type === "company_claim") {
    const id = String(claim.ref).replace(/^company-claims#/, "");
    const cc = String(claim.ref).startsWith("company-claims#") ? companyClaims.find((c) => c.id === id) : null;
    if (!cc || !cc.source_url || !cc.accessed) return "no_matching_evidence";
    if (!sentence.includes(cc.required_phrasing)) return "company_claim_misphrased";
    return null;
  }
  if (claim.type !== "evidence") return "no_matching_evidence";
  const value = resolvePointer(evidence, claim.ref);
  if (value === undefined) return "no_matching_evidence";
  if (!deepEqual(value, claim.asserted_value)) return "value_mismatch";
  return null;
}

// candidate: { domain, angle_code, recipient_role, subject, body, claims[] }
// context:   { evidence, companyClaims, ranAt }
export function verifyDraft(candidate, { evidence, companyClaims = [], ranAt }) {
  if (!candidate || typeof candidate.body !== "string") throw new Error("verifyDraft: candidate needs a body");
  if (!ranAt) throw new Error("verifyDraft: ranAt is required");
  if (isFactual(candidate.subject || "")) throw new Error(`${candidate.domain}: the subject line states a fact; claims belong in the body, with markers`);
  if (CONTACT.test(candidate.body) || CONTACT.test(candidate.subject || "")) throw new Error(`${candidate.domain}: drafts must not carry contact details`);

  const byId = new Map(candidate.claims.map((c) => [c.id, c]));
  const removed = [];
  const keptIds = new Set();

  const paragraphs = candidate.body.split(/\n{2,}/).map((para) => {
    const kept = [];
    for (const sentence of splitSentences(para)) {
      const ids = [...sentence.matchAll(MARKER)].map((m) => m[1]);
      let reason = null;
      if (!ids.length) {
        if (isFactual(sentence)) reason = "unmarked_factual_sentence";
      } else {
        // Judged per sentence: a company claim's wording must hold in every sentence citing it.
        for (const id of ids) {
          reason = judgeClaim(byId.get(id), sentence, evidence, companyClaims);
          if (reason) break;
        }
      }
      if (reason) removed.push({ text: sentence, reason });
      else { kept.push(sentence); ids.forEach((id) => keptIds.add(id)); }
    }
    return kept.join(" ");
  }).filter(Boolean);

  const keptClaims = candidate.claims.filter((c) => keptIds.has(c.id));
  const runId = `vr-${fnv1a(stableJson({ v: VERIFIER_VERSION, candidate, evidence, companyClaims }))}`;

  const draft = {
    domain: candidate.domain,
    angle_code: candidate.angle_code,
    recipient_role: candidate.recipient_role,
    subject: candidate.subject,
    body: paragraphs.join("\n\n"),
    claims: keptClaims,
    verifier_run_id: runId
  };
  const log = {
    run_id: runId,
    domain: candidate.domain,
    ran_at: ranAt,
    claims_in: candidate.claims.length,
    kept: keptClaims.map((c) => c.id),
    tagged_company_claims: keptClaims.filter((c) => c.type === "company_claim").map((c) => c.id),
    removed
  };
  return { draft, log };
}
