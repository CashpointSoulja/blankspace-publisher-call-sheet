# Brand pack

The style guide for this site. Where it and `index.html` (or any page) disagree, this file wins. Where it and `SPEC.md` disagree on a visual value, this file wins: it is measured, the spec's §1 table was written before measurement.

## Sources

Every value below comes from one of these. Nothing is estimated.

| Code | Source |
|---|---|
| **CSS** | `research/blankspace-main.css`. blankspace.so's production stylesheet, unmodified, collected by the project owner through a desktop browser on 30 Oct 2026. Line references are to the file after splitting on `}`. |
| **SHOT** | `research/screenshot-hero.png`, `screenshot-dashboard.png`, `screenshot-audience.png` (1280 × 720). Pixel values sampled directly. |
| **NOTES** | `research/brand-scrape.md`. Owner's computed-style notes. Where NOTES and CSS disagree, CSS wins and the disagreement is listed in [Corrections to the notes](#corrections-to-the-scrape-notes). |
| **LOGO** | `assets/logo-text-white.png`. The real wordmark. Byte-identical to `research/logo-text-white.png`. |

blankspace's hosts are not reachable from the build environment, so the scrape was collected outside it and committed to `research/`. This pack treats that material as the scrape.

---

## 1. Colour

### Core tokens (verbatim from their `:root`, CSS)

| Token here | Their token | Value | Use |
|---|---|---|---|
| `--bg` | `--bg` | `#000` | Page background. Pure black, no texture. |
| `--text` | `--text` | `#ffffffeb` (white 0.92) | Body text. |
| `--heading` | n/a | `#fff` | Headings, stat values, the one strong word in a row. Their heading classes all set `color:#fff` explicitly. |
| `--muted` | `--muted` | `#ffffff8c` (white 0.55) | Secondary text, nav links, ghost buttons, table cells. |
| `--faint` | `--faint` | `#ffffff4d` (white 0.30) | **Non-text only here** (dividers, separator dots, placeholder bars). See §8. |
| `--surface` | `--surface` | `#ffffff0a` (white 0.04) | Card fill, section band fill. |
| `--surface-2` | `--surface2` | `#ffffff12` (white 0.07) | Raised card fill, hover fill. |
| `--border` | `--border` | `#ffffff1a` (white 0.10) | Hairlines, card borders, section dividers. |
| `--border-2` | `--border2` | `#ffffff29` (white 0.16) | Stronger borders: nav pill, buttons, inputs, raised cards. |
| `--accent` | `--c-blue` | `#5d94cf` = `rgb(93,148,207)` | Primary accent: buttons, highlighted stats, active states, eyebrows, links. |
| `--accent-dim` | `--c-blue-dim` | `#5d94cf1f` (accent 0.12) | Icon tiles, active footer variant. |

The other palette entries exist on their site but this build does not use them: `--c-orange #ef722e`, `--c-yellow #f4c627`, `--c-pink #e0676d`, `--c-darkblue #282e4c`. Using them would imply a second product mode. The one exception is `--c-red #de4345`, kept as `--error` for form errors only, as their `.v2b-form-error` does (4.98 : 1 on black).

### Measured literals (not tokens on their site, used repeatedly in CSS)

