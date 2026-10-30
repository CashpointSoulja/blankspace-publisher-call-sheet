// Where the live-check worker answers. "/api/check" assumes the worker runs on a route under
// the site's own domain (worker/README.md, option A). For a workers.dev deployment, set the
// full URL here, e.g. "https://publisher-call-sheet-check.<account>.workers.dev/api/check",
// and add the site's origin to ALLOWED_ORIGINS in worker/wrangler.toml.
export const CHECK_ENDPOINT = "https://publisher-call-sheet-check.ayoahmed-49d.workers.dev/api/check";
