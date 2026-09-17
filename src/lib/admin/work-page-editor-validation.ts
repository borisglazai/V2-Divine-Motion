/**
 * Server-side parsing for the Travail page-level editor's save request —
 * same discipline as home-editor-validation.ts: every field is optional,
 * only what's actually submitted is validated.
 */
import type { WorkPageEditorFields } from "./work-page-editor-actions";
import { isValidGalleryLayout } from "./work-page-editor-actions";

export interface WorkPageEditorFormErrors {
  [field: string]: string;
}

function stringField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function parseWorkPageEditorForm(
  formData: FormData,
): { ok: true; data: WorkPageEditorFields } | { ok: false; errors: WorkPageEditorFormErrors } {
  const errors: WorkPageEditorFormErrors = {};
  const data: WorkPageEditorFields = {};

  const titleFr = stringField(formData, "titleFr");
  if (titleFr !== undefined) data.titleFr = titleFr;
  else if (formData.has("titleFr")) errors.titleFr = "Le titre (FR) ne peut pas être vide.";

  const titleEn = stringField(formData, "titleEn");
  if (titleEn !== undefined) data.titleEn = titleEn;
  else if (formData.has("titleEn")) errors.titleEn = "Le titre (EN) ne peut pas être vide.";

  const introFr = stringField(formData, "introFr");
  if (introFr !== undefined) data.introFr = introFr;
  else if (formData.has("introFr")) errors.introFr = "L'introduction (FR) ne peut pas être vide.";

  const introEn = stringField(formData, "introEn");
  if (introEn !== undefined) data.introEn = introEn;
  else if (formData.has("introEn")) errors.introEn = "L'introduction (EN) ne peut pas être vide.";

  const ctaHeadlineFr = stringField(formData, "ctaHeadlineFr");
  if (ctaHeadlineFr !== undefined) data.ctaHeadlineFr = ctaHeadlineFr;
  else if (formData.has("ctaHeadlineFr")) errors.ctaHeadlineFr = "Le titre du CTA (FR) ne peut pas être vide.";

  const ctaHeadlineEn = stringField(formData, "ctaHeadlineEn");
  if (ctaHeadlineEn !== undefined) data.ctaHeadlineEn = ctaHeadlineEn;
  else if (formData.has("ctaHeadlineEn")) errors.ctaHeadlineEn = "Le titre du CTA (EN) ne peut pas être vide.";

  const galleryLayout = formData.get("galleryLayout");
  if (typeof galleryLayout === "string" && galleryLayout !== "") {
    if (!isValidGalleryLayout(galleryLayout)) {
      errors.galleryLayout = "Composition invalide.";
    } else {
      data.galleryLayout = galleryLayout;
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