| Token here | Value | Where they use it |
|---|---|---|
| `--green` | `#3ecf8e` | Live dot, "Live" label, revenue cells, "up" badge (CSS `.v2b-dash-chrome__live`, `.v2b-dash-live-dot`, `.v2b-card__dot`). SHOT confirms. |
| `--chrome` | `#0b0d11` | Product-window body (CSS `.v2b-dash-chrome`; SHOT `rgb(11,13,17)`). |
| `--chrome-bar` | `#13151b` | Product-window title bar (CSS `.v2b-dash-chrome__bar`; SHOT `rgb(19,21,27)`). |
| `--panel` | `#0e1117` | Large tabbed panel (CSS `.v2b-tab-panel`; SHOT `rgb(14,17,23)`). |
| `--chrome-border` | `#ffffff1f` (0.12) | Product-window outer border. |
| `--chrome-line` | `#ffffff12` (0.07) | Lines inside the window: bar border, panel border. |
| `--row-line` | `#ffffff0a` (0.04) | Table row separators inside the window. |
| `--nav-bg` | `#080808e0` | Floating nav pill. |
| `--accent-tag-bg` | `#5d94cf14` (0.08) | Accent tag fill (`.hero-tag`), accent KPI tile. |
| `--accent-tag-border` | `#5d94cf4d` (0.30) | Accent tag border, accent card border. |
| `--accent-outline` | `#5d94cf80` (0.50) | Outline accent button border (`.platform-card__cta--publisher`). |
| `--track` | `#ffffff0f` (0.06) | Bar track. |
| `--track-fill` | `#ffffff2e` (0.18) | Neutral bar fill. Highlighted bar uses `--accent`. |
| `--link-hover` | `#7aabde` | Accent link hover (`.footer-link--accent:hover`). |
| Window dots | `#ff5f56`, `#ffbd2e`, `#27c93f` | Mac traffic lights, SHOT (dashboard, left of the bar). |
| Hero glow | `radial-gradient(80% 50% at 50% -10%, #5d94cf26 0%, #0000 70%)` | Behind the hero (`.hero:before`). |

### Colour rules

- Black page, white type, one blue. Blue is the only chromatic colour in normal content.
- Green means live status and nothing else. blankspace also uses it for revenue figures. This build has no revenue data, so it never shows a green number. The window's third traffic-light dot is chrome, not data, and stays as measured.
- Tints are built from the accent at fixed alphas: 0.08 fill + 0.30 border for tags, 0.12 for icon tiles, 18% fill + 50% border for an active tab.

## 2. Type

### Faces and loading

| Role | Face | Weights on their site | Weights loaded here |
|---|---|---|---|
| Headings, buttons, tabs, stat values | Montserrat | 400, 600, 700, 800, 900 (NOTES, Google Fonts) | 700, 800, 900 |
| Body, labels, nav | Nunito Sans | 300 to 700 | 400, 600, 700 |
| Mono (paths, pointers, robots.txt excerpts) | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` | system | system |

Font stacks, verbatim (CSS):

```css
--font-body: "Nunito Sans", ui-sans-serif, system-ui, -apple-system, sans-serif;
--font-heading: "Montserrat", ui-sans-serif, system-ui, -apple-system, sans-serif;
```

Google Fonts URL used on every page:

```
https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Nunito+Sans:wght@400;600;700&display=swap
```

Nunito Sans 800 is not part of their site. Do not load or use it.

### Scale (CSS, measured at 1280 px)

| Role | Face / weight | Size | Line height | Tracking | Colour | Their selector |
|---|---|---|---|---|---|---|
| Body | Nunito Sans 400 | 16px | 1.6 | 0 | `--text` | `body` |
| Page H1 (split hero) | Montserrat 900 | `clamp(2rem, 4vw, 3rem)` = 48px | 1.1 | -0.03em (-1.44px) | `#fff`, highlight span `--accent` | `.v2b-hero__heading` |
| Page H1 (inner pages) | Montserrat 900 | `clamp(2rem, 4vw, 3rem)` | 1.1 | -0.03em | `#fff` | `.blog-hero h1`, `.platforms-heading` |
| Section H2 | Montserrat 800 | `clamp(1.75rem, 3.5vw, 2.5rem)` = 40px | 1.15 | -0.02em (-0.8px) | `#fff` | `.section-heading` |
| Block H2 | Montserrat 800 | 2rem | 1.15 | -0.025em | `#fff` | `.v2b-faqs__heading`, `.v2b-audiences__heading` |
| Panel H3 | Montserrat 800 | 1.75rem | 1.2 | -0.025em | `#fff` | `.v2b-tab-heading` |
| Card title | Montserrat 700 | 1rem to 1.1875rem | 1.3 | 0 | `#fff` | `.feature-title`, `.blog-card-title` |
| Step / small title | Montserrat 700 | 0.9375rem | 1.15 | 0 | `#fff` | `.step-title` |
| Lead / sub | Nunito Sans 400 | 1rem to 1.0625rem | 1.65 to 1.7 | 0 | `--muted` | `.v2b-hero__sub`, `.section-sub` |
| Card body | Nunito Sans 400 | 0.875rem to 0.9375rem | 1.6 to 1.7 | 0 | `--muted` | `.feature-desc`, `.v2b-tab-desc` |
| Long-form body | Nunito Sans 400 | 1.0625rem | 1.75 | 0 | `#ffffffc7` (0.78) | `.post-body p` |
| Eyebrow | Nunito Sans 700 | 0.75rem | inherit | 0.1em, uppercase | `--accent` | `.section-label` |
| Tag pill | Nunito Sans 700 | 0.75rem | inherit | 0.1em, uppercase | `--accent` on tint | `.hero-tag` |
| Table head / panel head | Nunito Sans 700 | 0.6875rem | inherit | 0.06em, uppercase | see §8 | `.v2b-dash-th`, `.v2b-dash-panel__head` |
| Footer column title | Montserrat 700 | 0.6875rem | inherit | 0.1em, uppercase | see §8 | `.footer-col-title` |
| Nav link | Nunito Sans 600 | 0.8125rem | inherit | 0 | `--muted`, hover `--text` | `.nav-link` |
| Big stat | Montserrat 900 | 2.5rem (to `clamp(2.5rem,5vw,4rem)`) | 1 | -0.02em to -0.04em | `#fff` or `--accent` | `.stat-value`, `.v3-stat__value` |
| Card stat | Montserrat 900 | 1.5rem to 2rem | 1 | -0.02em to -0.03em | `--accent` | `.platform-card__stat-val`, `.v2b-tab-stat-val` |
| KPI value | Montserrat 800 (inherits body face on their site) | 1.125rem | 1.2 | -0.02em | `--text`, accent tile `--accent` | `.v2b-dash-kpi__val` |
| Table cell | Nunito Sans 400 | 0.75rem | inherit | 0, `tabular-nums` | `--muted` | `.v2b-dash-row__path` |

