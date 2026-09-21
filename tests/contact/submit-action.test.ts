/**
 * Integration tests for the Contact form's orchestration
 * (src/lib/contact/submit-action.ts, Production Readiness — Step 1).
 * `fetchImpl` is stubbed throughout — no real network call to Cloudflare
 * or Resend (see turnstile.ts/email.ts's own doc comments on why that
 * parameter exists). These stubs are what let the two mandatory
 * guarantees ("no email sent if validation fails" / "no email sent if
 * Turnstile fails") be proven directly: the stub records every URL it's
 * called with, so a test can assert the Resend endpoint was never hit,
 * not just that the function returned an error code.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { handleContactSubmission, type ContactSubmissionDeps } from "../../src/lib/contact/submit-action";
import { verifyTurnstile } from "../../src/lib/contact/turnstile";
import { sendContactEmail } from "../../src/lib/contact/email";
import { checkContactRateLimit } from "../../src/lib/contact/rate-limit";
import { CONTACT_EMAIL_COPY } from "../../src/lib/contact/messages";

const TURNSTILE_CONFIG = { siteKey: "test-site-key", secretKey: "test-secret-key" };
const RESEND_CONFIG = { apiKey: "test-api-key", fromEmail: "no-reply@divinemotion.ca" };

function validForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    name: "Marie Tremblay",
    email: "marie@example.com",
    phone: "",
    serviceType: "Mariage",
    date: "",
    location: "",
    message: "Bonjour, j'aimerais discuter de mon mariage.",
    "cf-turnstile-response": "a-real-looking-token",
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) fd.set(key, value);
  return fd;
}

/** Records every call so tests can assert exactly which endpoints were (or were not) hit. */
function recordingFetch(handlers: { turnstile?: () => Response; resend?: () => Response }): {
  fetchImpl: typeof fetch;
  calls: string[];
} {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.includes("challenges.cloudflare.com")) {
      return (handlers.turnstile ?? (() => new Response(JSON.stringify({ success: true }), { status: 200 })))();
    }
    if (url.includes("api.resend.com")) {
      return (handlers.resend ?? (() => new Response(JSON.stringify({ id: "email-id" }), { status: 200 })))();
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function baseDeps(overrides: Partial<ContactSubmissionDeps> = {}): ContactSubmissionDeps {
  return {
    turnstileConfig: TURNSTILE_CONFIG,
    resendConfig: RESEND_CONFIG,
    recipientEmail: "hello@divinemotion.ca",
    rateLimitKv: undefined,
    ...overrides,
  };
}

describe("handleContactSubmission — happy path", () => {
  test("valid form + passing Turnstile -> success, and Resend is actually called", async () => {
    const { fetchImpl, calls } = recordingFetch({});
    const result = await handleContactSubmission(validForm(), "fr", "203.0.113.5", baseDeps({ fetchImpl }));
    assert.equal(result.outcome, "success");
    assert.ok(calls.some((c) => c.includes("challenges.cloudflare.com")), "Turnstile must have been called");
    assert.ok(calls.some((c) => c.includes("api.resend.com")), "Resend must have been called");
  });
});

describe("handleContactSubmission — validation failure never reaches Turnstile or email", () => {
  test("missing required field -> validation_error, zero network calls at all", async () => {
    const { fetchImpl, calls } = recordingFetch({});
    const result = await handleContactSubmission(validForm({ name: "" }), "fr", "203.0.113.5", baseDeps({ fetchImpl }));
    assert.equal(result.outcome, "validation_error");
    if (result.outcome === "validation_error") assert.ok(result.errors.name);
    assert.equal(calls.length, 0, "no network call of any kind must happen when validation fails");
  });
});

describe("handleContactSubmission — Turnstile failure never reaches email", () => {
  test("Turnstile rejects the token -> turnstile_error, Resend never called", async () => {
    const { fetchImpl, calls } = recordingFetch({
      turnstile: () => new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 }),
    });
    const result = await handleContactSubmission(validForm(), "fr", "203.0.113.5", baseDeps({ fetchImpl }));
    assert.equal(result.outcome, "turnstile_error");
    assert.ok(calls.some((c) => c.includes("challenges.cloudflare.com")), "Turnstile must have been called");
    assert.equal(calls.some((c) => c.includes("api.resend.com")), false, "Resend must never be called when Turnstile fails");
  });

  test("missing cf-turnstile-response field -> turnstile_error without even calling Cloudflare", async () => {
    const { fetchImpl, calls } = recordingFetch({});
    const fd = validForm();
    fd.delete("cf-turnstile-response");
    const result = await handleContactSubmission(fd, "fr", "203.0.113.5", baseDeps({ fetchImpl }));
    assert.equal(result.outcome, "turnstile_error");
    assert.equal(calls.length, 0, "an empty token is rejected locally, before any network call");
  });
});

