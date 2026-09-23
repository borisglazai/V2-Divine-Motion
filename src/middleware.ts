/**
 * Server-side gate in front of every `/admin` route (Brief 012 §13:
 * "Toutes les routes admin doivent être protégées côté serveur/runtime.
 * Pas seulement via JS frontend."), PLUS security headers hardening
 * (Production Readiness — Step 3: Security Headers Hardening) applied to
 * every response this Worker returns, public and admin alike. A request
 * without a valid admin identity never reaches an `/admin/**` page
 * component, so there is no page-level code path that could accidentally
 * skip the auth check.
 *
 * Header sets, matched against the real code that consumes them (verified
 * by reading every `<script>`/`style=`/`<img>`/`fetch()` in this repo
 * before choosing a directive — see docs/DEPLOYMENT.md "Security headers"
 * for the full per-directive rationale):
 *
 *   - `PUBLIC_SECURITY_HEADERS` — every route outside `/admin` and not
 *     Contact. No third-party script/frame/connect host: fonts are
 *     self-hosted (@fontsource, bundled under /_astro/*), images are
 *     same-origin (/media/:id/file, bundled assets, /mock/*.svg), no
 *     iframe anywhere in this codebase.
 *   - `CONTACT_SECURITY_HEADERS` — `/contact` and `/en/contact` only: the
 *     one place Turnstile's widget (`ContactView.astro`'s
 *     `<script is:inline src="https://challenges.cloudflare.com/turnstile/v0/api.js">`)
 *     actually loads, so only these two routes get the extra
 *     `challenges.cloudflare.com` allowance — every other public route
 *     stays on the tighter default CSP.
 *   - `ADMIN_SECURITY_HEADERS` — `/admin/**`: keeps every pre-existing
 *     admin header unchanged (`Cache-Control: no-store`, `X-Robots-Tag`,
 *     `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` — stricter
 *     than the public default, kept deliberately), adds a CSP that allows
 *     `connect-src` to `*.r2.cloudflarestorage.com` (the one real
 *     cross-origin fetch in this app: `media-upload-client.ts`'s direct
 *     browser→R2 presigned `PUT`, Implementation Brief 014 §39) but never
 *     Turnstile (Turnstile only ever renders on the public Contact page).
 *
 * `style-src` needs `'unsafe-inline'` on every header set: `ImageFrame.astro`
 * (public — focal-point image cropping), `GallerySlot.astro` and
 * `EditorToolbar.astro` (admin) all set computed `style="..."` attributes
 * per-item (focal point %, aspect ratio, layout-thumbnail flex split) —
 * values that change per row/request, so a static hash/nonce isn't a fit
 * without a much larger refactor (threading a per-request nonce through
 * every `.astro` template that emits one of these). `script-src` does NOT
 * need `'unsafe-inline'`: the one `is:inline` script in this repo
 * (Turnstile) has a `src=`, and Astro bundles every other `<script>` tag
 * to an external same-origin file at build time (confirmed: no
 * `define:vars`, no bare inline script body, anywhere in `src/`) —
 * `'self'` covers them. No `'unsafe-eval'` anywhere: no `eval()`/
 * `new Function()` in this codebase.
 *
 * Applied only outside `import.meta.env.DEV` (same precedent as the admin
 * DEV bypass in `src/lib/auth/guard.ts`, compiled to `false`/dead-code-
 * eliminated in any real `astro build`): `astro dev`'s Vite HMR client can
 * need script/style allowances this CSP doesn't grant, and the browser
 * test suites that exercise real interactivity
 * (`tests/public/*.browser.test.ts`, `tests/admin/*.browser.test.ts`) run
 * against `astro dev`, not a built preview — this keeps local dev and
 * those suites completely unaffected while fully applying in every real
 * deploy (staging today, `tests/admin/routes.test.mjs` already proves
 * this end-to-end against a real `astro preview` production build).
 *
 * HSTS (`Strict-Transport-Security`) is deliberately NOT set here — see
 * docs/DEPLOYMENT.md "Security headers" for why (Cloudflare's own
 * "Always Use HTTPS"/HSTS zone setting is the right layer for it, and
 * whether it's enabled isn't verifiable from this repo).
 *
 * `/_astro/*` static assets are NOT touched by any of this: with
 * `[assets] directory = "./dist"` and no `run_worker_first` override in
 * `wrangler.toml`, Cloudflare Workers Assets serves them directly
 * (confirmed by the build's own log line, "Injected immutable
 * Cache-Control for /_astro/* into _headers") — those requests never
 * reach this Worker's `fetch` handler, so this middleware never runs for
 * them. Harmless: a document's CSP governs what that document may load,
 * not the headers on the asset response itself.
 */