Rules:
- Headings are tight (1.1 to 1.2) with negative tracking that grows with size: -0.03em at H1, -0.02em at H2, -0.025em at block H2 and H3.
- One phrase in the H1 may be set in `--accent` with a `<span>`. They use this on every hero. Use it at most once a page.
- Numbers use `font-variant-numeric: tabular-nums` in tables.
- Uppercase is only for eyebrows, tags, table heads and panel heads. Never for headings or buttons.

## 3. Space and layout

| Token | Value | Source |
|---|---|---|
| `--wrap` | 1080px | `.container{max-width:1080px}` |
| `--gutter` | 1.5rem (24px) | `.container{padding:0 1.5rem}` |
| Section padding | 5rem top and bottom; 3rem at ≤ 640px | `.section`, `.v2b-faqs`, `.v2b-integrations` |
| Section divider | `1px solid var(--border)` on top | `.v2b-faqs`, `.v2b-audiences` |
| Grid gaps | 1rem, 1.25rem, 1.5rem (card grids); 4rem (two-column text and visual) | `.feature-grid`, `.v2b-tab-pane` |
| Eyebrow to heading | 0.75rem | `.section-label` |
| Heading to sub | 1rem | `.section-heading` |
| Sub to content | 3.5rem (sections), 2rem (hero) | `.section-sub`, `.v2b-hero__sub` |

Spacing steps in use (rem): 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5. Do not invent steps between these.

Breakpoints (CSS): 1024px (dashboard collapses), 900px (two-column grids stack, nav links hide), 640px (section padding drops, tables simplify), 480px (hero buttons go full width).

## 4. Radii, borders, shadows

| Token | Value | Use (their selector) |
|---|---|---|
| `--radius-pill` | 999px | Nav, nav buttons, tag pills, tabs, segmented toggle |
| `--radius-panel` | 16px | Tabbed panel, contact card, mobile menu |
| `--radius` | 14px | Cards: feature, blog, platform, CTA card, cookie banner |
| `--radius-chrome` | 12px | Product window, video |
| `--radius-sm` | 8px | Buttons, inputs, inner panels, KPI strip, icon tile |
| `--radius-xs` | 5px | Inline code, question chips |

Borders are always 1px. The only 2px borders are the step-number circle and the FAQ answer's left rule.

Shadows (verbatim):

