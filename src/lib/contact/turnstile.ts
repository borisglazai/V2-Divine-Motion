/**
 * Cloudflare Turnstile server-side verification (Production Readiness —
 * Step 1: Contact Form). Pure — takes the secret key and an injectable
 * `fetch` explicitly (same reasoning as src/lib/auth/access.ts taking
 * `jwks` as a parameter, and src/lib/storage/r2-presign.ts's SigV4
 * signing needing no live network): testable under plain `node --test`
 * with a stub, never a real network call in the test suite.
 */
const VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
  success: boolean;
  /** Cloudflare's own error codes (e.g. "invalid-input-response", "timeout-or-duplicate") — never shown to the visitor, logged at most. */
  errorCodes?: string[];
}

/**
 * `token` is the client-side widget's response (`cf-turnstile-response`
 * form field). `remoteIp` is optional (Cloudflare's own docs mark it
 * optional) — passed when available, never required, never itself
 * treated as identifying information beyond this one verification call.
 */
export async function verifyTurnstile(
  token: string,
  secretKey: string,
  remoteIp: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileVerifyResult> {
  if (!token) return { success: false, errorCodes: ["missing-input-response"] };

  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetchImpl(VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return { success: false, errorCodes: [`http-${response.status}`] };
    const data = (await response.json()) as { success: boolean; "error-codes"?: string[] };
    return { success: data.success === true, errorCodes: data["error-codes"] };
  } catch {
    // Network failure talking to Cloudflare itself — fail closed (never
    // treat "couldn't verify" as "verified"), same posture as a real
    // rejection.
    return { success: false, errorCodes: ["verify-request-failed"] };
  }
}
