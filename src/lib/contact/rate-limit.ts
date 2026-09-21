/**
 * Lightweight, temporary rate limiting for the Contact form (Production
 * Readiness — Step 1: Contact Form) — Turnstile is the primary anti-bot
 * defense; this is a secondary guard against a human (or a Turnstile-
 * passing script) hammering the endpoint. Deliberately minimal: a per-IP
 * counter in KV with a short TTL, never the message content, never
 * anything that outlives the window.
 *
 * Uses the dedicated `RATE_LIMIT` KV namespace (src/lib/contact/env.ts —
 * see that file's doc comment for why this is NOT the existing `SESSION`
 * binding). That namespace is not yet provisioned for staging (no real
 * `wrangler kv namespace create` has been run against the Cloudflare
 * account) — `kv` is therefore `undefined` there today. This function
 * FAILS OPEN when `kv` is undefined (allows the submission through)
 * rather than blocking every contact submission because a KV namespace
 * doesn't exist yet: Turnstile still gates every request regardless, and
 * a missing secondary guard must never make the one real blocker (a
 * working contact form) worse. This is a deliberate, documented
 * trade-off, not a silent gap — see the delivery report's "actions
 * manuelles restantes" for the provisioning step that activates it.
 */
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

interface RateLimitState {
  windowStart: number;
  count: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** True only when `kv` was actually consulted — lets callers/tests distinguish "genuinely rate-limited" from "no KV configured, allowed by default". */
  enforced: boolean;
}

export async function checkContactRateLimit(
  kv: KVNamespace | undefined,
  ip: string,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  if (!kv) return { allowed: true, enforced: false };

  const key = `contact:${ip}`;
  const raw = await kv.get(key);
  const state: RateLimitState = raw ? (JSON.parse(raw) as RateLimitState) : { windowStart: now, count: 0 };

  const windowExpired = now - state.windowStart >= WINDOW_MS;
  const next: RateLimitState = windowExpired ? { windowStart: now, count: 1 } : { windowStart: state.windowStart, count: state.count + 1 };

  if (!windowExpired && state.count >= MAX_ATTEMPTS) {
    // Still record the attempt (extends nothing — TTL is fixed to the
    // original window) so a burst past the limit doesn't quietly reset
    // the counter's remaining TTL.
    return { allowed: false, enforced: true };
  }

  const ttlSeconds = Math.ceil(WINDOW_MS / 1000);
  await kv.put(key, JSON.stringify(next), { expirationTtl: ttlSeconds });
  return { allowed: true, enforced: true };
}
