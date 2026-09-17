/**
 * Server-side parsing for the Services page-level text editor's save
 * request — same discipline as home-editor-validation.ts. Never touches
 * the individual Services items (already validated CMS) — this is
 * exclusively `services_page_content`'s own fields.
 */
import type { ServicesPageEditorFields } from "./services-page-editor-actions";

export interface ServicesPageEditorFormErrors {
  [field: string]: string;
}

function stringField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

const FIELD_LABELS: Record<string, string> = {
  titleFr: "Le titre de la page (FR)",
  titleEn: "Le titre de la page (EN)",
  introFr: "L'introduction (FR)",
  introEn: "L'introduction (EN)",
  approachLabelFr: "Le libellé de la section Approche (FR)",
  approachLabelEn: "Le libellé de la section Approche (EN)",
  ctaHeadlineFr: "Le titre du CTA final (FR)",
  ctaHeadlineEn: "Le titre du CTA final (EN)",
};

export function parseServicesPageEditorForm(
  formData: FormData,
): { ok: true; data: ServicesPageEditorFields } | { ok: false; errors: ServicesPageEditorFormErrors } {
  const errors: ServicesPageEditorFormErrors = {};
  const data: ServicesPageEditorFields = {};

  for (const field of Object.keys(FIELD_LABELS) as (keyof ServicesPageEditorFields)[]) {
    const value = stringField(formData, field);
    if (value !== undefined) {
      data[field] = value;
    } else if (formData.has(field)) {
      errors[field] = `${FIELD_LABELS[field]} ne peut pas être vide.`;
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
