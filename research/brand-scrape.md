# blankspace.so brand scrape (owner-collected, 30 Oct 2026)

Collected through a real desktop browser on https://blankspace.so/ (production Next.js site).
This file plus the assets in this directory ARE the scrape - the build sandbox cannot reach
blankspace hosts, so treat this as the measured source for BRAND.md.

## Files
- `blankspace-main.css` - their actual production stylesheet chunk (unmodified).
- `screenshot-hero.png` - homepage hero + nav.
- `screenshot-dashboard.png` - product dashboard mockup section (their product UI card style).
- `screenshot-audience.png` - audience section.
- `logo-text-white.png` - the real lowercase "blankspace" wordmark (1767x275, transparent).

## Design tokens (verbatim CSS custom properties from their :root)
```
--c-blue: #5d94cf        /* primary accent: buttons, highlighted stats, links */
--c-blue-dim: #5d94cf1f  /* accent tint backgrounds */
--c-orange: #ef722e      /* secondary accents (used sparingly) */
--c-yellow: #f4c627
--c-pink: #e0676d
--c-red: #de4345
--c-darkblue: #282e4c
--bg: #000               /* page background is pure black */
--surface: #ffffff0a     /* card surface */
--surface2: #ffffff12    /* raised surface */
--text: #ffffffeb        /* body text (white 0.92) */
--muted: #ffffff8c       /* secondary text */
--faint: #ffffff4d       /* tertiary text */
--border: #ffffff1a      /* hairline borders */
--border2: #ffffff29     /* stronger borders */
--font-body: "Nunito Sans", ui-sans-serif, system-ui, -apple-system, sans-serif
--font-heading: "Montserrat", ui-sans-serif, system-ui, -apple-system, sans-serif
--font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace
--radius: 14px
--radius-sm: 8px
--radius-xs: 5px
```
Google Fonts: Montserrat 400/600/700/800/900 + Nunito Sans 300-700.

## Measured components (computed styles)
- H1: Montserrat 900, 48px, letter-spacing -1.44px, pure white. H2: Montserrat 800, 40px, -0.8px.
- Cards: background rgba(255,255,255,0.03), 1px solid rgba(255,255,255,0.07), radius 8px, no shadow.
- Uppercase micro-labels (pill): Nunito Sans 700 12px, letter-spacing 1.2px, uppercase, color #5d94cf,
  background rgba(93,148,207,0.08), border 1px rgba(93,148,207,0.3), radius 999px, padding 4.8px 14.4px.
- Nav: floating pill, background rgba(8,8,8,0.88), border rgba(255,255,255,0.16), radius 999px,
  shadow 0 4px 24px rgba(0,0,0,0.4). Logo left, links center, CTA buttons right.
- Primary CTA button: solid #5d94cf fill, dark text, pill radius (see screenshot-hero "Contact Us").
- Secondary button (nav "Get Access"): transparent, 1px rgba(255,255,255,0.1) border, radius 999px,
  muted white text, 13px 600.
- Revenue/positive numbers in the dashboard UI: green. "Live" indicator: green dot + label.
- Mode tags in dashboard tables: "monetise" / "observe" (British spellings).

## Page structure (homepage, For Publishers mode)
1. Hero: H1 "Your content is already being read. Start getting paid for it." (second sentence in #5d94cf),
   sub-paragraph in muted, two CTAs ("Free Site Audit ->" primary, "Read the docs" secondary),
   product video in a mac-window-chrome frame right.
2. "ANALYTICS PLATFORM" / H2 "Understand your AI traffic." - big dashboard card: 4 stat tiles
   (Total AI requests, LLM Live Search, Revenue, Avg CPM), "AI TRAFFIC BY TYPE" list with bars,
   page table (PAGE / REQUESTS / LLM % / REVENUE / MODE). Pill tabs: AI Traffic / AI Audience / AI Revenue.
3. H3 feature blocks with small cards: "See every AI agent for the first time",
   "AI retrievals mapped to purchase intent" (Audience Segments with $ CPM + journey stage + intent),
   "Same-day attribution from AI ad injections".
4. "ACTIVATE THE MARKETPLACE" / H2 "Activate the marketplace." - 3 steps, CDN logos
   (Cloudflare/Akamai/Fastly/CloudFront/Nginx).
5. "FAQS" / H2 "Your questions, answered." - accordion.
6. Final CTA "See your AI audience for the first time." + hello@blankspace.so. Footer.
- For Advertisers mode toggles hero copy (button group top of hero).

## Tone
Short declarative sentences. No exclamation marks. Lowercase "blankspace" always.
British spellings: monetise, personalised. Labels uppercase microcopy.
Numbers are prominent, Montserrat 800/900, blue or green highlights.
