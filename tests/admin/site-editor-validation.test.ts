/**
 * Éditeur visuel Phase 1 — pure validation unit tests for the Home and
 * Services-page editor forms, same shape as tests/admin/work-validation.test.ts
 * / services-validation.test.ts: no DB, just FormData in, typed result out.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseHomeEditorForm, isValidLocale as isValidHomeLocale, isValidPageLanguageStatus as isValidHomeStatus } from "../../src/lib/admin/home-editor-validation";
import { parseServicesPageEditorForm, isValidLocale as isValidServicesLocale, isValidPageLanguageStatus as isValidServicesStatus } from "../../src/lib/admin/services-page-editor-validation";

describe("home-editor-validation", () => {
  test("an absent field is simply omitted from the result, not an error", () => {
    const fd = new FormData();
    fd.set("heroHeadlineFr", "Nouveau titre");
    const result = parseHomeEditorForm(fd);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.heroHeadlineFr, "Nouveau titre");
    assert.equal("heroHeadlineEn" in result.data, false);
  });

  test("a field present but blank is a validation error, not a silent empty-string write", () => {
    const fd = new FormData();
    fd.set("heroHeadlineFr", "   ");
    const result = parseHomeEditorForm(fd);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errors.heroHeadlineFr, /vide/);
  });

  test("heroMediaId must be a positive integer when present", () => {
    const fd = new FormData();
    fd.set("heroMediaId", "not-a-number");
    const result = parseHomeEditorForm(fd);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.heroMediaId);
  });

  test("heroMediaId accepts a positive integer and coerces it to a number", () => {
    const fd = new FormData();
    fd.set("heroMediaId", "42");
    const result = parseHomeEditorForm(fd);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.heroMediaId, 42);
  });

  test("isValidLocale / isValidPageLanguageStatus reject anything outside the closed set", () => {
    assert.equal(isValidHomeLocale("fr"), true);
    assert.equal(isValidHomeLocale("de"), false);
    assert.equal(isValidHomeStatus("draft"), true);
    assert.equal(isValidHomeStatus("published"), true);
    assert.equal(isValidHomeStatus("archived"), false, "page tables have no archived state, unlike work_items/services/testimonials");
  });
});

describe("services-page-editor-validation", () => {
  test("an absent field is omitted, a blank one is an error", () => {
    const fd = new FormData();
    fd.set("titleFr", "Nouveau titre");
    fd.set("introFr", "  ");
    const result = parseServicesPageEditorForm(fd);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errors.introFr, /vide/);
  });

  test("a fully valid partial submission round-trips exactly", () => {
    const fd = new FormData();
    fd.set("approachLabelEn", "How it works");
    const result = parseServicesPageEditorForm(fd);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.approachLabelEn, "How it works");
    assert.equal(Object.keys(result.data).length, 1);
  });

  test("isValidLocale / isValidPageLanguageStatus", () => {
    assert.equal(isValidServicesLocale("en"), true);
    assert.equal(isValidServicesLocale(""), false);
    assert.equal(isValidServicesStatus("published"), true);
    assert.equal(isValidServicesStatus("archived"), false);
  });
});
