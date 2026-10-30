// GET /api/check?url={input} → evidence object (SPEC §7, §8.4).
//
// Outbound effects: GET requests to the publisher's public files, and DNS-over-HTTPS
// lookups to check the publisher's addresses. Nothing else. There is no send function.

import { runCheck } from "./check.js";
import { normaliseTarget, TargetError } from "./guard.js";

const CACHE_TTL_SECONDS = 24 * 60 * 60;
const FALLBACK_LIMIT = { requests: 10, windowMs: 60_000 };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (url.pathname !== "/api/check") return json({ error: "not_found", message: "Not found." }, 404, cors);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "method_not_allowed", message: "Use GET." }, 405, { ...cors, allow: "GET, OPTIONS" });

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (!(await allow(ip, env))) {
      return json({ error: "rate_limited", message: "Too many checks from this address. Try again in a minute." }, 429, { ...cors, "retry-after": "60" });
    }

    const input = url.searchParams.get("url") || "";
    let host;
    try {
      host = normaliseTarget(input).host;
    } catch (e) {
      return errorResponse(e, cors);
    }

    const cached = await readCache(host, env, url);
    if (cached) return json({ ...cached, cache: { hit: true, stored_at: cached.checked_at } }, 200, cors);

    try {
      const evidence = await runCheck(input, {
        siteOrigin: env.SITE_ORIGIN || url.origin,
        dnsCheck: env.DNS_CHECK !== "off"
      });
      const stored = writeCache(host, evidence, env, url);
      if (ctx && ctx.waitUntil) ctx.waitUntil(stored);
      return json({ ...evidence, cache: { hit: false, stored_at: null } }, 200, cors);
    } catch (e) {
      return errorResponse(e, cors);
    }
  }
};

function errorResponse(e, headers) {
  if (e instanceof TargetError) return json({ error: e.code, message: e.message }, 400, headers);
  return json({ error: "internal", message: "The check failed. Nothing was stored." }, 500, headers);
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers
    }
  });
}

// --- CORS -----------------------------------------------------------------------------
// Same-origin deployments (worker route on the site's own domain) need no CORS at all.
// ALLOWED_ORIGINS lists other origins allowed to call the worker, comma-separated.

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return { vary: "Origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
}

// --- Rate limit -----------------------------------------------------------------------
// Uses the Workers rate-limiting binding when configured. Without it, falls back to a
// per-isolate counter, which is best effort only.

const counters = new Map();

async function allow(ip, env) {
  if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === "function") {
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    return success;
  }
  const now = Date.now();
  const entry = counters.get(ip);
  if (!entry || now - entry.start > FALLBACK_LIMIT.windowMs) {
    counters.set(ip, { start: now, count: 1 });
    if (counters.size > 5000) counters.clear();
    return true;
  }
  entry.count++;
  return entry.count <= FALLBACK_LIMIT.requests;
}

// --- 24-hour cache by host ------------------------------------------------------------
// KV when bound (works everywhere). Otherwise the Cache API, which only persists on a
// custom domain or route, not on workers.dev.

function cacheKey(host, url) {
  return new Request(`${url.origin}/__check-cache/${encodeURIComponent(host)}`);
}

async function readCache(host, env, url) {
  try {
    if (env.CHECK_CACHE) {
      const v = await env.CHECK_CACHE.get(`check:${host}`, "json");
      return v || null;
    }
    if (typeof caches !== "undefined") {
      const hit = await caches.default.match(cacheKey(host, url));
      return hit ? await hit.json() : null;
    }
  } catch { /* a cache failure never blocks a check */ }
  return null;
}

async function writeCache(host, evidence, env, url) {
  try {
    if (env.CHECK_CACHE) {
      await env.CHECK_CACHE.put(`check:${host}`, JSON.stringify(evidence), { expirationTtl: CACHE_TTL_SECONDS });
      return;
    }
    if (typeof caches !== "undefined") {
      await caches.default.put(cacheKey(host, url), new Response(JSON.stringify(evidence), {
        headers: { "content-type": "application/json", "cache-control": `public, max-age=${CACHE_TTL_SECONDS}` }
      }));
    }
  } catch { /* ignore */ }
}
