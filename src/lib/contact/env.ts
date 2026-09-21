/**
 * The ONE file in src/lib/contact/ allowed to reach for the live
 * Cloudflare bindings/secrets this module needs — mirrors
 * src/lib/db/client.ts / src/lib/auth/env.ts / src/lib/storage/env.ts
 * exactly (Production Readiness — Step 1: Contact Form). Every other
 * function in this directory takes its config as an explicit parameter
 * instead of importing this file, so it stays testable under plain Node
 * without a Workers runtime.
 *
 * Turnstile keys: `TURNSTILE_SITE_KEY` is not a secret (it's embedded in
 * the public HTML, same category as CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD)
 * — declared in wrangler.toml `[vars]`/`[env.staging.vars]`.
 * `TURNSTILE_SECRET_KEY` IS a real secret in staging/production
 * (`wrangler secret put`), deliberately absent from wrangler.toml there.
 * The one exception: local `[vars]` sets BOTH to Cloudflare's own
 * publicly-documented dummy testing pair (site `1x00000000000000000000AA`
 * / secret `1x0000000000000000000000000000AA`, "always passes") — these
 * are meant to be embedded in code for exactly this purpose, not a real
 * secret, and it's what lets local dev and the browser test suite submit
 * the form without any real Cloudflare account. See wrangler.toml's own
 * comment on this.
 *
 * `RESEND_API_KEY` is a real secret in every environment, never in
 * wrangler.toml, same pattern as R2_ACCESS_KEY_ID (local: `.dev.vars`;
 * staging/production: `wrangler secret put`).
 *
 * `CONTACT_FROM_EMAIL` is not a secret (an email address, same category
 * as R2_BUCKET_NAME) — declared in wrangler.toml `[vars]`, explicit and
 * environment-specific rather than guessed or derived from
 * site_settings.contact_email (which is the RECIPIENT, a different
 * concern — see src/pages/contact/submit.ts).
 *
 * `RATE_LIMIT` is a new, dedicated KV namespace — NOT the existing
 * `SESSION` binding. `SESSION` is reserved by the Cloudflare adapter's
 * own built-in Astro session feature (confirmed: `astro dev`'s own
 * startup log says "Enabling sessions with Cloudflare KV with the
 * SESSION KV binding" — it's framework-owned, not a general-purpose app
 * KV store, and nothing in src/ ever reads it directly). Repurposing it
 * for rate-limit counters would conflate two unrelated concerns on the
 * same storage. `RATE_LIMIT` is declared in wrangler.toml locally (a
 * placeholder id, same convention as every other local binding — works
 * fine against Miniflare) but is genuinely NOT YET PROVISIONED for
 * staging: no real KV namespace has been created against the Cloudflare
 * account for this. See the final delivery report's "actions manuelles
 * restantes" for the exact `wrangler kv namespace create` step — this is
 * documented as a real gap, not silently worked around.
 */
import { env } from "cloudflare:workers";

const PLACEHOLDER_PREFIX = "REPLACE_WITH_";

export interface TurnstileConfig {
  siteKey: string;
  secretKey: string;
}

export function getTurnstileConfig(): TurnstileConfig | null {
  const siteKey = env.TURNSTILE_SITE_KEY;
  const secretKey = env.TURNSTILE_SECRET_KEY;
  if (!siteKey || !secretKey) return null;
  if (siteKey.startsWith(PLACEHOLDER_PREFIX) || secretKey.startsWith(PLACEHOLDER_PREFIX)) return null;
  return { siteKey, secretKey };
}

export interface ResendConfig {
  apiKey: string;
  fromEmail: string;
}

export function getResendConfig(): ResendConfig | null {
  const apiKey = env.RESEND_API_KEY;
  const fromEmail = env.CONTACT_FROM_EMAIL;
  if (!apiKey || !fromEmail) return null;
  if (fromEmail.startsWith(PLACEHOLDER_PREFIX)) return null;
  return { apiKey, fromEmail };
}

/** `undefined` when the KV binding isn't configured for this environment — callers must treat that as "rate limiting unavailable", never as "block everything" (see rate-limit.ts's own fail-open reasoning). */
export function getRateLimitKv(): KVNamespace | undefined {
  return env.RATE_LIMIT;
}
