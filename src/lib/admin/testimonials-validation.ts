/**
 * Server-side validation for the Testimonial form — same discipline as
 * src/lib/admin/validation.ts (Work item) and services-validation.ts.
 */
export interface TestimonialFormErrors {
  [field: string]: string;
}

export interface ParsedTestimonialForm {
  authorName: string;
  roleContextFr: string | null;
  roleContextEn: string | null;
  quoteFr: string;
  quoteEn: string;
  photoMediaId: number | null;
  position: number;
  isVisible: boolean;
}

/** Field list for buildFormRedirect's round-trip — see src/lib/admin/formRedirect.ts. */
export const TESTIMONIAL_FORM_FIELDS = [
  "authorName",
  "roleContextFr",
  "roleContextEn",
  "quoteFr",
  "quoteEn",
  "mediaId",
  "position",
  "isVisible",
] as const;

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseTestimonialForm(
  formData: FormData,
): { ok: true; data: ParsedTestimonialForm } | { ok: false; errors: TestimonialFormErrors } {
  const errors: TestimonialFormErrors = {};

  const authorName = stringField(formData, "authorName");
  if (!authorName) errors.authorName = "Le nom de la personne est requis.";

  const quoteFr = stringField(formData, "quoteFr");
  if (!quoteFr) errors.quoteFr = "Le texte du témoignage en FR est requis.";

  const quoteEn = stringField(formData, "quoteEn");
  if (!quoteEn) errors.quoteEn = "Le texte du témoignage en EN est requis.";

  const position = Number(stringField(formData, "position"));
  if (!Number.isInteger(position) || position <= 0) {
    errors.position = "La position doit être un entier positif.";
  }

  // "" means the admin picked "Aucun média" — a photo is optional here,
  // unlike Travail/Services (see MediaPickerField's `required` prop).
  const mediaIdRaw = stringField(formData, "mediaId");
  let photoMediaId: number | null = null;
  if (mediaIdRaw !== "") {
    photoMediaId = Number(mediaIdRaw);
    if (!Number.isInteger(photoMediaId) || photoMediaId <= 0) {
      errors.mediaId = "Sélection de média invalide.";
    }
  }

  const roleContextFrRaw = stringField(formData, "roleContextFr");
  const roleContextEnRaw = stringField(formData, "roleContextEn");
  const isVisible = formData.get("isVisible") === "on";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      authorName,
      roleContextFr: roleContextFrRaw === "" ? null : roleContextFrRaw,
      roleContextEn: roleContextEnRaw === "" ? null : roleContextEnRaw,
      quoteFr,
      quoteEn,
      photoMediaId,
      position,
      isVisible,
    },
  };
}

const LANGUAGE_STATUSES = new Set(["draft", "published", "archived"]);
export function isValidLanguageStatus(value: string): value is "draft" | "published" | "archived" {
  return LANGUAGE_STATUSES.has(value);
}

export function isValidLocale(value: string): value is "fr" | "en" {
  return value === "fr" || value === "en";
}
