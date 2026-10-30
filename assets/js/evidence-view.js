// Renders an evidence object (SPEC §8.4) for /p/{domain}/ and /check/.
// Every statement shown carries the JSON pointer it was read from.

import { el, fmtNumber, fmtPct, fmtDate, fmtDateTime, UNKNOWN, VERTICALS, STABILITY_LABELS, STABILITY_TOOLTIP } from "./common.js";
import { SIGNALS, SIGNAL_LABELS, STANCES } from "./score.js";

const get = (obj, ptr) => ptr.split("/").slice(1).reduce((a, k) => (a == null ? undefined : a[k.replace(/~1/g, "/").replace(/~0/g, "~")]), obj);

function fact(text, value, ptr, { unknown = false } = {}) {
  const shown = value === null || value === undefined || value === "" ? UNKNOWN : value;
  return el("li", { class: "fact" },
    el("span", { class: "fact-text" }, text),
    el("span", { class: `fact-value${shown === UNKNOWN || unknown ? " unknown" : ""}` }, shown),
    el("code", { class: "ptr" }, ptr));
}

function yesNo(v, yes = "Yes", no = "No") {
  return v === true ? yes : v === false ? no : null;
}

function reading(text, ptr) {
  return el("div", { class: "reading" },
    el("span", { class: "micro" }, "Ayo’s reading"),
    text,
    ptr ? el("div", {}, el("code", { class: "ptr" }, ptr)) : null);
}

function section(title, tag, ...body) {
  return el("section", { class: "inner" },
    el("div", { class: "inner-head" }, el("span", {}, title), tag ? el("span", { class: "tag tag-neutral tag-sm" }, tag) : null),
    el("div", { class: "inner-body" }, ...body));
}

const STATUS_WORDS = { allowed: "Allowed", partial: "Partly disallowed", blocked: "Disallowed" };

// A live signal that has never been fetched for this domain. Not zero, not unknown-after-trying.
function notCollected(title, domain) {
  return section(title, "Not collected",
    el("p", { class: "small muted" }, "Not collected for the sample yet. ",
      el("a", { href: `/check/?url=${encodeURIComponent(domain)}` }, "Run the live checks"), " to read it now."));
}

