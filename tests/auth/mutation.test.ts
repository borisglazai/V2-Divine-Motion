/**
 * Unit tests for the central mutation security helper (Implementation
 * Brief 013 §37/§39) — pure, no D1/HTTP needed: `requireAdminMutation`
 * takes `request`/`locals` as explicit parameters, same convention as
 * `verifyAccessJwt` in access.ts (Brief 012).
 *
 * "Production bypass impossible" (the last of the 6 required scenarios)
 * is NOT re-tested here — it's a property of `src/lib/auth/guard.ts`'s
 * `import.meta.env.DEV` gate (already proven in tests/admin/routes.test.mjs
 * against a real `astro build && astro preview`), which every mutation
 * route sits behind via src/middleware.ts before `requireAdminMutation`
 * ever runs. tests/admin/routes.test.mjs additionally asserts a mutation
 * route specifically (not just a GET page) is blocked in that same
 * production-mode preview, for a mutation-specific proof of the same
 * property.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isSameOriginRequest, requireAdminMutation } from "../../src/lib/auth/mutation";
import type { AdminIdentity } from "../../src/lib/auth/access";

const IDENTITY: AdminIdentity = { email: "admin@divinemotion.ca" };
const URL = "http://localhost:4321/admin/work/1/publish";

function makeRequest(overrides: { method?: string; origin?: string | null } = {}): Request {
  const headers = new Headers();
  if (overrides.origin !== null) headers.set("Origin", overrides.origin ?? "http://localhost:4321");
  return new Request(URL, { method: overrides.method ?? "POST", headers });
}

describe("isSameOriginRequest", () => {
  test("matching protocol+host -> true", () => {
    assert.equal(isSameOriginRequest(makeRequest({ origin: "http://localhost:4321" })), true);
  });

  test("different host -> false", () => {
    assert.equal(isSameOriginRequest(makeRequest({ origin: "http://evil.example.com" })), false);
  });

  test("different protocol -> false", () => {
    assert.equal(isSameOriginRequest(makeRequest({ origin: "https://localhost:4321" })), false);
  });

  test("missing Origin -> false (fails closed)", () => {
    assert.equal(isSameOriginRequest(makeRequest({ origin: null })), false);
  });

  test("malformed Origin -> false", () => {
    assert.equal(isSameOriginRequest(makeRequest({ origin: "not-a-url" })), false);
  });

  test("works identically for a staging-style host, no hardcoded domain", () => {
    const stagingRequest = new Request("https://staging.divinemotion.ca/admin/work/1/publish", {
      method: "POST",
      headers: { Origin: "https://staging.divinemotion.ca" },
    });
    assert.equal(isSameOriginRequest(stagingRequest), true);
  });
});

describe("requireAdminMutation — the 6 required scenarios (Brief 013 §39)", () => {
  test("GET on a mutation route -> rejected (METHOD_NOT_ALLOWED)", () => {
    const result = requireAdminMutation(makeRequest({ method: "GET" }), { adminIdentity: IDENTITY });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "METHOD_NOT_ALLOWED");
      assert.equal(result.status, 405);
    }
  });

  test("POST without admin identity -> rejected (UNAUTHENTICATED)", () => {
    const result = requireAdminMutation(makeRequest(), {});
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "UNAUTHENTICATED");
      assert.equal(result.status, 401);
    }
  });

  test("POST with a wrong Origin -> rejected (ORIGIN_MISMATCH)", () => {
    const result = requireAdminMutation(makeRequest({ origin: "https://evil.example.com" }), { adminIdentity: IDENTITY });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "ORIGIN_MISMATCH");
      assert.equal(result.status, 403);
    }
  });

  test("POST with a missing Origin -> rejected (ORIGIN_MISMATCH, fails closed)", () => {
    const result = requireAdminMutation(makeRequest({ origin: null }), { adminIdentity: IDENTITY });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "ORIGIN_MISMATCH");
  });

  test("valid same-origin POST with admin identity -> allowed", () => {
    const result = requireAdminMutation(makeRequest(), { adminIdentity: IDENTITY });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.identity.email, "admin@divinemotion.ca");
  });

  test("PUT/PATCH/DELETE are accepted methods too, not just POST", () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const result = requireAdminMutation(makeRequest({ method }), { adminIdentity: IDENTITY });
      assert.equal(result.ok, true, `${method} should be an accepted mutation method`);
    }
  });
});
