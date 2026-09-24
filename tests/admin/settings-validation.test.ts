import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSettingsForm } from "../../src/lib/admin/settings-validation";

function validForm(): FormData {
  const form = new FormData();
  form.set("brandName", "Divine Motion");
  form.set("contactEmail", "bonjour@divinemotion.ca");
  form.set("instagramUrl", "https://www.instagram.com/divinemotion");
  form.set("instagramHandleLabel", "@divinemotion");
  form.set("serviceAreaFr", "Trois-Rivières, Québec");
  form.set("serviceAreaEn", "Trois-Rivières, Quebec");
  form.set("defaultSeoTitleFr", "Divine Motion — Photographie et vidéographie");
  form.set("defaultSeoTitleEn", "Divine Motion — Photography and videography");
  form.set("defaultSeoDescriptionFr", "Mariages, portraits et événements.");
  form.set("defaultSeoDescriptionEn", "Weddings, portraits and events.");
  return form;
}

test("parseSettingsForm accepts complete site settings", () => {
  const result = parseSettingsForm(validForm());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.contactEmail, "bonjour@divinemotion.ca");
    assert.equal(result.data.instagramHandleLabel, "@divinemotion");
    assert.equal(result.data.serviceAreaFr, "Trois-Rivières, Québec");
  }
});

test("parseSettingsForm rejects invalid contact email", () => {
  const form = validForm();
  form.set("contactEmail", "not-an-email");
  assert.equal(parseSettingsForm(form).ok, false);
});

test("parseSettingsForm only accepts HTTPS Instagram URLs", () => {
  for (const url of ["http://instagram.com/divinemotion", "https://example.com/divinemotion", "javascript:alert(1)"]) {
    const form = validForm();
    form.set("instagramUrl", url);
    assert.equal(parseSettingsForm(form).ok, false);
  }
});

test("parseSettingsForm enforces SEO length limits", () => {
  const form = validForm();
  form.set("defaultSeoDescriptionFr", "x".repeat(181));
  assert.equal(parseSettingsForm(form).ok, false);
});