```css
/* product window */  box-shadow: inset 0 0 0 1px #ffffff0a, 0 24px 60px #00000080;
/* tabbed panel */    box-shadow: inset 0 0 0 1px #ffffff0a, 0 8px 32px #0003;
/* floating nav */    box-shadow: 0 4px 24px #0006;
```

Plain cards have no shadow.

## 5. Components

### Floating nav

```css
position: sticky; top: 0; padding: 1rem 1.5rem;                  /* outer */
background: #080808e0; backdrop-filter: blur(14px);
border: 1px solid var(--border-2); border-radius: 999px;
width: min(1080px, 100vw - 3rem); padding: .5rem .5rem .5rem 1.75rem;
box-shadow: 0 4px 24px #0006;
```

Wordmark left at 20px tall. Links follow at 0.8125rem / 600 / `--muted`, padding `.35rem .7rem`. Buttons sit on the right. Links hide at ≤ 900px. Here the right-hand slot holds the "Unofficial concept" tag (SPEC §1: the wordmark is always paired with it).

### Buttons

| Variant | Spec (CSS) | Here |
|---|---|---|
| Primary, large | Montserrat 700, 0.9375rem, padding `.75rem 1.75rem`, radius 8px, fill `--accent`, border `--accent`, text `#fff`, hover `filter: brightness(1.1)` | Same radius, fill and colours, but text at **1.1875rem / 700**, for contrast (§8). Padding drops to `.625rem 1.5rem` so the button keeps their 44px height. An arrow `→` may follow the label, as on their hero. |
| Ghost, large | Same shape, transparent, border `--border-2`, text `--muted`, hover text `--text` | As measured |
| Outline accent | Montserrat 700, 0.875rem, radius 999px, padding `.75rem 1.75rem .9rem`, transparent, text `--accent`, border `#5d94cf80`, hover fill `--accent` and text `#fff` | As measured. Use for small accent actions where a filled button would put sub-19px white text on blue. |
| Nav pill | 0.8125rem / 600, radius 999px, padding `.4rem .875rem`, border `--border`, text `--muted` | As measured (ghost only, see §8) |

### Tag pill (status tags)

```css
font: 700 .75rem var(--font-body); letter-spacing: .1em; text-transform: uppercase;
color: var(--accent); background: #5d94cf14; border: 1px solid #5d94cf4d;
border-radius: 999px; padding: .3rem .9rem;
```

Neutral variant for status tags that are not highlights (`DATED SAMPLE`, `REMOVED`): `color: --muted; background: --surface; border: 1px solid --border`, the pattern of `.v2b-card__badge`. Small variant: 0.6875rem, padding `.2rem .5rem`.

### Tabs and filters

```css
font: 700 .8125rem var(--font-heading); color: var(--muted);
background: #ffffff0a; border: 1px solid #ffffff14; border-radius: 999px; padding: .5rem 1.25rem;
/* hover */  color: var(--text); background: #ffffff12; border-color: #ffffff26;
/* active */ color: #fff; background: color-mix(in srgb, var(--accent) 18%, transparent);
             border-color: color-mix(in srgb, var(--accent) 50%, transparent);
```

Segmented toggle (two options): track `--surface` with `--border`, 4px padding. The active option is a solid `--accent` pill with white text, Montserrat 700 0.75rem, tracking 0.02em.

### Cards

| Variant | Spec | Use here |
|---|---|---|
| Card | `--surface` fill, 1px `--border`, radius 14px, padding 1.75rem, hover border `--border-2` | Next-step cards, pilot sections, plan weeks |
| Raised card | `--surface-2` fill, 1px `--border-2`, radius 14px, padding 1.25rem | Side panels, live-check result summary |
| Accent card | `#5d94cf0a` fill, 1px `#5d94cf4d`, radius 14px, padding 2rem to 2.5rem | Live-check call to action |
| Inner panel | `#ffffff08` fill, 1px `#ffffff12`, radius 8px, head strip `#ffffff05` with bottom border `#ffffff0f` | Panels inside a product window |

### Product window (mac chrome)

