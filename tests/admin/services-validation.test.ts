/**
 * Services CMS — pure validation tests (no D1), same discipline as
 * tests/admin/work-validation.test.ts.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseServiceForm, parseServiceFeatures } from "../../src/lib/admin/services-validation";

function baseForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    slug: "mariage-en-plein-air",
    mediaId: "1",
    position: "1",
    ratio: "4/5",
    titleFr: "Mariage",
    titleEn: "Wedding",
    descriptionFr: "Description FR",
    descriptionEn: "Description EN",
    imageAltFr: "alt fr",
    imageAltEn: "alt en",
    ctaLabelFr: "Parlons-en",
    ctaLabelEn: "Let's talk",
    isActive: "on",
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) fd.set(key, value);
  return fd;
}

describe("parseServiceForm", () => {
  test("accepts a fully valid form", () => {
    const result = parseServiceForm(baseForm());
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.data.slug, "mariage-en-plein-air");
    assert.equal(result.data.taglineFr, null, "tagline is optional — absent input becomes null, not an empty string");
  });

  test("rejects a slug with uppercase/spaces/underscores", () => {
    for (const slug of ["Mariage", "mariage plein air", "mariage_plein_air", ""]) {
      const result = parseServiceForm(baseForm({ slug }));
      assert.equal(result.ok, false, `expected slug "${slug}" to be rejected`);
      if (!result.ok) assert.ok(result.errors.slug);
    }
  });

  test("requires a media selection", () => {
    const result = parseServiceForm(baseForm({ mediaId: "" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.mediaId);
  });

  test("requires FR and EN alt text (accessibility, never optional)", () => {
    const result = parseServiceForm(baseForm({ imageAltFr: "", imageAltEn: "" }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.imageAltFr);
      assert.ok(result.errors.imageAltEn);
    }
  });

  test("requires title, description and CTA label in both languages", () => {
    const result = parseServiceForm(baseForm({ titleFr: "", descriptionEn: "", ctaLabelFr: "" }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.titleFr);
      assert.ok(result.errors.descriptionEn);
      assert.ok(result.errors.ctaLabelFr);
    }
  });

  test("rejects a malformed ratio", () => {
    const result = parseServiceForm(baseForm({ ratio: "square" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.ratio);
  });

  test("carries a real tagline through when provided", () => {
    const result = parseServiceForm(baseForm({ taglineFr: "Une accroche courte", taglineEn: "A short hook" }));
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.data.taglineFr, "Une accroche courte");
    assert.equal(result.data.taglineEn, "A short hook");
  });

  test("isActive defaults to false when the checkbox is unchecked (absent from FormData)", () => {
    const fd = baseForm();
    fd.delete("isActive");
    const result = parseServiceForm(fd);
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.isActive, false);
  });
});

describe("parseServiceFeatures", () => {
  test("pairs FR/EN feature text by position, skipping fully-empty rows", () => {
    const fd = new FormData();
    fd.append("featureTextFr", "Point 1");
    fd.append("featureTextEn", "Highlight 1");
    fd.append("featureTextFr", "");
    fd.append("featureTextEn", "");
    fd.append("featureTextFr", "Point 3");
    fd.append("featureTextEn", "Highlight 3");

    const features = parseServiceFeatures(fd);
    assert.equal(features.length, 2);
    assert.deepEqual(features[0], { position: 1, textFr: "Point 1", textEn: "Highlight 1" });
    assert.deepEqual(features[1], { position: 2, textFr: "Point 3", textEn: "Highlight 3" });
  });

  test("caps at 3 features even if more are submitted", () => {
    const fd = new FormData();
    for (let i = 1; i <= 5; i++) {
      fd.append("featureTextFr", `FR ${i}`);
      fd.append("featureTextEn", `EN ${i}`);
    }
    const features = parseServiceFeatures(fd);
    assert.equal(features.length, 3);
  });

  test("returns an empty list when no features are submitted", () => {
    assert.deepEqual(parseServiceFeatures(new FormData()), []);
  });
});
