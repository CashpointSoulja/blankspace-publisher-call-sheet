// Target validation (SPEC §7). The worker only ever fetches public http(s) hosts that
// parse against the Public Suffix List and do not resolve to private or reserved space.

import { parse } from "tldts";

const RESERVED_SUFFIXES = [
  "localhost", "local", "internal", "intranet", "lan", "home", "corp", "private",
  "test", "example", "invalid", "onion", "arpa", "localdomain"
];

export class TargetError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Returns { host, url, registrable } or throws TargetError.
export function normaliseTarget(input) {
  if (typeof input !== "string" || !input.trim()) throw new TargetError("missing_url", "Give a publisher address.");
  let s = input.trim();
  if (s.length > 2048) throw new TargetError("too_long", "That address is too long.");

  const explicit = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s);
  if (explicit) {
    if (!/^https?$/i.test(explicit[1])) throw new TargetError("unsupported_scheme", "Only http and https addresses can be checked.");
  } else if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) {
    // mailto:, javascript:, file:, data: and similar, written without //
    throw new TargetError("unsupported_scheme", "Only http and https addresses can be checked.");
  } else {
    s = "https://" + s;
  }

  let u;
  try {
    u = new URL(s);
  } catch {
    throw new TargetError("invalid_url", "That is not a valid address.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new TargetError("unsupported_scheme", "Only http and https addresses can be checked.");
  if (u.username || u.password) throw new TargetError("credentials_in_url", "Addresses with a username or password are not checked.");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  assertPublicHostname(host);
  if (u.port && u.port !== "80" && u.port !== "443") throw new TargetError("non_standard_port", "Only the standard web ports are checked.");
  const parsed = parse(host, { allowPrivateDomains: false });
  return { host, url: `https://${host}/`, registrable: parsed.domain };
}

// Hostname-level checks, reused for every redirect hop.
export function assertPublicHostname(host) {
  if (!host) throw new TargetError("invalid_url", "That is not a valid address.");
  if (host.startsWith("[") || host.includes(":")) throw new TargetError("ip_literal", "IP addresses are not checked. Use the site’s domain name.");
  // The URL parser turns decimal, octal and hex IPv4 forms into dotted quads.
  if (/^\d+(\.\d+){3}$/.test(host)) throw new TargetError("ip_literal", "IP addresses are not checked. Use the site’s domain name.");
  if (!/^[a-z0-9.-]+$/.test(host) || host.split(".").some((l) => !l || l.length > 63 || l.startsWith("-") || l.endsWith("-"))) {
    throw new TargetError("invalid_host", "That is not a valid domain name.");
  }
  const last = host.split(".").pop();
  if (host === "localhost" || RESERVED_SUFFIXES.includes(last) || host.endsWith(".home.arpa")) {
    throw new TargetError("reserved_name", "Local and reserved names are not checked.");
  }
  const p = parse(host, { allowPrivateDomains: false });
  if (p.isIp) throw new TargetError("ip_literal", "IP addresses are not checked. Use the site’s domain name.");
  if (!p.domain || !p.publicSuffix || p.isIcann !== true) {
    throw new TargetError("not_public_suffix", "That domain does not end in a public suffix.");
  }
}

export function registrableDomain(host) {
  return parse(host, { allowPrivateDomains: false }).domain;
}

// --- Address-range blocklist ----------------------------------------------------------

const V4_BLOCKS = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
];

function v4ToInt(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

export function isPrivateV4(ip) {
  const n = v4ToInt(ip);
  if (n === null) return true;
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
  });
}

function v6ToWords(ip) {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  // Rewrite a trailing dotted quad as two hex words so one parser handles both forms.
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const n = v4ToInt(v4[1]);
    if (n === null) return null;
    s = s.slice(0, -v4[1].length) + (n >>> 16).toString(16) + ":" + (n & 0xffff).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const toNums = (part) => (part ? part.split(":").map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN)) : []);
  const head = toNums(halves[0]);
  const rest = halves.length === 2 ? toNums(halves[1]) : [];
  const fill = 8 - head.length - rest.length;
  if (fill < 0 || (halves.length === 1 && fill !== 0)) return null;
  const words = [...head, ...Array(fill).fill(0), ...rest];
  if (words.length !== 8 || words.some((w) => !Number.isInteger(w) || w < 0 || w > 0xffff)) return null;
  return words;
}

export function isPrivateV6(ip) {
  const w = v6ToWords(ip);
  if (!w) return true;
  const embeddedV4 = () => `${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`;
  if (w.every((x) => x === 0)) return true;                                    // ::
  if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return true;          // ::1
  if (w.slice(0, 5).every((x) => x === 0) && w[5] === 0xffff) return isPrivateV4(embeddedV4()); // ::ffff:a.b.c.d
  if (w[0] === 0x64 && w[1] === 0xff9b) return isPrivateV4(embeddedV4());     // 64:ff9b::/96 NAT64
  if (w[0] === 0x0100 && w[1] === 0 && w[2] === 0 && w[3] === 0) return true; // 100::/64 discard
  if (w[0] === 0x2001 && w[1] < 0x0200) return true;                          // 2001::/23 protocol assignments
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true;                        // documentation
  if (w[0] === 0x2002) return true;                                           // 6to4
  if ((w[0] & 0xfe00) === 0xfc00) return true;                                // fc00::/7 unique local
  if ((w[0] & 0xffc0) === 0xfe80) return true;                                // fe80::/10 link local
  if ((w[0] & 0xff00) === 0xff00) return true;                                // multicast
  return false;
}

// Resolve a hostname over DNS-over-HTTPS and refuse it if any answer is private or reserved.
// Cloudflare already refuses Worker subrequests to private space; this check says so plainly
// instead of returning an opaque error, and catches public names that point inward.
export async function assertResolvesPublic(host, fetchImpl = fetch) {
  const answers = [];
  for (const type of ["A", "AAAA"]) {
    let res;
    try {
      res = await fetchImpl(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
        headers: { accept: "application/dns-json" }
      });
    } catch {
      throw new TargetError("dns_unavailable", "Could not look up that domain. Try again shortly.");
    }
    if (!res.ok) throw new TargetError("dns_unavailable", "Could not look up that domain. Try again shortly.");
    const body = await res.json();
    for (const a of body.Answer || []) {
      if (a.type === 1 || a.type === 28) answers.push({ type: a.type, data: String(a.data) });
    }
  }
  if (!answers.length) throw new TargetError("no_dns_records", "That domain has no address records.");
  for (const a of answers) {
    const bad = a.type === 1 ? isPrivateV4(a.data) : isPrivateV6(a.data);
    if (bad) throw new TargetError("private_address", "That domain points to a private or reserved address.");
  }
  return answers;
}