```css
.window       { background: #0b0d11; border: 1px solid #ffffff1f; border-radius: 12px; overflow: hidden;
                box-shadow: inset 0 0 0 1px #ffffff0a, 0 24px 60px #00000080; }
.window-bar   { background: #13151b; border-bottom: 1px solid #ffffff12; padding: .625rem 1rem; gap: 1rem; }
.dots span    { width: 10px; height: 10px; border-radius: 50%; }   /* gap 6px; #ff5f56 #ffbd2e #27c93f */
.window-title { font-size: .6875rem; font-weight: 500; letter-spacing: .02em; text-align: center; flex: 1; }
.window-body  { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
```

The live indicator sits at the right of the bar: `--green`, 0.6875rem / 700, with a 7px dot.

### KPI strip

A grid of tiles with 1px gaps over a `#ffffff0f` background, radius 8px, `overflow: hidden`. Tile: `--chrome` fill, padding `.875rem 1rem`. Value 1.125rem / 800 / -0.02em. Label 0.6875rem below. The highlighted tile has `#5d94cf14` fill and an `--accent` value.

### Data table (inside a window)

- Head: 0.6875rem / 700 / 0.06em uppercase, padding `.625rem .75rem`.
- Rows: `border-top: 1px solid #ffffff0a`. Cells 0.75rem, padding `.55rem .75rem`, `tabular-nums`.
- Paths and domains: `--muted`. Emphasised value: `--accent`, weight 600 to 700.

On full pages (the call sheet) the same pattern scales up one step: cells at 0.875rem and the domain at 600.

### Bars

Track 5px tall, `#ffffff0f`, radius 99px. Fill `#ffffff2e`, or `--accent` for the highlighted row. Label row above the bar: name left, value right, 0.75rem.

### Inputs

```css
border: 1px solid var(--border-2); border-radius: 8px; background: #ffffff0a;
font: .875rem var(--font-body); color: var(--text); padding: .625rem .875rem;
/* placeholder */ color: var(--faint);
/* focus */       border-color: var(--accent);
```

Labels: 0.75rem / 600 / 0.04em.

### Accordion

Item: `border-bottom: 1px solid --border`. Question: 1rem / 700 / `--text`, padding 1.375rem 0. Icon `+` in `--faint`, turning `--accent` when open. Answer: `--muted`, 0.9375rem / 1.75, `border-left: 2px solid --border-2`, padding `0 0 1.5rem 1.25rem`.

### Footer

`border-top: 1px solid --border`, padding 4rem 0 0. Column titles in Montserrat 700 0.6875rem / 0.1em uppercase. Links 0.875rem / 500 / `--muted`, hover `--text`. Bottom bar: border-top, centred, 0.8125rem.

### Live indicator

7px `--green` dot with `animation: livePulse 1.6s ease-in-out infinite`, where `livePulse` fades opacity 1 → 0.3 → 1. The label is `--green`, 0.6875rem / 700. It is the only animated element on the page. It is static under `prefers-reduced-motion: reduce`.

### Motion

Hover and colour transitions: 0.15s. Tab content: 0.2s fade. Nothing else moves.

## 6. Wordmark

| Property | Value |
|---|---|
| File | `assets/logo-text-white.png` |
| Size | 1767 × 275 px, RGBA, white on transparent, cropped to the ink with no padding (LOGO) |
| Aspect | 6.43 : 1 |
| Display height | 20px in the nav (`.nav-brand-logo`), so 129px wide |
| Clear space | At least the height of the wordmark on every side |
| Background | Black or `--chrome` only. Never on the accent. |
| Pairing | Always followed by the "Unofficial concept" tag (SPEC §1) |
| Name in text | Lowercase "blankspace", always, including at the start of a sentence |

Their condensed nav also uses a two-shape icon mark (`.nav-brand-icon`, SHOT). It is not in `research/` and is not used here.

## 7. Voice

From NOTES and the visible copy in SHOT.

- Short declarative sentences. One idea each.
- No exclamation marks.
- British spellings: monetise, monetisation, personalised, behaviour, colour, organisation, analyse.
- Sentence case for headings and buttons.
- Uppercase only in microcopy labels.
- Typographic apostrophes and quotes in visible text: ’ “ ”.
- Forward actions may end in an arrow, as theirs do: “Free Site Audit →”, “Find out more →”.
- Numbers are prominent. A figure is either the measured value or "Unknown". Never a guess and never a stand-in zero.
- Do not borrow product vocabulary for our own features ("AI Revenue", "monetise" and "observe" mode tags, "Live Search Agents" as a feature name). Reuse their component styles, not their product words. (SPEC §1)