// opts: { sampleDate } for the "Not in the dated sample" line; { sampleVertical } to show the
// sample's vertical beside a live check, which has none of its own.
export function renderEvidence(ev, opts = {}) {
  const live = ev.source === "live";
  const s = ev.signals || {};
  const sc = ev.score || {};
  const stanceCode = ev.stance ? ev.stance.code : "unknown";
  const vertical = ev.vertical || opts.sampleVertical || null;

  // --- Summary ---------------------------------------------------------------------
  const summary = el("div", { class: "window" },
    el("div", { class: "window-bar" },
      el("div", { class: "dots", "aria-hidden": "true" }, el("span"), el("span"), el("span")),
      el("span", { class: "window-title" }, ev.domain),
      live
        ? el("span", { class: "live" }, el("span", { class: "live-dot", "aria-hidden": "true" }), "Live")
        : el("span", { class: "window-stamp" }, `Dated sample · ${fmtDate(opts.sampleDate) || UNKNOWN}`)),
    el("div", { class: "window-body" },
      el("div", { class: "kpis" },
        el("div", { class: "kpi accent" },
          el("div", { class: "kpi-val" }, `${Math.round(sc.total ?? 0)} / ${Math.round(sc.max ?? 0)}`),
          el("div", { class: "kpi-label" }, "Score out of known maximum")),
        el("div", { class: "kpi" },
          el("div", { class: "kpi-val" }, vertical ? VERTICALS[vertical] || vertical : "Not assessed"),
          el("div", { class: "kpi-label" }, !ev.vertical && opts.sampleVertical ? "Vertical, from the dated sample" : "Vertical")),
        el("div", { class: "kpi" },
          el("div", { class: "kpi-val" }, s.reachability === undefined ? "Not checked" : STANCES[stanceCode] ? STANCES[stanceCode].label : UNKNOWN),
          el("div", { class: "kpi-label" }, "robots.txt policy, as declared")),
        el("div", { class: "kpi" },
          el("div", { class: "kpi-val" }, ev.fetch ? `${fmtNumber(ev.fetch.requests) ?? 0} / 8` : "Not run"),
          el("div", { class: "kpi-label" }, ev.fetch ? "Requests used" : "Live checks"))),
      el("p", { class: "small muted" },
        ev.fetch ? `Checked ${fmtDateTime(ev.checked_at) || UNKNOWN}. ` : `Sample collected ${fmtDate(opts.sampleDate) || UNKNOWN}. Live signals not collected yet. `,
        "Signals not read are left out of both the score and the maximum. They are never counted as zero."),
      // Wording comes from the current rules for this stance code; a stored or live check keeps
      // its own text in the raw JSON below.
      STANCES[stanceCode] && STANCES[stanceCode].angle
        ? reading(STANCES[stanceCode].angle, "/stance/code")
        : el("p", { class: "small muted" }, s.reachability === undefined
            ? "No opening angle yet. It comes from robots.txt, which hasn’t been checked for this publisher."
            : "No opening angle. robots.txt could not be read.")));

  // --- Breakdown -------------------------------------------------------------------
  const rows = SIGNALS.map((k) => {
    const pts = sc.points ? sc.points[k] : null;
    const max = sc.maxima ? sc.maxima[k] : sc.weights ? sc.weights[k] : null;
    const known = pts !== null && pts !== undefined;
    const fill = known && max ? Math.max(0, Math.min(100, (pts / max) * 100)) : 0;
    return el("li", { class: known ? "" : "unknown-signal" },
      el("div", { class: "bar-meta" },
        el("span", {}, SIGNAL_LABELS[k]),
        el("span", {}, known ? el("strong", {}, `${fmtNumber(pts)} / ${fmtNumber(max)}`) : "Unknown, left out")),
      el("div", { class: "bar-track" }, el("div", { class: "bar-fill", style: `width:${fill}%; background: var(--accent)` })),
      el("code", { class: "ptr" }, `/score/points/${k}`));
  });
  const breakdown = section("Score breakdown", "Weights 40 · 20 · 15 · 10 · 15", el("ul", { class: "breakdown" }, rows));

  const missed = Array.isArray(sc.missed) && sc.missed.length
    ? section("Why not higher", "Ayo’s reading",
        el("ul", { class: "facts" }, sc.missed.map((m, i) => el("li", { class: "fact" }, el("span", { class: "fact-text" }, m), el("span"), el("code", { class: "ptr" }, `/score/missed/${i}`)))))
    : null;

  // --- Signals ---------------------------------------------------------------------
  const r = s.readership || {};
  const readership = section("Citation share", "Dated sample",
    el("ul", { class: "facts" },
      r.status === "in_sample"
        ? [
            fact("Share of its vertical’s sampled probes whose answer cited it", fmtPct(r.share, 1), "/signals/readership/share"),
            fact("Probes citing it", r.probes_cited != null && r.probes_total != null ? `${fmtNumber(r.probes_cited)} of ${fmtNumber(r.probes_total)}` : null, "/signals/readership/probes_cited"),
            el("li", { class: "fact", title: STABILITY_TOOLTIP },
              el("span", { class: "fact-text" }, "Stability ", el("span", { class: "muted small" }, `(${STABILITY_TOOLTIP})`)),
              el("span", { class: "fact-value" }, STABILITY_LABELS[r.stability] || r.stability || UNKNOWN),
              el("code", { class: "ptr" }, "/signals/readership/stability")),
            fact("Sample", r.sample_id, "/signals/readership/sample_id")
          ]
        : fact(`Not in the dated sample (${fmtDate(opts.sampleDate) || "date not set"})`, "Unknown", "/signals/readership/status", { unknown: true })),
    el("p", { class: "small muted" }, "Citation frequency on this one dated sample. Not measured agent traffic, readership or revenue."));

  const p = s.placement || {};
  const placement = s.placement === undefined ? notCollected("Placement fit", ev.domain) : section("Placement fit", live ? "Live" : "Sample",
    el("ul", { class: "facts" },
      fact("Sitemap read", p.sitemap_url || "None reachable", "/signals/placement/sitemap_url"),
      fact("Sitemap URLs sampled", fmtNumber(p.slugs_sampled), "/signals/placement/slugs_sampled"),
      fact("Roundup, comparison or review slugs", p.slugs_sampled ? `${fmtNumber(p.slugs_matched)} (${fmtPct(p.slug_share)})` : null, "/signals/placement/slug_share"),
      fact("ItemList, Product or Review markup", (p.pages_checked || []).length ? ((p.schema_types || []).join(", ") || "None found") : null, "/signals/placement/schema_types"),
      fact("Pages checked", fmtNumber((p.pages_checked || []).length), "/signals/placement/pages_checked")),
    (p.matched_examples || []).length
      ? el("div", { class: "excerpt", "aria-label": "Matched sitemap URLs" }, (p.matched_examples || []).join("\n"))
      : null);

  const g = s.programmatic || {};
  const ads = g.ads_txt || {};
  const hb = g.header_bidding || {};
  const programmatic = s.programmatic === undefined ? notCollected("Programmatic stack", ev.domain) : section("Programmatic stack", "Initial HTML only",
    el("ul", { class: "facts" },
      fact("ads.txt", ads.present === null || ads.present === undefined ? (ads.note ? `Unknown (${ads.note.replace(/_/g, " ")})` : null) : yesNo(ads.present, "Published", "Not found"), "/signals/programmatic/ads_txt/present"),
      ads.present ? [
        fact("Records", fmtNumber(ads.records), "/signals/programmatic/ads_txt/records"),
        fact("Distinct ad systems", fmtNumber(ads.ad_systems), "/signals/programmatic/ads_txt/ad_systems"),
        fact("DIRECT / RESELLER", `${fmtNumber(ads.direct) ?? "?"} / ${fmtNumber(ads.reseller) ?? "?"}`, "/signals/programmatic/ads_txt/direct"),
        fact("MANAGERDOMAIN", ads.managerdomain || "Not declared", "/signals/programmatic/ads_txt/managerdomain"),
        fact("OWNERDOMAIN", ads.ownerdomain || "Not declared", "/signals/programmatic/ads_txt/ownerdomain")
      ] : null,
      fact("Header bidding", Array.isArray(hb.detected) ? (hb.detected.length ? hb.detected.map((x) => (x === "prebid" ? "Prebid" : "Amazon")).join(", ") : "Not seen in initial HTML") : null, "/signals/programmatic/header_bidding/detected"),
      fact("Google ad-server tag (reported, not scored)", yesNo(g.ad_server_tag ? g.ad_server_tag.gpt : null, "Present", "Not seen"), "/signals/programmatic/ad_server_tag/gpt")),
    el("p", { class: "small muted" }, "“Not seen” is not “absent”. Scripts that load after the first response are invisible to this check."));

  const re = s.reachability || {};
  const perAgent = Object.entries(re.per_agent || {});
  const reachability = s.reachability === undefined ? notCollected("Agent reachability", ev.domain) : section("Agent reachability", "Declared policy, not observed behaviour",
    el("p", { class: "small muted" }, "robots.txt is a request to crawlers. It doesn’t show real agent traffic, bot rules at the edge, who owns the policy, or willingness to pilot."),
    el("ul", { class: "facts" },
      fact("robots.txt", re.status ? `HTTP ${re.status}` : null, "/signals/reachability/status"),
      fact("Search and user-triggered agents", STATUS_WORDS[re.search] || null, "/signals/reachability/search"),
      fact("Training agents", STATUS_WORDS[re.training] || null, "/signals/reachability/training"),
      fact("Names any AI agent or carries a Content-Signal line", yesNo(re.ai_rules_present), "/signals/reachability/ai_rules_present")),
    perAgent.length
      ? el("div", { class: "table-scroll" }, el("table", { class: "data-table" },
          el("caption", { class: "visually-hidden" }, "Per-agent result for path /"),
          el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Agent"), el("th", { scope: "col" }, "Path /"))),
          el("tbody", {}, perAgent.map(([name, v]) => el("tr", {},
            el("td", { class: "strong" }, name),
            el("td", { class: v === "blocked" ? "" : "accent" }, v === "blocked" ? "Disallowed" : "Allowed"))))),
          el("code", { class: "ptr" }, "/signals/reachability/per_agent/{agent}"))
      : null,
    (re.excerpt || []).length ? [el("p", { class: "small muted", style: "margin-top:.75rem" }, "Excerpt"), el("pre", { class: "excerpt" }, re.excerpt.join("\n")), el("code", { class: "ptr" }, "/signals/reachability/excerpt")] : null,
    (re.content_signal || []).length ? [el("p", { class: "small muted", style: "margin-top:.75rem" }, "Content-Signal lines, recorded verbatim and not scored"), el("pre", { class: "excerpt" }, re.content_signal.join("\n"))] : null);

  const c = s.commerce || {};
  const commerce = s.commerce === undefined ? notCollected("Commerce monetisation", ev.domain) : section("Commerce monetisation", "Links in fetched HTML only",
    el("ul", { class: "facts" },
      fact("Affiliate links seen in the fetched HTML", Array.isArray(c.networks) ? (c.networks.length ? c.networks.join(", ") : "None seen, not assessed") : null, "/signals/commerce/networks", { unknown: Array.isArray(c.networks) && !c.networks.length }),
      (c.evidence || []).map((e, i) => fact(`${e.network}: link to ${e.pattern}`, e.page, `/signals/commerce/evidence/${i}`))),
    el("p", { class: "small muted" }, "Links rewritten by script after load, and ads run through an ad manager, are invisible here. None seen is unknown, not zero. Commercial readiness is reviewed by hand on the ",
      el("a", { href: "/first-wave/" }, "first wave"), "."));

  const cdn = s.cdn || {};
  const cdnSection = s.cdn === undefined ? notCollected("CDN", ev.domain) : section("CDN", "Shown, not scored",
    el("ul", { class: "facts" },
      fact("Providers in response headers", (cdn.providers || []).join(", ") || null, "/signals/cdn/providers"),
      fact("Headers seen", (cdn.evidence_headers || []).join(", ") || "None", "/signals/cdn/evidence_headers")),
    el("p", { class: "small muted" }, "A response header shows the edge a site sits behind. It doesn’t show whether the publisher’s team can deploy there, so this does not move the score."));

  // --- Fetch log -------------------------------------------------------------------
  const f = ev.fetch || {};
  const fetchLog = !ev.fetch ? notCollected("What the check fetched", ev.domain) : section("What the check fetched", null,
    el("ul", { class: "facts" },
      fact("User-agent", f.user_agent, "/fetch/user_agent"),
      fact("Requests to the publisher", f.requests != null ? `${f.requests} of 8` : null, "/fetch/requests"),
      (f.blocked || []).map((b, i) => fact(`Blocked our fetch (${b.status})`, b.url, `/fetch/blocked/${i}`)),
      (f.skipped || []).map((x, i) => fact(`Skipped: ${x.reason.replace(/_/g, " ")}`, x.url, `/fetch/skipped/${i}`))));

  const cannot = section("What can’t be seen from outside", null,
    el("ul", { class: "facts" }, (ev.cannot_see || []).map((t, i) => el("li", { class: "fact" }, el("span", { class: "fact-text" }, t), el("span"), el("code", { class: "ptr" }, `/cannot_see/${i}`)))));

  const raw = el("details", { class: "raw" },
    el("summary", {}, "Raw evidence JSON"),
    el("pre", { class: "block" }, JSON.stringify(ev, null, 2)));

  return el("div", { class: "stack" },
    summary,
    el("div", { class: "grid-2" }, el("div", { class: "stack" }, breakdown, missed), el("div", { class: "stack" }, readership, reachability)),
    el("div", { class: "grid-2" }, el("div", { class: "stack" }, placement, commerce), el("div", { class: "stack" }, programmatic, cdnSection)),
    el("div", { class: "grid-2" }, fetchLog, cannot),
    raw);
}

export { get as resolvePointer };
