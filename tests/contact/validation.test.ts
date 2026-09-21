/**
 * Unit tests for the Contact form's server-side validation (Production
 * Readiness — Step 1). Pure, no D1/HTTP — same discipline as
 * tests/admin/work-validation.test.ts.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseContactForm, type ContactValidationCopy } from "../../src/lib/contact/validation";

const copy: ContactValidationCopy = {
  nameRequired: "name required",
  emailRequired: "email required",
  emailInvalid: "email invalid",
  serviceTypeRequired: "serviceType required",
  messageRequired: "message required",
};

function validForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    name: "Marie Tremblay",
    email: "marie@example.com",
    phone: "514-555-0100",
    serviceType: "Mariage",
    date: "2027-06-12",
    location: "Montréal",
    message: "Bonjour, j'aimerais discuter de mon mariage.",
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) fd.set(key, value);
  return fd;
}

describe("parseContactForm — valid input", () => {
  test("accepts a fully filled form", () => {
    const result = parseContactForm(validForm(), copy);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.name, "Marie Tremblay");
      assert.equal(result.data.email, "marie@example.com");
      assert.equal(result.data.phone, "514-555-0100");
      assert.equal(result.data.serviceType, "Mariage");
      assert.equal(result.data.date, "2027-06-12");
      assert.equal(result.data.location, "Montréal");
      assert.equal(result.data.message, "Bonjour, j'aimerais discuter de mon mariage.");
    }
  });

  test("accepts required fields only — optional fields become null", () => {
    const fd = validForm({ phone: "", date: "", location: "" });
    const result = parseContactForm(fd, copy);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.phone, null);
      assert.equal(result.data.date, null);
      assert.equal(result.data.location, null);
    }
  });

  test("trims whitespace-only optional fields to null", () => {
    const fd = validForm({ phone: "   ", location: "  " });
    const result = parseContactForm(fd, copy);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.phone, null);
      assert.equal(result.data.location, null);
    }
  });

  test("trims required fields", () => {
    const fd = validForm({ name: "  Marie Tremblay  " });
    const result = parseContactForm(fd, copy);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.name, "Marie Tremblay");
  });
});

describe("parseContactForm — required field errors", () => {
  test("missing name", () => {
    const result = parseContactForm(validForm({ name: "" }), copy);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors.name, "name required");
  });

  test("whitespace-only name is treated as missing", () => {
    const result = parseContactForm(validForm({ name: "   " }), copy);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors.name, "name required");
  });

  test("missing email", () => {
    const result = parseContactForm(validForm({ email: "" }), copy);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors.email, "email required");
  });

  test("invalid email format", () => {
    const result = parseContactForm(validForm({ email: "not-an-email" }), copy);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors.email, "email invalid");
  });

  test("missing serviceType", () => {
    const result = parseContactForm(validForm({ serviceType: "" }), copy);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors.serviceType, "serviceType required");
  });

  test("missing message", () => {
    const result = parseContactForm(validForm({ message: "" }), copy);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors.message, "message required");
  });

  test("multiple missing fields all reported together", () => {
    const result = parseContactForm(validForm({ name: "", email: "", message: "" }), copy);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(Object.keys(result.errors).length, 3);
      assert.ok(result.errors.name);
      assert.ok(result.errors.email);
      assert.ok(result.errors.message);
    }
  });

  test("a request that skips the browser entirely (no fields at all) is rejected the same way", () => {
    const result = parseContactForm(new FormData(), copy);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors.name, "name required");
      assert.equal(result.errors.email, "email required");
      assert.equal(result.errors.serviceType, "serviceType required");
      assert.equal(result.errors.message, "message required");
    }
  });
});
