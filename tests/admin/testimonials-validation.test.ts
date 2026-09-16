/**
 * Témoignages CMS — pure validation tests (no D1), same discipline as
 * tests/admin/work-validation.test.ts / services-validation.test.ts.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseTestimonialForm } from "../../src/lib/admin/testimonials-validation";

function baseForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    authorName: "Marie L.",
    quoteFr: "Une expérience formidable.",
    quoteEn: "A wonderful experience.",
    position: "1",
    isVisible: "on",
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) fd.set(key, value);
  return fd;
}

describe("parseTestimonialForm", () => {
  test("accepts a fully valid form with no photo (mediaId absent)", () => {
    const result = parseTestimonialForm(baseForm());
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.data.authorName, "Marie L.");
    assert.equal(result.data.photoMediaId, null);
    assert.equal(result.data.roleContextFr, null, "absent role/context becomes null, not an empty string");
  });

  test("mediaId=\"\" (the 'Aucun média' radio) means no photo, not a validation error", () => {
    const result = parseTestimonialForm(baseForm({ mediaId: "" }));
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.photoMediaId, null);
  });

  test("a real mediaId is parsed as a positive integer", () => {
    const result = parseTestimonialForm(baseForm({ mediaId: "7" }));
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.photoMediaId, 7);
  });

  test("rejects a non-numeric mediaId", () => {
    const result = parseTestimonialForm(baseForm({ mediaId: "not-a-number" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.mediaId);
  });

  test("requires the author's name", () => {
    const result = parseTestimonialForm(baseForm({ authorName: "" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.authorName);
  });

  test("requires FR and EN quote text", () => {
    const result = parseTestimonialForm(baseForm({ quoteFr: "", quoteEn: "" }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.quoteFr);
      assert.ok(result.errors.quoteEn);
    }
  });

  test("rejects a non-positive position", () => {
    for (const position of ["0", "-1", "abc", ""]) {
      const result = parseTestimonialForm(baseForm({ position }));
      assert.equal(result.ok, false, `expected position "${position}" to be rejected`);
    }
  });

  test("carries an optional role/context through when provided", () => {
    const result = parseTestimonialForm(baseForm({ roleContextFr: "Mariée", roleContextEn: "Bride" }));
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.data.roleContextFr, "Mariée");
    assert.equal(result.data.roleContextEn, "Bride");
  });

  test("isVisible defaults to false when the checkbox is unchecked (absent from FormData)", () => {
    const fd = baseForm();
    fd.delete("isVisible");
    const result = parseTestimonialForm(fd);
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.isVisible, false);
  });
});
