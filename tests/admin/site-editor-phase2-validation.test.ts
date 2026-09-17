/**
 * Éditeur visuel Phase 2 — pure validation unit tests for the Travail
 * page-copy, À propos, and Contact editor forms. Same shape as
 * tests/admin/site-editor-validation.test.ts (Phase 1): no DB, just
 * FormData in, typed result out.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseWorkPageEditorForm } from "../../src/lib/admin/work-page-editor-validation";
import { parseAboutEditorForm } from "../../src/lib/admin/about-editor-validation";
import { parseContactEditorForm } from "../../src/lib/admin/contact-editor-validation";

describe("work-page-editor-validation", () => {
  test("galleryLayout accepts a valid enum value", () => {
    const fd = new FormData();
    fd.set("galleryLayout", "story");
    const result = parseWorkPageEditorForm(fd);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.galleryLayout, "story");
  });

  test("an invalid galleryLayout value is rejected, never silently coerced", () => {
    const fd = new FormData();
    fd.set("galleryLayout", "freeform-drag-drop");
    const result = parseWorkPageEditorForm(fd);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.galleryLayout);
  });

  test("a blank title is a validation error, not a silent empty-string write", () => {
    const fd = new FormData();
    fd.set("titleFr", "   ");
    const result = parseWorkPageEditorForm(fd);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errors.titleFr, /vide/);
  });
});

describe("about-editor-validation", () => {
  test("simple fields parse the same way as Home's", () => {
    const fd = new FormData();
    fd.set("heroTitleFr", "Nouveau titre");
    const result = parseAboutEditorForm(fd);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.heroTitleFr, "Nouveau titre");
    assert.equal(result.storyParagraphEdits.length, 0);
    assert.equal(result.approachItemEdits.length, 0);
  });

  test("dynamically-indexed story paragraph fields are parsed into indexed edits", () => {
    const fd = new FormData();
    fd.set("storyParagraph0Fr", "Paragraphe modifié");
    fd.set("storyParagraph2En", "Third paragraph edited");
    const result = parseAboutEditorForm(fd);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.storyParagraphEdits.sort((a, b) => a.index - b.index),
      [
        { index: 0, locale: "fr", text: "Paragraphe modifié" },
        { index: 2, locale: "en", text: "Third paragraph edited" },
      ],
    );
  });

  test("dynamically-indexed approach item word/text fields merge into one edit per index", () => {
    const fd = new FormData();
    fd.set("approachItem1WordFr", "Nouveau mot");
    fd.set("approachItem1TextFr", "Nouveau texte");
    const result = parseAboutEditorForm(fd);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.approachItemEdits.length, 1);
    assert.equal(result.approachItemEdits[0].index, 1);
    assert.equal(result.approachItemEdits[0].locale, "fr");
    assert.equal(result.approachItemEdits[0].word, "Nouveau mot");
    assert.equal(result.approachItemEdits[0].text, "Nouveau texte");
  });

  test("heroMediaId must be a positive integer when present", () => {
    const fd = new FormData();
    fd.set("heroMediaId", "not-a-number");
    const result = parseAboutEditorForm(fd);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.heroMediaId);
  });
});

describe("contact-editor-validation", () => {
  test("an absent field is simply omitted, not an error", () => {
    const fd = new FormData();
    fd.set("heroTitleFr", "Nouveau titre");
    const result = parseContactEditorForm(fd);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.heroTitleFr, "Nouveau titre");
    assert.equal("heroTitleEn" in result.data, false);
  });

  test("a blank closing note is a validation error", () => {
    const fd = new FormData();
    fd.set("closingNoteFr", "");
    fd.set("closingNoteEn", "not blank");
    const result = parseContactEditorForm(fd);
    // An explicitly-present-but-empty field is treated as a rejected edit —
    // note formData.set("x", "") still registers `has("x")`.
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.closingNoteFr);
  });
});
