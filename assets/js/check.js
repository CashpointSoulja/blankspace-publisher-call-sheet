// /check/?url=: live evidence for any publisher URL, via the worker (SPEC §7).

import { el, clear, CHECK_ENDPOINT } from "./common.js";
import { renderEvidence } from "./evidence-view.js";
import { loadSample, loadReadership, sampleDate } from "./sample-data.js";

const form = document.getElementById("check-form");
const input = document.getElementById("check-url");
const out = document.getElementById("result");
const err = document.getElementById("check-error");
const button = form.querySelector("button[type=submit]");

function showError(text) {
  err.textContent = text;
  err.hidden = false;
}

async function run(url) {
  err.hidden = true;
  clear(out);
  button.disabled = true;
  out.append(el("p", { class: "notice", role: "status" }, "Checking. Up to eight requests, eight seconds each."));

  const [sample, readership] = await Promise.all([
    loadSample().catch(() => null),
    loadReadership().catch(() => [])
  ]);

  let res;
  try {
    res = await fetch(`${CHECK_ENDPOINT}?url=${encodeURIComponent(url)}`, { headers: { accept: "application/json" } });
  } catch {
    clear(out);
    button.disabled = false;
    showError("The live-check service isn’t reachable from here. It may not be deployed yet.");
    return;
  }
  let body = null;
  try { body = await res.json(); } catch { /* handled below */ }
  clear(out);
  button.disabled = false;

  if (!res.ok || !body || body.error) {
    const msg = body && body.message ? body.message : `The check failed (HTTP ${res.status}).`;
    showError(res.status === 404 && !body ? "The live-check service isn’t deployed at this address yet." : msg);
    return;
  }

  const inSample = readership.some((r) => r.domain === body.domain);
  if (inSample) {
    out.append(el("p", { class: "notice" },
      el("strong", {}, `${body.domain} is in the dated sample. `),
      "Its evidence page adds its citation share and the answers that cited it. ",
      el("a", { href: `/p/${encodeURIComponent(body.domain)}/` }, "Open it")));
  }
  if (body.cache && body.cache.hit) {
    out.append(el("p", { class: "small muted" }, "Served from the 24-hour cache for this host. The publisher was not contacted again."));
  }
  out.append(renderEvidence(body, { sampleDate: sampleDate(sample) }));
}

const initial = new URLSearchParams(location.search).get("url");
if (initial) {
  input.value = initial;
  run(initial);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = input.value.trim();
  if (!value) { showError("Give a publisher address."); return; }
  history.replaceState(null, "", `${location.pathname}?url=${encodeURIComponent(value)}`);
  run(value);
});
