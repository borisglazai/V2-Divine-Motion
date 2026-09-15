/**
 * Unit tests for the cryptographic core of Cloudflare Access JWT
 * verification (Implementation Brief 012 §34). Deliberately does NOT
 * touch the network or a real Cloudflare Access application: `access.ts`
 * takes its JWKS as an injectable dependency (see its header comment),
 * so these tests sign real JWTs with a locally generated test keypair and
 * verify them against a `createLocalJWKSet` built from that same
 * keypair's public half — exercising the exact same `jwtVerify` call
 * (signature + issuer + audience + expiration) production code uses,
 * without a remote JWKS fetch. `src/lib/auth/env.ts` (the only file that
 * reads the real Cloudflare binding) is intentionally not imported here —
 * see tests/admin/routes.test.mjs for the request-level/HTTP proof.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
} from "jose";
import { extractAccessJwt, verifyAccessJwt, verifyAccessRequest, ACCESS_JWT_HEADER } from "../../src/lib/auth/access";
import type { AccessConfig } from "../../src/lib/auth/access";

const TEAM_DOMAIN = "test-team.cloudflareaccess.com";
const AUDIENCE = "test-access-app-aud-tag";
const ISSUER = `https://${TEAM_DOMAIN}`;
const KID = "test-key-1";

let jwks: JWTVerifyGetKey;
let signingKey: CryptoKey;
let unregisteredKey: CryptoKey; // never added to the JWKS — signs a token with a valid-looking kid but the wrong key

before(async () => {
  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwk.kid = KID;
  jwk.alg = "RS256";
  jwk.use = "sig";
  jwks = createLocalJWKSet({ keys: [jwk] });

  const other = await generateKeyPair("RS256");
  unregisteredKey = other.privateKey;
});

function testConfig(overrides: Partial<AccessConfig> = {}): AccessConfig {
  return { teamDomain: TEAM_DOMAIN, audience: AUDIENCE, jwks, ...overrides };
}

interface SignOptions {
  key?: CryptoKey;
  issuer?: string;
  audience?: string;
  /** Seconds from now; negative produces an already-expired token. */
  expiresInSeconds?: number;
  /** null omits the email claim entirely — distinct from "unset" so the default below doesn't quietly refill it. */
  email?: string | null;
  kid?: string;
}

async function signToken(opts: SignOptions = {}): Promise<string> {
  const {
    key = signingKey,
    issuer = ISSUER,
    audience = AUDIENCE,
    expiresInSeconds = 3600,
    email = "admin@divinemotion.ca",
    kid = KID,
  } = opts;

  const claims: Record<string, unknown> = email === null ? {} : { email };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(key);
}

describe("verifyAccessJwt — the 7 required scenarios (Brief 012 §34)", () => {
  test("JWT absent -> MISSING_JWT (via verifyAccessRequest, no header on the request)", async () => {
    const request = new Request("https://admin.divinemotion.ca/admin");
    const result = await verifyAccessRequest(request, testConfig());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "MISSING_JWT");
  });

  test("malformed JWT -> INVALID_JWT", async () => {
    const result = await verifyAccessJwt("this-is-not-a-jwt", testConfig());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "INVALID_JWT");
  });

  test("wrong issuer -> INVALID_ISSUER", async () => {
    const jwt = await signToken({ issuer: "https://not-our-team.cloudflareaccess.com" });
    const result = await verifyAccessJwt(jwt, testConfig());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "INVALID_ISSUER");
  });

  test("wrong audience -> INVALID_AUDIENCE", async () => {
    const jwt = await signToken({ audience: "some-other-access-app" });
    const result = await verifyAccessJwt(jwt, testConfig());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "INVALID_AUDIENCE");
  });

  test("expired -> EXPIRED", async () => {
    const jwt = await signToken({ expiresInSeconds: -60 });
    const result = await verifyAccessJwt(jwt, testConfig());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "EXPIRED");
  });

  test("invalid signature (same kid, different key never in the JWKS) -> INVALID_SIGNATURE", async () => {
    const jwt = await signToken({ key: unregisteredKey });
    const result = await verifyAccessJwt(jwt, testConfig());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "INVALID_SIGNATURE");
  });

  test("valid JWT -> identity returned", async () => {
    const jwt = await signToken({ email: "boris@divinemotion.ca" });
    const result = await verifyAccessJwt(jwt, testConfig());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.identity.email, "boris@divinemotion.ca");
    }
  });
});

describe("verifyAccessJwt — additional edge cases", () => {
  test("missing email claim -> MISSING_EMAIL_CLAIM (never a fabricated identity)", async () => {
    const jwt = await signToken({ email: null });
    const result = await verifyAccessJwt(jwt, testConfig());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "MISSING_EMAIL_CLAIM");
  });

  test("empty jwt string -> MISSING_JWT, never reaches jwtVerify", async () => {
    const result = await verifyAccessJwt("", testConfig());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "MISSING_JWT");
  });

  test("missing team domain/audience config -> CONFIG_MISSING, fails closed without a JWKS fetch", async () => {
    const jwt = await signToken();
    const result = await verifyAccessJwt(jwt, { teamDomain: "", audience: "", jwks });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "CONFIG_MISSING");
  });

  test("extractAccessJwt reads the exact Cf-Access-Jwt-Assertion header, nothing else", async () => {
    const request = new Request("https://admin.divinemotion.ca/admin", {
      headers: { [ACCESS_JWT_HEADER]: "some-token-value", "X-Admin": "true" },
    });
    assert.equal(extractAccessJwt(request), "some-token-value");
  });

  test("a subject (sub) claim is carried through when present", async () => {
    const claims = { email: "boris@divinemotion.ca", sub: "cf-access-subject-123" };
    const jwt = await new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(signingKey);

    const result = await verifyAccessJwt(jwt, testConfig());
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.identity.subject, "cf-access-subject-123");
  });
});
