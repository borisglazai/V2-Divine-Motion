/**
 * Cloudflare Access JWT verification (Implementation Brief 012) — the
 * cryptographic core of `docs/decisions/ADR-008-security-access-jwt.md`:
 * never trust `Cf-Access-Authenticated-User-Email` or any other bare
 * header, always verify the `Cf-Access-Jwt-Assertion` JWT's signature,
 * issuer, audience and expiration against Cloudflare's own JWKS.
 *
 * Deliberately framework/runtime-agnostic — mirrors the DAL convention in
 * `src/lib/db/` (every function takes its dependencies as explicit
 * parameters, never reaches for a global): `verifyAccessJwt` takes the
 * team domain / audience / JWKS getter as a `config` object instead of
 * importing `cloudflare:workers` itself. That's what makes it testable
 * under plain `node --test` (no Workers runtime needed) — see
 * `tests/auth/access.test.ts`. The one file that reads the real
 * `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` bindings is `src/lib/auth/env.ts`.
 */
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";

export const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

export interface AdminIdentity {
  email: string;
  subject?: string;
}

export type AuthErrorCode =
  | "MISSING_JWT"
  | "INVALID_JWT"
  | "INVALID_ISSUER"
  | "INVALID_AUDIENCE"
  | "EXPIRED"
  | "INVALID_SIGNATURE"
  | "MISSING_EMAIL_CLAIM"
  | "CONFIG_MISSING";

export type AuthResult =
  | { ok: true; identity: AdminIdentity }
  | { ok: false; code: AuthErrorCode };

export interface AccessConfig {
  /** Cloudflare Access team domain, e.g. "divinemotion.cloudflareaccess.com" — never a hardcoded key, only ever this hostname. */
  teamDomain: string;
  /** The Access application's Audience (AUD) tag. */
  audience: string;
  /**
   * Test-only override: skips the real network JWKS fetch entirely.
   * Production/runtime callers never pass this — see `env.ts`/`guard.ts`.
   */
  jwks?: JWTVerifyGetKey;
}

// Reasonable JWKS cache: `createRemoteJWKSet` itself only fetches lazily
// (on first verify), then caches matching keys and re-fetches on a KID it
// doesn't recognize (rotation) or after `cooldownDuration` — see jose's own
// docs. Memoized per team domain so a Worker isolate reuses one cache
// across requests instead of re-fetching every time; never a static/hardcoded
// public key (Brief 012 §9).
let cachedRemoteJwks: { teamDomain: string; jwks: JWTVerifyGetKey } | undefined;

function getRemoteJwks(teamDomain: string): JWTVerifyGetKey {
  if (cachedRemoteJwks && cachedRemoteJwks.teamDomain === teamDomain) {
    return cachedRemoteJwks.jwks;
  }
  const jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  cachedRemoteJwks = { teamDomain, jwks };
  return jwks;
}

function classifyJoseError(err: unknown): AuthErrorCode {
  if (err instanceof errors.JWTExpired) return "EXPIRED";
  if (err instanceof errors.JWTClaimValidationFailed) {
    if (err.claim === "iss") return "INVALID_ISSUER";
    if (err.claim === "aud") return "INVALID_AUDIENCE";
    return "INVALID_JWT";
  }
  if (err instanceof errors.JWSSignatureVerificationFailed) return "INVALID_SIGNATURE";
  // Malformed compact JWS/JWT (JWSInvalid/JWTInvalid), unresolvable KID
  // (JWKSNoMatchingKey), and anything else unexpected all collapse to the
  // same generic "reject" code — never leak which specific parse step
  // failed to a caller (see the "no detail exposed" requirement, Brief 012 §14).
  return "INVALID_JWT";
}

/**
 * Verifies a Cloudflare Access JWT's signature, issuer, audience and
 * expiration, and extracts a minimal typed identity. Never trusts the
 * token's claims until `jwtVerify` has cryptographically authenticated it.
 */
export async function verifyAccessJwt(jwt: string, config: AccessConfig): Promise<AuthResult> {
  if (!jwt) return { ok: false, code: "MISSING_JWT" };
  if (!config.teamDomain || !config.audience) return { ok: false, code: "CONFIG_MISSING" };

  const jwks = config.jwks ?? getRemoteJwks(config.teamDomain);
  const issuer = `https://${config.teamDomain}`;

  let payload;
  try {
    ({ payload } = await jwtVerify(jwt, jwks, { issuer, audience: config.audience }));
  } catch (err) {
    return { ok: false, code: classifyJoseError(err) };
  }

  const email = typeof payload.email === "string" ? payload.email : undefined;
  if (!email) return { ok: false, code: "MISSING_EMAIL_CLAIM" };

  const subject = typeof payload.sub === "string" ? payload.sub : undefined;
  return { ok: true, identity: { email, subject } };
}

/** Extracts the Access JWT from a request — the ONE header this layer trusts, and only after `verifyAccessJwt` authenticates it. */
export function extractAccessJwt(request: Request): string | null {
  return request.headers.get(ACCESS_JWT_HEADER);
}

/** Convenience: extract + verify in one call, for the middleware/guard. */
export async function verifyAccessRequest(request: Request, config: AccessConfig): Promise<AuthResult> {
  const jwt = extractAccessJwt(request);
  if (!jwt) return { ok: false, code: "MISSING_JWT" };
  return verifyAccessJwt(jwt, config);
}
