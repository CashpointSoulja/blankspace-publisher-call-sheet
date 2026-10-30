# Live-check worker

`GET /api/check?url={input}` returns an evidence object (SPEC §8.4) with `"source": "live"`. The site's `/check/` page calls it.

## What it does

| Rule | How |
|---|---|
| Honest identity | Every request sends `AyoGTMResearch/0.1 (+{SITE_ORIGIN}/method#crawler)`. It never sends another crawler's user-agent. |
| robots.txt | Parsed per RFC 9309 for the token `AyoGTMResearch`. Every fetch obeys it except robots.txt and ads.txt themselves. If robots.txt can't be read (timeout, network error, 5xx), nothing else on that host is fetched. A 4xx robots.txt means no rules. |
| Budget | At most 8 requests to the publisher per check. Each has an 8-second timeout, and the worker reads only the first 512 KB of any body. |
| Targets | Input is normalised to `https://{host}/`. It refuses non-http(s) schemes, IP literals in any notation, `localhost` and reserved names (`.local`, `.internal`, `.test`, `.home.arpa` and others), credentials in the URL, non-standard ports, and hosts without a public suffix. Each host is resolved over DNS-over-HTTPS before it is fetched, and refused if any address is private or reserved (RFC 1918, loopback, link-local, CGNAT, multicast, documentation ranges, IPv6 ULA and link-local, and IPv4-mapped forms of these). Redirects are followed by hand, and every hop is checked the same way. Fetches stay on the checked registrable domain. |
| Blocked fetches | 401, 403, 406, 429 and 451 are recorded in `fetch.blocked` as evidence. The check carries on. |
| Rate limit | 10 checks per client IP per 60 seconds, using the Workers rate-limiting binding. Without the binding, a per-isolate counter applies, which is best effort only. |
| Cache | Results are cached per host for 24 hours: in KV when `CHECK_CACHE` is bound, otherwise in the Cache API, which only persists on a custom domain or route. |
| Outbound effects | Read-only GETs to the publisher, and DNS lookups to `cloudflare-dns.com`. Nothing else. There is no send function. |

Scoring is imported from `../assets/js/score.js` and the agent list from `../data/agents.json`, so the worker and the site always agree. Wrangler bundles both at deploy time.

## Test locally

Requires Node 20 or later.

```bash
cd worker
npm install
npm test
```

The tests mock the network, so they need no internet access.

To run the worker locally and use it from the site preview:

```bash
cd worker
npx wrangler dev --port 8787
```

In a second terminal, from the repository root:

```bash
WORKER_URL=http://127.0.0.1:8787 node scripts/serve.mjs
```

Then open http://127.0.0.1:8080/check/.

## Deploy

### 1. Log in

```bash
cd worker
npm install
npx wrangler login
```

### 2. Set the site origin

In `wrangler.toml`, set `SITE_ORIGIN` to the site's public origin, with no trailing slash. It appears in the user-agent, so site owners can find `/method#crawler`.

```toml
SITE_ORIGIN = "https://your-site.example"
```

### 3. Create the cache namespace

```bash
npx wrangler kv namespace create CHECK_CACHE
```

Copy the `id` it prints into `wrangler.toml`, and uncomment the block:

```toml
[[kv_namespaces]]
binding = "CHECK_CACHE"
id = "the-id-it-printed"
```

### 4. Check the rate limiter

`wrangler.toml` already declares it:

```toml
[[ratelimits]]
name = "RATE_LIMITER"
namespace_id = "1001"
simple = { limit = 10, period = 60 }
```

`namespace_id` is any positive integer, unique within the account. `period` must be 10 or 60.

### 5. Deploy

```bash
npm test
npx wrangler deploy
```

Wrangler prints the worker's `workers.dev` address.

### 6. Connect the site

Choose one of the two options.

**A. Same domain (recommended).** Serve the worker under the site's own domain, so the page calls `/api/check` with no CORS. The site's domain must be a zone in the same Cloudflare account. In `wrangler.toml`, uncomment and edit:

```toml
routes = [
  { pattern = "your-site.example/api/*", zone_name = "your-site.example" }
]
```

Run `npx wrangler deploy` again. `assets/js/config.js` already points at `/api/check`.

**B. workers.dev.** Keep the worker on its own address:

1. In `assets/js/config.js`, set `CHECK_ENDPOINT` to `https://publisher-call-sheet-check.<your-subdomain>.workers.dev/api/check`.
2. In `wrangler.toml`, set `ALLOWED_ORIGINS = "https://your-site.example"`.
3. Run `npx wrangler deploy` again.

Without a custom domain the Cache API is a no-op, so bind KV (step 3) to keep the 24-hour cache.

### 7. Verify

```bash
curl -s "https://your-site.example/api/check?url=javascript:alert(1)"
```

Expect `{"error":"unsupported_scheme",...}` with status 400.

```bash
curl -s "https://your-site.example/api/check?url=http://169.254.169.254/"
```

Expect `{"error":"ip_literal",...}` with status 400.

```bash
curl -s "https://your-site.example/api/check?url=bbc.co.uk" | head -c 400
```

Expect an evidence object with `"source":"live"`.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `SITE_ORIGIN` | `https://publisher-call-sheet.pages.dev` | Public origin of the site, used in the user-agent |
| `ALLOWED_ORIGINS` | empty | Comma-separated origins allowed to call the worker cross-origin |
| `DNS_CHECK` | `on` | `off` skips the DNS-over-HTTPS address check. Leave it on. Cloudflare also refuses subrequests to private space, but the check gives a clear error. |

## Error responses

All errors are JSON: `{"error": code, "message": text}`.

| Status | Codes |
|---|---|
| 400 | `missing_url`, `too_long`, `invalid_url`, `unsupported_scheme`, `credentials_in_url`, `non_standard_port`, `ip_literal`, `invalid_host`, `reserved_name`, `not_public_suffix`, `no_dns_records`, `private_address`, `dns_unavailable` |
| 404 | `not_found` (any path other than `/api/check`) |
| 405 | `method_not_allowed` |
| 429 | `rate_limited` |
| 500 | `internal` |
