// robots.txt parsing and matching per RFC 9309 (SPEC §3.4).
// - User-agent values match a crawler's product token case-insensitively.
// - Every group that names the token is merged; with none, the * groups apply.
// - The longest matching rule wins; on a tie, Allow wins.

export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  const contentSignal = [];
  let current = null;
  let lastWasAgent = false;

  const lines = String(text || "").replace(/^﻿/, "").split(/\r\n|\r|\n/);
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], lines: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      current.lines.push(raw.trim());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "content-signal") {
      contentSignal.push(raw.trim());
      if (current) current.lines.push(raw.trim());
      continue;
    }
    if (!current) continue; // rules before any user-agent line are ignored
    if (key === "allow" || key === "disallow") {
      current.rules.push({ type: key, path: value });
      current.lines.push(raw.trim());
    }
  }
  return { groups, sitemaps, contentSignal };
}

// The product token in a user-agent line is the part before any "/" or space.
function agentMatches(value, token) {
  const name = value.split(/[\s/]/)[0];
  return name === token.toLowerCase();
}

export function groupsFor(parsed, token) {
  const named = parsed.groups.filter((g) => g.agents.some((a) => agentMatches(a, token)));
  if (named.length) return { groups: named, matched: "named" };
  const star = parsed.groups.filter((g) => g.agents.includes("*"));
  return { groups: star, matched: star.length ? "star" : "none" };
}

function patternToRegExp(pattern) {
  let p = pattern;
  const anchored = p.endsWith("$");
  if (anchored) p = p.slice(0, -1);
  const body = p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

function normalisePath(path) {
  // Decode unreserved percent-escapes so /%7Efoo and /~foo compare equal.
  return path.replace(/%([0-9A-Fa-f]{2})/g, (m, hex) => {
    const c = String.fromCharCode(parseInt(hex, 16));
    return /[A-Za-z0-9\-._~]/.test(c) ? c : "%" + hex.toUpperCase();
  });
}

export function isAllowed(parsed, token, path = "/") {
  const { groups } = groupsFor(parsed, token);
  const target = normalisePath(path);
  let best = null;
  for (const g of groups) {
    for (const r of g.rules) {
      if (r.type === "disallow" && r.path === "") continue; // empty Disallow allows everything
      const rulePath = normalisePath(r.path);
      if (!patternToRegExp(rulePath).test(target)) continue;
      const len = rulePath.length;
      if (!best || len > best.len || (len === best.len && r.type === "allow")) best = { len, type: r.type };
    }
  }
  return !best || best.type === "allow";
}

// Summarise the declared policy for the listed AI agents (SPEC §3.4, §5).
export function summarisePolicy(parsed, agents) {
  const perAgent = {};
  const byGroup = { training: [], search: [] };
  for (const a of agents) {
    const ok = isAllowed(parsed, a.token, "/");
    perAgent[a.token] = ok ? "allowed" : "blocked";
    if (byGroup[a.group]) byGroup[a.group].push(ok);
  }
  const status = (list) => {
    if (!list.length) return null;
    if (list.every(Boolean)) return "allowed";
    if (list.every((x) => !x)) return "blocked";
    return "partial";
  };
  const tokens = agents.map((a) => a.token.toLowerCase());
  const namedGroups = parsed.groups.filter((g) => g.agents.some((v) => tokens.some((t) => agentMatches(v, t))));
  const aiRulesPresent = namedGroups.length > 0 || parsed.contentSignal.length > 0;

  let excerptGroups = namedGroups;
  if (!excerptGroups.length) excerptGroups = parsed.groups.filter((g) => g.agents.includes("*"));
  const excerpt = excerptGroups.flatMap((g) => g.lines);
  for (const l of parsed.contentSignal) if (!excerpt.includes(l)) excerpt.push(l);

  return {
    per_agent: perAgent,
    training: status(byGroup.training),
    search: status(byGroup.search),
    ai_rules_present: aiRulesPresent,
    content_signal: parsed.contentSignal.slice(),
    excerpt: excerpt.slice(0, 40)
  };
}