## 8. Accessibility deviations

The pack copies blankspace exactly except where an exact copy would fail WCAG 2.2 AA. Each deviation is the smallest change that passes.

| Pair | Ratio | blankspace | Here |
|---|---|---|---|
| `--text` on black | 17.6 : 1 | Body text | Same |
| `--muted` on black | 6.25 : 1 | Secondary text | Same |
| `--faint` on black | **2.45 : 1** | Table heads, labels, footer titles, placeholders | Information-bearing text uses `--muted` instead. `--faint` is kept for dividers, decorative separators and input placeholders that duplicate a visible label. |
| `--accent` on black | 6.60 : 1 | Links, eyebrows, stats | Same |
| `#fff` on `--accent` | **3.18 : 1** | 15px / 700 button labels | Filled buttons carry labels at ≥ 1.1875rem (19px) / 700. That is WCAG large text, which needs 3 : 1. Smaller accent actions use the outline accent button (6.60 : 1). |
| `#fff` on `--accent` at `brightness(1.1)` | **2.65 : 1** | Primary button hover | Hover keeps the fill and lifts the border to `#fff` instead of brightening. |
| `--green` on black | 10.5 : 1 | Live label | Same |

Focus: blankspace removes outlines on inputs. Here every focusable element shows `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible`.

---

## 9. Mismatches found in the original `index.html` concept

Each is fixed in the shipped pages. "Was" is the concept; "Now" is this pack.

