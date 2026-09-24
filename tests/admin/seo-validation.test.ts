import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeoForm } from "../../src/lib/admin/seo-validation";

function validForm(): FormData {
  const form = new FormData();
  form.set("pageKey", "home");
  form.set("titleFr", "Photographe à Trois-Rivières");
  form.set("titleEn", "Photographer in Trois-Rivières");
  form.set("descriptionFr", "Photographie et vidéographie de mariage, portrait et événement.");
  form.set("descriptionEn", "Wedding, portrait and event photography and videography.");
  return form;
}

test("parseSeoForm accepts a complete bilingual SEO form", () => {
  const form = validForm();
  form.set("ogMediaId", "12");
  form.set("canonicalOverride", "https://divinemotion.ca/");
  form.set("noindex", "1");
  const result = parseSeoForm(form);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data, {
    pageKey: "home",
    titleFr: "Photographe à Trois-Rivières",
    titleEn: "Photographer in Trois-Rivières",
    descriptionFr: "Photographie et vidéographie de mariage, portrait et événement.",
    descriptionEn: "Wedding, portrait and event photography and videography.",
    ogMediaId: 12,
    canonicalOverride: "https://divinemotion.ca/",
    noindex: true,
  });
});

test("parseSeoForm rejects unknown pages and unsafe canonical URLs", () => {
  const unknown = validForm();
  unknown.set("pageKey", "blog");
  assert.equal(parseSeoForm(unknown).ok, false);
  const insecure = validForm();
  insecure.set("canonicalOverride", "http://example.com");
  assert.equal(parseSeoForm(insecure).ok, false);
});

test("parseSeoForm enforces SEO length limits", () => {
  const form = validForm();
  form.set("titleFr", "x".repeat(71));
  assert.equal(parseSeoForm(form).ok, false);
});
