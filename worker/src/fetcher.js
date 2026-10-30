// A budgeted, robots-aware fetch session for one check (SPEC §7).
// - At most `maxRequests` requests to the publisher, each with its own timeout.
// - Bodies are read up to `maxBytes` and then cut off.
// - Every host is checked against the guard and, unless exempt, the publisher's robots.txt.
// - Redirects are followed by hand so each hop is checked too.
// - A refusal (401, 403, 406, 429, 451) is recorded as evidence and the check continues.

import { assertPublicHostname, assertResolvesPublic, registrableDomain, TargetError } from "./guard.js";
import { parseRobots, isAllowed } from "./robots.js";

export const CRAWLER_TOKEN = "AyoGTMResearch";
const BLOCK_STATUSES = new Set([401, 403, 406, 429, 451]);

export class Session {
  constructor({ userAgent, registrable, maxRequests = 8, timeoutMs = 8000, maxBytes = 512 * 1024, fetchImpl = fetch, dnsCheck = true }) {
    this.userAgent = userAgent;
    this.registrable = registrable;
    this.maxRequests = maxRequests;
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
    this.fetchImpl = fetchImpl;
    this.dnsCheck = dnsCheck;
    this.requests = 0;
    this.blocked = [];
    this.skipped = [];
    this.robots = new Map();   // host -> { parsed, status, url, text, headers } | { unreachable: true }
    this.resolved = new Set(); // hosts that passed the DNS check
  }

  skip(url, reason) {
    if (!this.skipped.some((s) => s.url === url && s.reason === reason)) this.skipped.push({ url, reason });
  }

  async ensureHostSafe(host) {
    assertPublicHostname(host);
    if (registrableDomain(host) !== this.registrable) throw new TargetError("off_domain", "off_domain");
    if (this.dnsCheck && !this.resolved.has(host)) {
      await assertResolvesPublic(host, this.fetchImpl);
      this.resolved.add(host);
    }
  }

  // Load robots.txt for a host once. It is exempt from itself.
  async robotsFor(host) {
    if (this.robots.has(host)) return this.robots.get(host);
    const url = `https://${host}/robots.txt`;
    const res = await this.get(url, { respectRobots: false, maxRedirects: 2 });
    let entry;
    if (!res || res.error) entry = { unreachable: true, url, status: res ? res.status ?? null : null, res };
    else if (res.status >= 500) entry = { unreachable: true, url: res.url, status: res.status, res };
    else if (res.status >= 400) entry = { parsed: parseRobots(""), status: res.status, url: res.url, text: "", res }; // RFC 9309: 4xx = no rules
    else entry = { parsed: parseRobots(res.text), status: res.status, url: res.url, text: res.text, res };
    this.robots.set(host, entry);
    // A redirect (e.g. to www.) lands on another host's robots.txt. Remember it under that host too.
    const finalHost = res && res.url ? new URL(res.url).hostname : host;
    if (finalHost !== host && !entry.unreachable && !this.robots.has(finalHost)) this.robots.set(finalHost, entry);
    return entry;
  }

  async allowedByRobots(url) {
    const u = new URL(url);
    const entry = await this.robotsFor(u.hostname);
    // Unreachable robots.txt: RFC 9309 says assume complete disallow. Skip rather than crawl.
    if (entry.unreachable) return false;
    return isAllowed(entry.parsed, CRAWLER_TOKEN, u.pathname + u.search);
  }

  // Returns { url, status, headers, text, truncated } or { url, error, status? } or null when skipped.
  async get(startUrl, { respectRobots = true, maxRedirects = 1, accept = "*/*" } = {}) {
    let url = startUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      let u;
      try {
        u = new URL(url);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new TargetError("unsupported_scheme", "unsupported_scheme");
        await this.ensureHostSafe(u.hostname);
      } catch (e) {
        // The initial target is validated before the session starts, so anything caught
        // here is a later URL: record it and move on.
        const reason = e instanceof TargetError && e.code === "off_domain" ? "off_domain" : "unsafe_target";
        this.skip(url, reason);
        return { url, error: reason, redirectedOffDomain: hop > 0 && reason === "off_domain" };
      }
      if (respectRobots && !(await this.allowedByRobots(url))) {
        this.skip(url, "robots_disallow");
        return null;
      }
      if (this.requests >= this.maxRequests) {
        this.skip(url, "budget");
        return null;
      }
      this.requests++;
      let res;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        res = await this.fetchImpl(url, {
          method: "GET",
          redirect: "manual",
          signal: ctrl.signal,
          headers: { "user-agent": this.userAgent, accept }
        });
      } catch (e) {
        clearTimeout(timer);
        const reason = e && e.name === "AbortError" ? "timeout" : "fetch_error";
        this.skip(url, reason);
        return { url, error: reason };
      }

      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        clearTimeout(timer);
        try { await res.body?.cancel(); } catch { /* ignore */ }
        const next = new URL(res.headers.get("location"), url).toString();
        if (hop === maxRedirects) return { url, status: res.status, headers: res.headers, text: "", truncated: false, redirectLimit: true, location: next };
        url = next;
        continue;
      }

      if (BLOCK_STATUSES.has(res.status)) this.blocked.push({ url, status: res.status });
      let text = "";
      let truncated = false;
      try {
        ({ text, truncated } = await readCapped(res, this.maxBytes, url));
      } catch (e) {
        clearTimeout(timer);
        const reason = e && e.name === "AbortError" ? "timeout" : "fetch_error";
        this.skip(url, reason);
        return { url, error: reason };
      }
      clearTimeout(timer);
      return { url, status: res.status, headers: res.headers, text, truncated };
    }
    return null;
  }
}

async function readCapped(res, maxBytes, url) {
  if (!res.body) return { text: "", truncated: false };
  let stream = res.body;
  if (/\.gz($|\?)/i.test(url) && typeof DecompressionStream !== "undefined") {
    stream = stream.pipeThrough(new DecompressionStream("gzip"));
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let text = "";
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - received;
    if (value.byteLength >= room) {
      text += decoder.decode(value.subarray(0, room), { stream: false });
      truncated = true;
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  if (!truncated) text += decoder.decode();
  return { text, truncated };
}
