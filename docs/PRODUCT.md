# Publisher call sheet: product notes

By Ayo Ahmed. Unofficial concept, not affiliated with blankspace.

## ELI5

AI assistants answer shopping questions by quoting websites. Some of those websites are publishers that earn money from ads. blankspace wants to help those publishers earn from the AI visits too. I asked an AI engine 120 UK shopping questions, twice each, and wrote down every site it quoted. The sites quoted most often are the ones I’d call first. For each one, the site shows the proof. It also checks the publisher’s public files to see whether they could take part.

## PRD

**Problem.** If supply is the constraint, the first job is getting publishers live. Cold outreach to publishers is slow when the list isn’t ranked and the message can’t show why that publisher matters.

**User.** A founding GTM hire at blankspace, which is me in this concept, and the team reviewing that work.

**Goal.** A ranked list of publishers to call, where every reason on the list traces back to a file someone can open.

**In scope**
- A dated citation sample: one engine, 120 UK buyer queries, two runs, raw probes kept.
- A call sheet that ranks publishers by citation share, then by live signals where a check exists.
- A live check of any publisher’s public files: robots.txt, ads.txt, sitemap, headers and up to two pages.
- Evidence pages, outreach drafts addressed to roles, and a verifier that removes anything it can’t trace.
- A method page that states n, dates, formulas and limits.

**Out of scope.** Sending anything, a CRM, contact data, named people, and traffic or revenue estimates.

**Success.** A reviewer can open any number on the site and find where it came from. Booked meetings would be the real measure. That needs outreach, which this build doesn’t do.

## 5 Whys

1. Why build a call sheet? Because outreach needs a list, and an unranked list wastes the first weeks.
2. Why rank by AI citations? Because a publisher that AI answers already quote is one that agents already read.
3. Why does that matter to blankspace? Because agent visits to a publisher’s pages are the supply blankspace monetises.
4. Why add live signals? Because citation alone doesn’t show whether a publisher could take part: whether its policy allows AI search, whether it runs programmatic ads, whether its pages fit a list placement.
5. Why show the evidence? Because a first message that proves its point earns a reply. A claim that can’t be checked costs trust.

## Jobs to be done

- When I start outreach in a new vertical, I want a ranked list with reasons, so I can spend the first calls on the publishers most likely to say yes.
- When I write to a publisher, I want every claim tied to evidence, so nothing I send overstates what I know.
- When someone asks “why this publisher?”, I want to show the exact answers that cited it, so the reasoning is open to challenge.

## Viability against the role

| The role asks for | What exists | Gap |
|---|---|---|
| Outreach that books qualified publisher meetings | A first wave qualified by hand, a call sheet, evidence pages, two verified drafts asking for a feasibility conversation | Nothing has been sent, so there are no meetings yet |
| The GTM machine: lists, research agents, analytics | Citation sample, live-check worker, scoring, verifier | The live checks cover 27 publishers so far, not all 175 |
| Sequences and CRM | Not built. A CRM is a buying decision. The plan covers set-up. | Everything |
| A/B testing | The plan explains why small numbers rule out subject-line tests, with a calculator | No test has been run |
| Keeping pilots on track | Pilot-health checklist | No pilot data |
| An end-to-end project you can demo | This site, its repository and the deployed worker | None |

## Test results

Run on 30 Oct 2026 against the committed data.

| Check | Result |
|---|---|
| `node scripts/check.mjs --release`: standing rules, links, schemas, and every `sample.json` figure recomputed from the raw files | Pass. One warning: two crawler tokens are corroborated rather than vendor-verified. |
| `node --test tests/*.test.mjs`: call-sheet ordering, corrections, stance wording, commerce-unknown and verifier rules | 22 of 22 pass |
| `cd worker && npm test`: target guard, robots.txt parsing, signals, budget, rate limit and unbound fetch | 17 of 17 pass |
| Verifier on the two drafts (accounts ready for discovery only) | 2 sentences removed: one unmarked traffic claim, one claim with no evidence behind it. Every other claim kept. |
| My live QA on the deployed site | Every route returns 200. The automotive filter shows its 38 rows. Weights persist in the URL. A live check of TechRadar works from the browser across origins. |

## Revision after review (30 Oct 2026)

The first version ranked 175 domains and called the top "who I’d call first". Reviewing it against the role and the live site showed that this was research, not a GTM decision:

- **#1 wasn’t a publisher.** drive.co.uk is now a car marketplace. Its classification named a parent company the current site doesn’t support. It is corrected in `data/corrections.json`, with sources, and the collected sample is unchanged.
- **The front page recommended calling sites that block AI search.** Stance was 10 points and gated nothing.
- **Labels stated inferences as facts.** “No owner yet” read robots.txt as if it showed an org chart. Labels now say only what robots.txt declares.
- **The commerce signal was blind.** It saw no affiliate network on 25 fully read checks, including publishers whose own pages confirm ads and affiliate revenue. None seen is now unknown, not zero.
- **A CDN header isn’t deployability.** It may be bot protection. Deployment is an open gate.

So the site now leads with a first wave, qualified by hand from current commercial pages: two accounts ready for discovery, two on hold with their reasons, and one excluded. The ranked list stays as the engine behind it. I chose to show fewer verified accounts rather than fill a quota.

Limits: commercial findings come from public pages I read on 30 Oct 2026. They show a commercial route, not willingness to buy. Nothing has been sent.

## v2 roadmap

1. **Qualify the next wave by hand,** from the top of the call sheet, and record each decision with its sources.
2. **Live checks for the rest of the publishers.** Then the call sheet ranks every row on the same five signals.
3. **More engines and runs.** Citation share comes from one engine on one day. A second engine and repeat runs would show which citations are stable.
4. **Decide the citation-share scale.** The full-marks cap at 1 in 4 ties the top 13, and raw share breaks those ties. Half the publishers sit on one or two citations, which a re-run could easily change. The options are to keep the scale, to give no credit below three citations, or to scale within each vertical. Each changes the rubric, so each needs a decision first.
5. **Reply tracking.** Once outreach is real, record replies against stance and score, and drop signals that predict nothing.
6. **CRM import.** Export the call sheet with evidence links into whichever CRM the team chooses.
