/**
 * Server-side validation for the Work item form (Implementation Brief 013
 * §22: "Ne pas dépendre de validation HTML seule"). Pure — takes a
 * `FormData`, never trusts `required`/`min`/`max` HTML attributes alone.
 * The DAL (`src/lib/db/work.ts`) still enforces its own minimal
 * invariants (altFr/altEn required); this layer catches everything else
 * before a single query runs, with field-level messages the form can
 * redisplay next to each input.
 */
export interface WorkItemFormErrors {
  [field: string]: string;
}

export interface ParsedWorkItemForm {
  mediaId: number;
  category: "wedding" | "portrait" | "event" | null;
  position: number;
  ratio: string;
  captionFr: string | null;
  captionEn: string | null;
  altFr: string;
  altEn: string;
  focalX: number;
  focalY: number;
  isVisible: boolean;
  featuredOnHome: boolean;
}

const ALLOWED_CATEGORIES = new Set(["wedding", "portrait", "event"]);
const RATIO_PATTERN = /^\d+\s*\/\s*\d+$/;

/** Field list for buildFormRedirect's round-trip — see src/lib/admin/formRedirect.ts. */
export const WORK_ITEM_FORM_FIELDS = [
  "mediaId",
  "category",
  "position",
  "ratio",
  "captionFr",
  "captionEn",
  "altFr",
  "altEn",
  "focalX",
  "focalY",
  "isVisible",
  "featuredOnHome",
] as const;

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseWorkItemForm(
  formData: FormData,
): { ok: true; data: ParsedWorkItemForm } | { ok: false; errors: WorkItemFormErrors } {
  const errors: WorkItemFormErrors = {};

  const mediaId = Number(stringField(formData, "mediaId"));
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    errors.mediaId = "Sélectionnez un média.";
  }

  const categoryRaw = stringField(formData, "category");
  let category: "wedding" | "portrait" | "event" | null = null;
  if (categoryRaw !== "") {
    if (!ALLOWED_CATEGORIES.has(categoryRaw)) {
      errors.category = "Catégorie invalide.";
    } else {
      category = categoryRaw as "wedding" | "portrait" | "event";
    }
  }

  const position = Number(stringField(formData, "position"));
  if (!Number.isInteger(position) || position <= 0) {
    errors.position = "La position doit être un entier positif.";
  }

  const ratio = stringField(formData, "ratio");
  if (!ratio || !RATIO_PATTERN.test(ratio)) {
    errors.ratio = "Le ratio doit être au format largeur/hauteur (ex. 4/5).";
  }

  const altFr = stringField(formData, "altFr");
  if (!altFr) errors.altFr = "L'alt texte FR est requis (accessibilité, jamais facultatif).";

  const altEn = stringField(formData, "altEn");
  if (!altEn) errors.altEn = "L'alt texte EN est requis (accessibilité, jamais facultatif).";

  const captionFrRaw = stringField(formData, "captionFr");
  const captionEnRaw = stringField(formData, "captionEn");

  const focalXRaw = stringField(formData, "focalX");
  const focalX = focalXRaw === "" ? 50 : Number(focalXRaw);
  if (!Number.isFinite(focalX) || focalX < 0 || focalX > 100) {
    errors.focalX = "Le point focal horizontal doit être entre 0 et 100.";
  }

  const focalYRaw = stringField(formData, "focalY");
  const focalY = focalYRaw === "" ? 50 : Number(focalYRaw);
  if (!Number.isFinite(focalY) || focalY < 0 || focalY > 100) {
    errors.focalY = "Le point focal vertical doit être entre 0 et 100.";
  }

  const isVisible = formData.get("isVisible") === "on";
  const featuredOnHome = formData.get("featuredOnHome") === "on";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      mediaId,
      category,
      position,
      ratio,
      captionFr: captionFrRaw === "" ? null : captionFrRaw,
      captionEn: captionEnRaw === "" ? null : captionEnRaw,
      altFr,
      altEn,
      focalX,
      focalY,
      isVisible,
      featuredOnHome,
    },
  };
}

/** locale is validated against this fixed set wherever a route parameter claims to be one. */
export function isValidLocale(value: string): value is "fr" | "en" {
  return value === "fr" || value === "en";
}

const LANGUAGE_STATUSES = new Set(["draft", "published", "archived"]);
export function isValidLanguageStatus(value: string): value is "draft" | "published" | "archived" {
  return LANGUAGE_STATUSES.has(value);
}
