/**
 * Unit tests for server-side Work item form validation (Brief 013 §22 —
 * "Ne pas dépendre de validation HTML seule"). Pure, no D1/HTTP.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isValidLanguageStatus, isValidLocale, parseWorkItemForm } from "../../src/lib/admin/validation";

function validForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    mediaId: "1",
    category: "wedding",
    position: "1",
    ratio: "4/5",
    altFr: "alt fr",
    altEn: "alt en",
    captionFr: "légende",
    captionEn: "caption",
    focalX: "50",
    focalY: "40",
    isVisible: "on",
    featuredOnHome: "on",
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) fd.set(key, value);
  return fd;
}

describe("parseWorkItemForm — valid input", () => {
  test("accepts a fully valid form", () => {
    const result = parseWorkItemForm(validForm());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.mediaId, 1);
      assert.equal(result.data.category, "wedding");
      assert.equal(result.data.isVisible, true);
      assert.equal(result.data.featuredOnHome, true);
    }
  });

  test("empty category -> null (not an error)", () => {
    const result = parseWorkItemForm(validForm({ category: "" }));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.category, null);
  });

  test("unchecked checkboxes -> false", () => {
    const fd = validForm();
    fd.delete("isVisible");
    fd.delete("featuredOnHome");
    const result = parseWorkItemForm(fd);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.isVisible, false);
      assert.equal(result.data.featuredOnHome, false);
    }
  });

  test("empty focal fields default to 50", () => {
    const result = parseWorkItemForm(validForm({ focalX: "", focalY: "" }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.focalX, 50);
      assert.equal(result.data.focalY, 50);
    }
  });
});

describe("parseWorkItemForm — server-side validation, independent of HTML attributes", () => {
  test("missing/invalid mediaId is rejected", () => {
    const result = parseWorkItemForm(validForm({ mediaId: "not-a-number" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.mediaId);
  });

  test("mediaId <= 0 is rejected", () => {
    const result = parseWorkItemForm(validForm({ mediaId: "0" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.mediaId);
  });

  test("unknown category is rejected even if HTML select shouldn't allow it", () => {
    const result = parseWorkItemForm(validForm({ category: "landscape" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.category);
  });

  test("non-positive-integer position is rejected", () => {
    for (const value of ["0", "-1", "1.5", "abc"]) {
      const result = parseWorkItemForm(validForm({ position: value }));
      assert.equal(result.ok, false, `position=${value} should be rejected`);
    }
  });

  test("malformed ratio is rejected", () => {
    for (const value of ["", "4", "4:5", "abc/def"]) {
      const result = parseWorkItemForm(validForm({ ratio: value }));
      assert.equal(result.ok, false, `ratio="${value}" should be rejected`);
    }
  });

  test("missing altFr or altEn is rejected — accessibility, never optional", () => {
    assert.equal(parseWorkItemForm(validForm({ altFr: "" })).ok, false);
    assert.equal(parseWorkItemForm(validForm({ altEn: "" })).ok, false);
  });

  test("focalX/focalY out of 0-100 are rejected", () => {
    assert.equal(parseWorkItemForm(validForm({ focalX: "-1" })).ok, false);
    assert.equal(parseWorkItemForm(validForm({ focalX: "101" })).ok, false);
    assert.equal(parseWorkItemForm(validForm({ focalY: "-1" })).ok, false);
    assert.equal(parseWorkItemForm(validForm({ focalY: "101" })).ok, false);
  });

  test("multiple simultaneous errors are all reported together", () => {
    const result = parseWorkItemForm(validForm({ mediaId: "", altFr: "", ratio: "" }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.mediaId);
      assert.ok(result.errors.altFr);
      assert.ok(result.errors.ratio);
    }
  });
});

describe("locale/status guards", () => {
  test("isValidLocale accepts only fr/en", () => {
    assert.equal(isValidLocale("fr"), true);
    assert.equal(isValidLocale("en"), true);
    assert.equal(isValidLocale("de"), false);
    assert.equal(isValidLocale(""), false);
  });

  test("isValidLanguageStatus accepts only draft/published/archived", () => {
    assert.equal(isValidLanguageStatus("draft"), true);
    assert.equal(isValidLanguageStatus("published"), true);
    assert.equal(isValidLanguageStatus("archived"), true);
    assert.equal(isValidLanguageStatus("live"), false);
  });
});