describe("handleContactSubmission — Resend failure surfaces as email_error", () => {
  test("Resend returns a non-2xx -> email_error, no false success", async () => {
    const { fetchImpl } = recordingFetch({ resend: () => new Response("server error", { status: 500 }) });
    const result = await handleContactSubmission(validForm(), "fr", "203.0.113.5", baseDeps({ fetchImpl }));
    assert.equal(result.outcome, "email_error");
  });
});

describe("handleContactSubmission — missing configuration", () => {
  test("missing Turnstile config -> config_error, no network calls", async () => {
    const { fetchImpl, calls } = recordingFetch({});
    const result = await handleContactSubmission(validForm(), "fr", "203.0.113.5", baseDeps({ turnstileConfig: null, fetchImpl }));
    assert.equal(result.outcome, "config_error");
    assert.equal(calls.length, 0);
  });

  test("missing Resend config -> config_error, no network calls", async () => {
    const { fetchImpl, calls } = recordingFetch({});
    const result = await handleContactSubmission(validForm(), "fr", "203.0.113.5", baseDeps({ resendConfig: null, fetchImpl }));
    assert.equal(result.outcome, "config_error");
    assert.equal(calls.length, 0);
  });

  test("missing recipient email (site_settings unreadable) -> config_error, no network calls", async () => {
    const { fetchImpl, calls } = recordingFetch({});
    const result = await handleContactSubmission(validForm(), "fr", "203.0.113.5", baseDeps({ recipientEmail: null, fetchImpl }));
    assert.equal(result.outcome, "config_error");
    assert.equal(calls.length, 0);
  });
});

describe("handleContactSubmission — rate limiting", () => {
  test("rate limit exceeded -> rate_limited, Turnstile/Resend never called", async () => {
    const { fetchImpl, calls } = recordingFetch({});
    const fakeKv = {
      get: async () => JSON.stringify({ windowStart: Date.now(), count: 5 }),
      put: async () => {},
    } as unknown as KVNamespace;
    const result = await handleContactSubmission(validForm(), "fr", "203.0.113.5", baseDeps({ rateLimitKv: fakeKv, fetchImpl }));
    assert.equal(result.outcome, "rate_limited");
    assert.equal(calls.length, 0, "a rate-limited request must never reach Turnstile or Resend");
  });

  test("no KV configured -> fails open, submission proceeds", async () => {
    const { fetchImpl } = recordingFetch({});
    const result = await handleContactSubmission(validForm(), "fr", "203.0.113.5", baseDeps({ rateLimitKv: undefined, fetchImpl }));
    assert.equal(result.outcome, "success");
  });
});

