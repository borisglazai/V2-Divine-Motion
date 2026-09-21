/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Set by src/middleware.ts after a successful Cloudflare Access JWT
// verification (Brief 012) — only ever present on /admin requests that
// passed requireAdmin(); never set, never trusted, elsewhere.
declare namespace App {
  interface Locals {
    adminIdentity?: import("./lib/auth/access").AdminIdentity;
  }
}

// R2 S3 API credentials (Implementation Brief 014) — real secrets,
// deliberately never declared in wrangler.toml (see its "R2 S3 API
// config" comment), so `wrangler types` never generates them into
// worker-configuration.d.ts. Declared here by hand instead purely for
// proper typing (Brief 014 §44: "pas de `any`") — this does NOT create
// the bindings; they still only exist at runtime via `.dev.vars`/
// `wrangler secret put`, and are `undefined` if unset
// (src/lib/storage/env.ts treats a missing value as "not configured",
// same fail-closed pattern as CF_ACCESS_*). Augmenting both `Env` and
// `Cloudflare.Env`: `import { env } from "cloudflare:workers"` is typed
// as `Cloudflare.Env` specifically (confirmed in worker-configuration.d.ts:
// `export const env: Cloudflare.Env`), but the bare global `Env` is used
// elsewhere in that same generated file — merging into both keeps every
// reference consistent regardless of which one a given API uses.
// TURNSTILE_SECRET_KEY / RESEND_API_KEY (Production Readiness Step 1 —
// Contact form) are real secrets, same reasoning and same hand-declaration
// as R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY above — see
// src/lib/contact/env.ts for how they're read (fail-closed when unset).
interface Env {
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
}

declare namespace Cloudflare {
  interface Env {
    R2_ACCESS_KEY_ID?: string;
    R2_SECRET_ACCESS_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    RESEND_API_KEY?: string;
  }
}
