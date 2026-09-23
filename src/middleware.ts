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
 * every `.astro` template that emits one of these).
 *
 * `script-src` — CORRECTED (Step 3 real-staging regression on
 * `/admin/media`, whose "Ajouter des médias" stopped working: Chrome
 * blocked `initMediaUploader()`'s `<script>` and an inline
 * `onchange="this.form.submit()"` attribute). The original assumption
 * here — "Astro bundles every `<script>` tag to an external same-origin
 * file" — was WRONG for this project: verified directly by inspecting a
 * real `astro build` output (`dist/client/_astro/` contains ZERO `.js`
 * files; every non-`is:inline` `<script>`, on every on-demand route
 * public or admin — this app has no other kind, only `confidentialite`/
 * `en/privacy` prerender — is embedded as literal
 * `<script type="module">...</script>` content directly in the SSR HTML,
 * confirmed by reading Astro 7's own `renderScript()`
 * (`node_modules/astro/dist/runtime/server/render/script.js`), which
 * hard-codes that tag with no attribute passthrough — so a per-request
 * `nonce="..."` attribute is NOT achievable this way either, verified
 * empirically, not assumed. `tests/admin/routes.test.mjs` never caught
 * this because it only ever asserts on 401/403 (no valid Cloudflare
 * Access JWT available in this repo's test environment) — never the
 * authenticated 200 body; the DEV-only skip above meant the Playwright
 * browser suites, which DO hit the real authenticated page, never had
 * this CSP active to violate in the first place.
 *
 * Fix: `withInlineScriptHashes()` below computes a real `sha256-` CSP
 * source for every literal `<script type="module">` a given HTML
 * response actually contains, per request, from the exact bytes being
 * sent — never a hand-maintained hash list (which would just silently
 * go stale the next time any of these components' script changes,
 * reproducing this exact regression). No `'unsafe-inline'` for
 * `script-src` anywhere, on any header set. The one inline EVENT-HANDLER
 * attribute in this repo (`onchange="this.form.submit()"`,
 * `src/pages/admin/media/index.astro`) is a different CSP mechanism
 * (hashes/nonces only cover `<script>` content, never `onXxx="..."`) —
 * fixed by removing it and wiring the listener inside that page's
 * existing `<script>` instead, so no `'unsafe-hashes'` is needed either.
 * No `'unsafe-eval'` anywhere: no `eval()`/`new Function()` in this
 * codebase.
 *
 * `font-src` needs `data:` on every header set: `global.css`'s
 * `@fontsource-variable/manrope` import — loaded by both `BaseLayout` and
 * `AdminLayout`, so this is universal, not admin-specific — has at least
 * one unicode-range subset small enough that Vite's default
 * `assetsInlineLimit` (4 KB) inlines it as a `data:font/woff2;base64,...`
 * source directly in the compiled CSS rather than emitting a separate
 * file (confirmed: `dist/client/_astro/global.*.css` contains exactly one
 * such inlined `Manrope Variable` subset, ~3.4 KB). Real, build-generated,
 * not a mistake — `data:` stays scoped to `font-src` only, no other
 * directive is loosened for it.
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
  "font-src": "'self' data:",
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

// Matches exactly what Astro's renderScript() emits for a non-`is:inline`
// `<script>` (see this file's header comment) — never matches Turnstile's
// `<script is:inline src="...">` (no closing-tag-adjacent inline body to
// capture) or any external `<script src="...">`.
const INLINE_MODULE_SCRIPT_PATTERN = /<script type="module">([\s\S]*?)<\/script>/g;

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Appends a `'sha256-...'` script-src source for every literal inline
 * `<script type="module">` actually present in `html` — computed fresh
 * from the real response bytes on every request, so `script-src` always
 * permits exactly what a given page ships, automatically, with nothing to
 * hand-maintain or let go stale (see this file's header comment for the
 * regression this replaces).
 */
async function withInlineScriptHashes(cspHeader: string, html: string): Promise<string> {
  const hashes = new Set<string>();
  for (const match of html.matchAll(INLINE_MODULE_SCRIPT_PATTERN)) {
    hashes.add(`'sha256-${await sha256Base64(match[1])}'`);
  }
  if (hashes.size === 0) return cspHeader;
  return cspHeader.replace(/script-src ([^;]*)/, (_all, existing: string) => `script-src ${existing} ${[...hashes].join(" ")}`);
}

async function withHeaders(response: Response, headers: Record<string, string>): Promise<Response> {
  if (import.meta.env.DEV) {
    // Response.headers can be guarded immutable depending on how the
    // upstream Response was constructed — rebuilding rather than mutating
    // in place works regardless. No header changes in DEV (see header
    // comment) — this rebuild is a no-op pass-through.
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: new Headers(response.headers) });
  }

  const merged = new Headers(response.headers);
  const contentType = (merged.get("Content-Type") ?? "").toLowerCase();
  const baseCsp = headers["Content-Security-Policy"];

  // Only HTML documents can contain a `<script>` — reading the body to
  // scan it would be wasted work (and would needlessly buffer a
  // streamed response) for JSON APIs, redirects, and R2/media byte
  // streams, none of which are ever affected by script-src.
  if (baseCsp && contentType.includes("text/html")) {
    const html = await response.text();
    for (const [key, value] of Object.entries(headers)) {
      merged.set(key, key === "Content-Security-Policy" ? await withInlineScriptHashes(value, html) : value);
    }
    return new Response(html, { status: response.status, statusText: response.statusText, headers: merged });
  }

  for (const [key, value] of Object.entries(headers)) {
    merged.set(key, value);
  }
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
    return await withHeaders(response, headers);
  }

  const result = await requireAdmin(context.request);
  if (!result.ok) {
    // Same generic body/status shape regardless of which check failed —
    // never expose SQL, JWT claims, or config detail (Brief 012 §14).
    const status = result.code === "MISSING_JWT" ? 401 : 403;
    return await withHeaders(
      new Response("Not authorized.", {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
      ADMIN_SECURITY_HEADERS,
    );
  }

  context.locals.adminIdentity = result.identity;
  const response = await next();
  return await withHeaders(response, ADMIN_SECURITY_HEADERS);
});