describe("verifyTurnstile — direct unit coverage", () => {
  test("success response -> success: true", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as typeof fetch;
    const result = await verifyTurnstile("token", "secret", "203.0.113.5", fetchImpl);
    assert.equal(result.success, true);
  });

  test("Cloudflare says failure -> success: false with error codes surfaced", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ success: false, "error-codes": ["timeout-or-duplicate"] }), { status: 200 })) as typeof fetch;
    const result = await verifyTurnstile("token", "secret", "203.0.113.5", fetchImpl);
    assert.equal(result.success, false);
    assert.deepEqual(result.errorCodes, ["timeout-or-duplicate"]);
  });

  test("network failure -> fails closed, never treated as verified", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const result = await verifyTurnstile("token", "secret", "203.0.113.5", fetchImpl);
    assert.equal(result.success, false);
  });

  test("empty token -> fails closed without any network call", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;
    const result = await verifyTurnstile("", "secret", "203.0.113.5", fetchImpl);
    assert.equal(result.success, false);
    assert.equal(called, false);
  });
});

describe("sendContactEmail — direct unit coverage", () => {
  const input = {
    name: "Marie Tremblay",
    email: "marie@example.com",
    phone: null,
    serviceType: "Mariage",
    date: null,
    location: null,
    message: "Bonjour!",
  };

  test("2xx from Resend -> ok: true, body contains only the 7 form fields (no IP/user-agent)", async () => {
    let capturedBody: string | undefined;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
    }) as typeof fetch;
    const result = await sendContactEmail(input, { apiKey: "key", from: "from@divinemotion.ca", to: "hello@divinemotion.ca" }, CONTACT_EMAIL_COPY.fr, fetchImpl);
    assert.equal(result.ok, true);
    assert.ok(capturedBody);
    const parsed = JSON.parse(capturedBody!);
    assert.equal(parsed.from, "from@divinemotion.ca");
    assert.deepEqual(parsed.to, ["hello@divinemotion.ca"]);
    assert.equal(parsed.reply_to, "marie@example.com");
    assert.ok(!("ip" in parsed) && !JSON.stringify(parsed).includes("user-agent"));
    assert.match(parsed.text, /Marie Tremblay/);
    assert.match(parsed.text, /Non fourni/, "empty optional fields must render as the locale's 'not provided' copy");
  });

  test("non-2xx from Resend -> ok: false", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 422 })) as typeof fetch;
    const result = await sendContactEmail(input, { apiKey: "key", from: "from@divinemotion.ca", to: "hello@divinemotion.ca" }, CONTACT_EMAIL_COPY.fr, fetchImpl);
    assert.equal(result.ok, false);
  });

  test("network exception -> ok: false, never throws", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const result = await sendContactEmail(input, { apiKey: "key", from: "from@divinemotion.ca", to: "hello@divinemotion.ca" }, CONTACT_EMAIL_COPY.fr, fetchImpl);
    assert.equal(result.ok, false);
  });
});

describe("checkContactRateLimit — direct unit coverage", () => {
  test("undefined KV -> allowed, not enforced (fail open)", async () => {
    const result = await checkContactRateLimit(undefined, "203.0.113.5");
    assert.equal(result.allowed, true);
    assert.equal(result.enforced, false);
  });

  test("under the limit -> allowed, enforced", async () => {
    const store = new Map<string, string>();
    const kv = {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    } as unknown as KVNamespace;
    const now = Date.now();
    const result = await checkContactRateLimit(kv, "203.0.113.5", now);
    assert.equal(result.allowed, true);
    assert.equal(result.enforced, true);
  });

  test("at the limit within the window -> blocked", async () => {
    const now = Date.now();
    const store = new Map<string, string>([["contact:203.0.113.5", JSON.stringify({ windowStart: now, count: 5 })]]);
    const kv = {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    } as unknown as KVNamespace;
    const result = await checkContactRateLimit(kv, "203.0.113.5", now + 1000);
    assert.equal(result.allowed, false);
    assert.equal(result.enforced, true);
  });

  test("window expired -> counter resets, allowed again", async () => {
    const now = Date.now();
    const store = new Map<string, string>([["contact:203.0.113.5", JSON.stringify({ windowStart: now, count: 5 })]]);
    const kv = {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    } as unknown as KVNamespace;
    const result = await checkContactRateLimit(kv, "203.0.113.5", now + 11 * 60 * 1000);
    assert.equal(result.allowed, true);
    assert.equal(result.enforced, true);
  });
});
