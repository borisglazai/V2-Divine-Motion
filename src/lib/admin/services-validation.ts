/**
 * Server-side validation for the Service form — same discipline as
 * src/lib/admin/validation.ts (Work item form): never trusts HTML
 * `required`/`min`/`max` alone. The DAL (src/lib/db/services.ts) still
 * enforces its own minimal invariants; this layer catches everything
 * else before a single query runs, with field-level messages the form
 * can redisplay next to each input.
 */
export interface ServiceFormErrors {
  [field: string]: string;
}

export interface ParsedServiceForm {
  slug: string;
  mediaId: number;
  position: number;
  ratio: string;
  titleFr: string;
  titleEn: string;
  taglineFr: string | null;
  taglineEn: string | null;
  descriptionFr: string;
  descriptionEn: string;
  imageAltFr: string;
  imageAltEn: string;
  ctaLabelFr: string;
  ctaLabelEn: string;
  isActive: boolean;
}

/** Field list for buildFormRedirect's round-trip — see src/lib/admin/formRedirect.ts. */
export const SERVICE_FORM_FIELDS = [
  "slug",
  "mediaId",
  "position",
  "ratio",
  "titleFr",
  "titleEn",
  "taglineFr",
  "taglineEn",
  "descriptionFr",
  "descriptionEn",
  "imageAltFr",
  "imageAltEn",
  "ctaLabelFr",
  "ctaLabelEn",
  "isActive",
] as const;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RATIO_PATTERN = /^\d+\s*\/\s*\d+$/;

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseServiceForm(
  formData: FormData,
): { ok: true; data: ParsedServiceForm } | { ok: false; errors: ServiceFormErrors } {
  const errors: ServiceFormErrors = {};

  const slug = stringField(formData, "slug");
  if (!slug || !SLUG_PATTERN.test(slug)) {
    errors.slug = "Le slug doit être en minuscules, chiffres et tirets uniquement (ex. mariage-en-plein-air).";
  }

  const mediaId = Number(stringField(formData, "mediaId"));
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    errors.mediaId = "Sélectionnez un média.";
  }

  const position = Number(stringField(formData, "position"));
  if (!Number.isInteger(position) || position <= 0) {
    errors.position = "La position doit être un entier positif.";
  }

  const ratio = stringField(formData, "ratio");
  if (!ratio || !RATIO_PATTERN.test(ratio)) {
    errors.ratio = "Le ratio doit être au format largeur/hauteur (ex. 4/5).";
  }

  const titleFr = stringField(formData, "titleFr");
  if (!titleFr) errors.titleFr = "Le nom du service en FR est requis.";

  const titleEn = stringField(formData, "titleEn");
  if (!titleEn) errors.titleEn = "Le nom du service en EN est requis.";

  const descriptionFr = stringField(formData, "descriptionFr");
  if (!descriptionFr) errors.descriptionFr = "La description en FR est requise.";

  const descriptionEn = stringField(formData, "descriptionEn");
  if (!descriptionEn) errors.descriptionEn = "La description en EN est requise.";

  const imageAltFr = stringField(formData, "imageAltFr");
  if (!imageAltFr) errors.imageAltFr = "L'alt texte FR est requis (accessibilité, jamais facultatif).";

  const imageAltEn = stringField(formData, "imageAltEn");
  if (!imageAltEn) errors.imageAltEn = "L'alt texte EN est requis (accessibilité, jamais facultatif).";

  const ctaLabelFr = stringField(formData, "ctaLabelFr");
  if (!ctaLabelFr) errors.ctaLabelFr = "Le texte du bouton d'appel à l'action en FR est requis.";

  const ctaLabelEn = stringField(formData, "ctaLabelEn");
  if (!ctaLabelEn) errors.ctaLabelEn = "Le texte du bouton d'appel à l'action en EN est requis.";

  const taglineFrRaw = stringField(formData, "taglineFr");
  const taglineEnRaw = stringField(formData, "taglineEn");

  const isActive = formData.get("isActive") === "on";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      slug,
      mediaId,
      position,
      ratio,
      titleFr,
      titleEn,
      taglineFr: taglineFrRaw === "" ? null : taglineFrRaw,
      taglineEn: taglineEnRaw === "" ? null : taglineEnRaw,
      descriptionFr,
      descriptionEn,
      imageAltFr,
      imageAltEn,
      ctaLabelFr,
      ctaLabelEn,
      isActive,
    },
  };
}

/** Cap enforced client-side too (Boris's brief: "Max 3" features per service, same discipline as the pre-CMS mock). Not a hard DB constraint — service_features has no CHECK on count — so this is validated here, the one place a feature list is ever written. */
const MAX_FEATURES = 3;

export interface ParsedServiceFeature {
  position: number;
  textFr: string;
  textEn: string;
}

export function parseServiceFeatures(formData: FormData): ParsedServiceFeature[] {
  const textFr = formData.getAll("featureTextFr").map((v) => String(v).trim());
  const textEn = formData.getAll("featureTextEn").map((v) => String(v).trim());
  const features: ParsedServiceFeature[] = [];
  const count = Math.min(textFr.length, textEn.length, MAX_FEATURES);
  for (let i = 0; i < count; i++) {
    if (textFr[i] === "" && textEn[i] === "") continue;
    features.push({ position: features.length + 1, textFr: textFr[i], textEn: textEn[i] });
  }
  return features;
}

const LANGUAGE_STATUSES = new Set(["draft", "published", "archived"]);
export function isValidLanguageStatus(value: string): value is "draft" | "published" | "archived" {
  return LANGUAGE_STATUSES.has(value);
}

export function isValidLocale(value: string): value is "fr" | "en" {
  return value === "fr" || value === "en";
}