| # | Area | Was | Now |
|---|---|---|---|
| 1 | Wordmark file | `/assets/blankspace-wordmark.png` (does not exist, so the image was broken) | `/assets/logo-text-white.png` |
| 2 | Wordmark height | 22px | 20px |
| 3 | `--muted` | white 0.62 | white 0.55 (`#ffffff8c`) |
| 4 | `--faint` | white 0.38, used for text | white 0.30, non-text only (§8) |
| 5 | `--green` | `#3fb97a` (placeholder) | `#3ecf8e` |
| 6 | `--card` | `#0a1628`, a blue navy (placeholder) | No navy exists. Cards are `--surface` (white 0.04) on black. Windows are `#0b0d11`. Panels are `#0e1117`. |
| 7 | `--card-raised` | `#0e1d33` | `--surface-2`, white 0.07 |
| 8 | Borders | One token (`--line` 0.10) | `--border` 0.10 and `--border-2` 0.16, plus window-specific 0.12, 0.07 and 0.04 |
| 9 | Accent tint | One tint at 0.16 | 0.08 fill + 0.30 border (tags); 18% + 50% (active tab); 0.12 (icon tile) |
| 10 | Card radius | 16px everywhere | 14px cards, 12px windows, 8px inner panels, buttons and inputs |
| 11 | Container | 1180px, gutter `clamp(20px, 4vw, 40px)` | 1080px, gutter 1.5rem |
| 12 | Body size | 17px | 16px |
| 13 | Montserrat weights | 900 only | 700, 800, 900 |
| 14 | Nunito Sans weights | 400, 600, 700, 800 (800 used for labels and buttons) | 400, 600, 700. 800 is not on their site. |
| 15 | Heading weights | All 900 | H1 900, H2 800, card titles 700 |
| 16 | H1 | `clamp(2.1rem, 4.4vw, 3.75rem)`, line height 1.04, tracking -0.015em | `clamp(2rem, 4vw, 3rem)`, 1.1, -0.03em |
| 17 | H2 | `clamp(1.6rem, 2.8vw, 2.4rem)`, 1.1, -0.015em, 900 | `clamp(1.75rem, 3.5vw, 2.5rem)`, 1.15, -0.02em, 800 |
| 18 | Microcopy | 0.72rem / 800 / 0.12em, muted | 0.75rem / 700 / 0.1em. Eyebrows in accent. Table heads 0.6875rem / 0.06em. |
| 19 | Tag pill | Neutral border, muted text | Accent text on 0.08 tint with 0.30 border. Neutral variant for non-highlight statuses. |
| 20 | Primary button | Nunito Sans 800, pill, 52px tall | Montserrat 700, radius 8px, padding `.75rem 1.75rem`, label 19px for contrast (§8), arrow suffix |
| 21 | Button hover | Lighter fill `#7aaadb` (white text drops to 2.4 : 1) | Fill unchanged, border lifts to white |
| 22 | Ghost button | `--line` border, white text | `--border-2` border, `--muted` text, hover `--text` |
| 23 | Tabs and filters | Nunito Sans 700 0.875rem, transparent, tint 0.16 + accent border | Montserrat 700 0.8125rem, `#ffffff0a` fill, `#ffffff14` border, active 18% / 50% accent mix |
| 24 | Header | Static bar, links at 15px / 700 | Sticky floating pill nav: blur, `#080808e0`, `--border-2`, shadow. Links 13px / 600. |
| 25 | Window chrome | Bar `rgba(255,255,255,.02)`, body navy, radius 16px, dot gap 7px | Bar `#13151b`, body `#0b0d11`, border `#ffffff1f`, radius 12px, shadow as measured, dot gap 6px, dots `#ff5f56 #ffbd2e #27c93f` |
| 26 | Live dot | 8px, expanding box-shadow ring, 2.2s | 7px, opacity pulse 1 → 0.3, 1.6s ease-in-out |
| 27 | Input | Pill, 52px tall, black fill | Radius 8px, `#ffffff0a` fill, `--border-2`, 0.875rem, padding `.625rem .875rem` |
| 28 | Table | 15px cells, `--line` row borders | 0.875rem cells (full page) or 0.75rem (in window), `#ffffff0a` rows, `tabular-nums` |
| 29 | Bars | 8 to 10px tall, `--skeleton` track | 5px, `#ffffff0f` track, `#ffffff2e` fill, accent for the highlight |
| 30 | Section rhythm | `clamp(56px, 8vw, 96px)` | 5rem; 3rem at ≤ 640px |
| 31 | Big figure | No tracking | -0.02em, line height 1 |
| 32 | Hero glow | None | Accent radial gradient as measured |
| 33 | Nav | No Pilots link | All pages linked |
| 34 | Copy | "across your three verticals" (assumes blankspace's verticals) | Names the three verticals |
| 35 | Copy | "Your publisher universe in three verticals is hundreds" (unsourced estimate) | Removed |
| 36 | Copy | "~430 sends per variant" (unstated assumptions) | Computed on `/plan/` with the formula and its assumptions shown: 435 at α = 0.05 two-sided, 80% power |
| 37 | Routes | `/targets`, `/check` and others without a trailing slash, against a static host | Directory routes with trailing slashes, plus `_redirects` for `/p/{domain}/` |

## Corrections to the scrape notes

Where `research/brand-scrape.md` and the stylesheet disagree, the stylesheet is the source.

| Note says | Stylesheet says | Used |
|---|---|---|
| Primary CTA "solid #5d94cf fill, dark text" | `.btn-primary{color:#fff}`, `.nav-btn-solid{color:#fff}`. SHOT button text pixels are `rgb(255,255,255)`. | White text |
| Primary CTA "pill radius (see Contact Us)" | Hero `.btn` uses `--radius-sm` (8px). Only the nav "Contact Us" (`.nav-btn-solid`) is a pill. SHOT agrees. | 8px for page buttons, pill for nav-sized controls |
| Cards: 0.03 fill, 0.07 border, 8px radius | True for inner dashboard panels (`.v2b-dash-panel`). Page cards (`.feature-card`, `.blog-card`) are `--surface` 0.04 / `--border` 0.10 / 14px. | Both, by context (§5 Cards) |

## Checking a page against this pack

1. Every colour in `assets/css/site.css` resolves to a token in §1.
2. No font weight outside §2's loaded set.
3. No radius outside §4.
4. `node scripts/check.mjs` passes. It covers attribution, links and data. Visual fidelity is reviewed by eye against `research/screenshot-*.png` at 1280 px.
