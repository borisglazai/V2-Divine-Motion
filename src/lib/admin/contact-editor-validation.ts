/**
 * Server-side parsing for the Contact visual editor's save request — same
 * discipline as home-editor-validation.ts.
 */
import type { ContactEditorFields } from "./contact-editor-actions";

export interface ContactEditorFormErrors {
  [field: string]: string;
}

function stringField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function parseContactEditorForm(
  formData: FormData,
): { ok: true; data: ContactEditorFields } | { ok: false; errors: ContactEditorFormErrors } {
  const errors: ContactEditorFormErrors = {};
  const data: ContactEditorFields = {};

  const fields: (keyof ContactEditorFields)[] = [
    "heroTitleFr",
    "heroTitleEn",
    "heroSubtextFr",
    "heroSubtextEn",
    "detailsLabelFr",
    "detailsLabelEn",
    "closingNoteFr",
    "closingNoteEn",
  ];
  for (const field of fields) {
    const value = stringField(formData, field);
    if (value !== undefined) (data as Record<string, string>)[field] = value;
    else if (formData.has(field)) errors[field] = "Ce champ ne peut pas être vide.";
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