import { defineMiddleware } from "astro/middleware";
import { requireAdmin } from "@/lib/auth/guard";

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const R2_CONNECT_SRC = "https://*.r2.cloudflarestorage.com";

const CONTACT_PATHS = new Set(["/contact", "/en/contact"]);

function csp(directives: Record<string, string>): string {
  return Object.entries(directives)
    .map(([directive, value]) => `${directive} ${value}`)
    .join("; ");
}

const BASE_CSP_DIRECTIVES = {
  "default-src": "'self'",
  "base-uri": "'self'",
  "object-src": "'none'",
  "frame-ancestors": "'none'",
  "img-src": "'self'",
  "font-src": "'self'",
  "style-src": "'self' 'unsafe-inline'",
} as const;

const PUBLIC_CSP = csp({
  ...BASE_CSP_DIRECTIVES,
  "script-src": "'self'",
  "connect-src": "'self'",
  "frame-src": "'none'",
});

const CONTACT_CSP = csp({
  ...BASE_CSP_DIRECTIVES,
  "script-src": `'self' ${TURNSTILE_ORIGIN}`,
  "connect-src": `'self' ${TURNSTILE_ORIGIN}`,
  "frame-src": TURNSTILE_ORIGIN,
});

const ADMIN_CSP = csp({
  ...BASE_CSP_DIRECTIVES,
  "script-src": "'self'",
  "connect-src": `'self' ${R2_CONNECT_SRC}`,
  "frame-src": "'none'",
});

// Every real deploy (never `import.meta.env.DEV` — see header comment).
const PUBLIC_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Content-Security-Policy": PUBLIC_CSP,
};

const CONTACT_SECURITY_HEADERS: Record<string, string> = {
  ...PUBLIC_SECURITY_HEADERS,
  "Content-Security-Policy": CONTACT_CSP,
};

// Applied to every /admin response, success or failure — an admin
// surface must never be cached publicly or indexed (Brief 012 §29-31).
// Every pre-existing admin header is kept exactly as-is; only
// X-Content-Type-Options/Permissions-Policy/CSP are new.
const ADMIN_SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Content-Security-Policy": ADMIN_CSP,
};

function withHeaders(response: Response, headers: Record<string, string>): Response {
  const merged = new Headers(response.headers);
  if (!import.meta.env.DEV) {
    for (const [key, value] of Object.entries(headers)) {
      merged.set(key, value);
    }
  }
  // Response.headers can be guarded immutable depending on how the
  // upstream Response was constructed — rebuilding rather than mutating
  // in place works regardless.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (!context.url.pathname.startsWith("/admin")) {
    const response = await next();
    const headers = CONTACT_PATHS.has(context.url.pathname) ? CONTACT_SECURITY_HEADERS : PUBLIC_SECURITY_HEADERS;
    return withHeaders(response, headers);
  }

  const result = await requireAdmin(context.request);
  if (!result.ok) {
    // Same generic body/status shape regardless of which check failed —
    // never expose SQL, JWT claims, or config detail (Brief 012 §14).
    const status = result.code === "MISSING_JWT" ? 401 : 403;
    return withHeaders(
      new Response("Not authorized.", {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
      ADMIN_SECURITY_HEADERS,
    );
  }

  context.locals.adminIdentity = result.identity;
  const response = await next();
  return withHeaders(response, ADMIN_SECURITY_HEADERS);
});
