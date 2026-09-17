/**
 * Server-side parsing for the Accueil visual editor's save request — same
 * discipline as every other admin form in this codebase: never trusts
 * client-side state alone. Every field is optional (the editor only ever
 * submits the fields actually present on the page for the language being
 * edited — see src/components/pages/HomeView.astro's Editable/EditableImage
 * usage), so this only validates what IS present, never requires the
 * full set.
 */
import type { HomeEditorFields } from "./home-editor-actions";

export interface HomeEditorFormErrors {
  [field: string]: string;
}

function stringField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function parseHomeEditorForm(
  formData: FormData,
): { ok: true; data: HomeEditorFields } | { ok: false; errors: HomeEditorFormErrors } {
  const errors: HomeEditorFormErrors = {};
  const data: HomeEditorFields = {};

  const heroHeadlineFr = stringField(formData, "heroHeadlineFr");
  if (heroHeadlineFr !== undefined) data.heroHeadlineFr = heroHeadlineFr;
  else if (formData.has("heroHeadlineFr")) errors.heroHeadlineFr = "Le titre hero (FR) ne peut pas être vide.";

  const heroHeadlineEn = stringField(formData, "heroHeadlineEn");
  if (heroHeadlineEn !== undefined) data.heroHeadlineEn = heroHeadlineEn;
  else if (formData.has("heroHeadlineEn")) errors.heroHeadlineEn = "Le titre hero (EN) ne peut pas être vide.";

  const heroSublineFr = stringField(formData, "heroSublineFr");
  if (heroSublineFr !== undefined) data.heroSublineFr = heroSublineFr;
  else if (formData.has("heroSublineFr")) errors.heroSublineFr = "Le sous-titre hero (FR) ne peut pas être vide.";

  const heroSublineEn = stringField(formData, "heroSublineEn");
  if (heroSublineEn !== undefined) data.heroSublineEn = heroSublineEn;
  else if (formData.has("heroSublineEn")) errors.heroSublineEn = "Le sous-titre hero (EN) ne peut pas être vide.";

  const brandStatementFr = stringField(formData, "brandStatementFr");
  if (brandStatementFr !== undefined) data.brandStatementFr = brandStatementFr;
  else if (formData.has("brandStatementFr")) errors.brandStatementFr = "La phrase de marque (FR) ne peut pas être vide.";

  const brandStatementEn = stringField(formData, "brandStatementEn");
  if (brandStatementEn !== undefined) data.brandStatementEn = brandStatementEn;
  else if (formData.has("brandStatementEn")) errors.brandStatementEn = "La phrase de marque (EN) ne peut pas être vide.";

  const finalCtaHeadlineFr = stringField(formData, "finalCtaHeadlineFr");
  if (finalCtaHeadlineFr !== undefined) data.finalCtaHeadlineFr = finalCtaHeadlineFr;
  else if (formData.has("finalCtaHeadlineFr")) errors.finalCtaHeadlineFr = "Le titre du CTA final (FR) ne peut pas être vide.";

  const finalCtaHeadlineEn = stringField(formData, "finalCtaHeadlineEn");
  if (finalCtaHeadlineEn !== undefined) data.finalCtaHeadlineEn = finalCtaHeadlineEn;
  else if (formData.has("finalCtaHeadlineEn")) errors.finalCtaHeadlineEn = "Le titre du CTA final (EN) ne peut pas être vide.";

  const heroMediaIdRaw = formData.get("heroMediaId");
  if (typeof heroMediaIdRaw === "string" && heroMediaIdRaw !== "") {
    const heroMediaId = Number(heroMediaIdRaw);
    if (!Number.isInteger(heroMediaId) || heroMediaId <= 0) {
      errors.heroMediaId = "Sélection de média invalide.";
    } else {
      data.heroMediaId = heroMediaId;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data };
}

export function isValidLocale(value: string): value is "fr" | "en" {
  return value === "fr" || value === "en";
}

export function isValidPageLanguageStatus(value: string): value is "draft" | "published" {
  return value === "draft" || value === "published";
}
