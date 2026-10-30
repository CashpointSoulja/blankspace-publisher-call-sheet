# Publisher call sheet

An unofficial concept by Ayo Ahmed for the blankspace Founding GTM Associate application. Not affiliated with blankspace.

It shows which publishers AI answer engines cite for shopping queries in automotive, consumer electronics and sportswear. For each one it gives the evidence and the opening angle I'd use. A live check reads any publisher's public files. Nothing here can send email.

- `SPEC.md`: what the site does. The source of truth.
- `BRAND.md`: how it looks, measured from blankspace.so.
- `AGENTS.md`: standing rules for anyone changing the repository.
- `data/README.md`: the data files and their schemas.
- `worker/README.md`: the live-check worker and how to deploy it.
- `docs/PRODUCT.md`: the PRD, ELI5, 5 Whys and jobs to be done, viability against the role, test results and the v2 roadmap.
- `outreach/README.md`: how drafts are written and verified.

## Run it locally

Requires Node 20 or later. There is nothing to install for the site.

```bash
node scripts/serve.mjs
```

Open http://127.0.0.1:8080/. To use the live check locally as well, see `worker/README.md`.

## Check it

```bash
node scripts/check.mjs
```

```bash
node --test tests/*.test.mjs
```

```bash
cd worker && npm install && npm test
```

After editing a draft in `outreach/`, or when evidence changes:

```bash
node scripts/verify-drafts.mjs
```

## Publish the site

The site is static files, so it runs on any static host. These steps use Cloudflare Pages, which reads `_headers` and `_redirects`. Copy only the site files, so `research/`, `worker/` and the docs stay private:

```bash
rm -rf dist && mkdir dist && cp -r index.html 404.html robots.txt _headers _redirects assets data targets p check pilots plan method dist/
```

```bash
npx wrangler pages deploy dist --project-name publisher-call-sheet
```

Then deploy the worker and connect it, as described in `worker/README.md`.

On other hosts, `/p/{domain}/` must serve `p/index.html`, and every page must keep its `noindex, nofollow` header and meta tag.
