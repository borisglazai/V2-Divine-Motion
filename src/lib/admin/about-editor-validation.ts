/**
 * Server-side parsing for the À propos visual editor's save request.
 * Fixed fields follow home-editor-validation.ts's convention (every field
 * optional, only what's present is validated). Story paragraphs/approach
 * items are dynamically indexed (`storyParagraph0Fr`, `approachItem2WordEn`,
 * …) since their count is whatever's already in the schema (see
 * about-editor-actions.ts header on why only the CURRENT locale is ever
 * submitted for these).
 */
import type { AboutEditorFields, ApproachItemEdit, ChildTextEdit } from "./about-editor-actions";
import type { Locale } from "@/lib/db/types";

export interface AboutEditorFormErrors {
  [field: string]: string;
}

function stringField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function parseAboutEditorForm(
  formData: FormData,
): { ok: true; data: AboutEditorFields; storyParagraphEdits: ChildTextEdit[]; approachItemEdits: ApproachItemEdit[] } | { ok: false; errors: AboutEditorFormErrors } {
  const errors: AboutEditorFormErrors = {};
  const data: AboutEditorFields = {};

  const simpleFields: (keyof AboutEditorFields)[] = [
    "heroTitleFr",
    "heroTitleEn",
    "heroIntroFr",
    "heroIntroEn",
    "storyLabelFr",
    "storyLabelEn",
    "approachLabelFr",
    "approachLabelEn",
    "finalCtaHeadlineFr",
    "finalCtaHeadlineEn",
  ];
  for (const field of simpleFields) {
    const value = stringField(formData, field);
    if (value !== undefined) (data as Record<string, string>)[field] = value;
    else if (formData.has(field)) errors[field] = "Ce champ ne peut pas être vide.";
  }

  const heroMediaIdRaw = formData.get("heroMediaId");
  if (typeof heroMediaIdRaw === "string" && heroMediaIdRaw !== "") {
    const heroMediaId = Number(heroMediaIdRaw);
    if (!Number.isInteger(heroMediaId) || heroMediaId <= 0) {
      errors.heroMediaId = "Sélection de média invalide.";
    } else {
      data.heroMediaId = heroMediaId;
    }
  }

  const storyParagraphEdits: ChildTextEdit[] = [];
  const approachItemEdits: Map<number, ApproachItemEdit> = new Map();
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;

    const paragraphMatch = key.match(/^storyParagraph(\d+)(Fr|En)$/);
    if (paragraphMatch) {
      storyParagraphEdits.push({ index: Number(paragraphMatch[1]), locale: paragraphMatch[2] === "Fr" ? "fr" : "en", text: value });
      continue;
    }

    const approachMatch = key.match(/^approachItem(\d+)(Word|Text)(Fr|En)$/);
    if (approachMatch) {
      const index = Number(approachMatch[1]);
      const kind = approachMatch[2];
      const locale: Locale = approachMatch[3] === "Fr" ? "fr" : "en";
      const existing = approachItemEdits.get(index) ?? { index, locale };
      if (kind === "Word") existing.word = value;
      else existing.text = value;
      approachItemEdits.set(index, existing);
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data, storyParagraphEdits, approachItemEdits: [...approachItemEdits.values()] };
}

export function isValidLocale(value: string): value is "fr" | "en" {
  return value === "fr" || value === "en";
}

export function isValidPageLanguageStatus(value: string): value is "draft" | "published" {
  return value === "draft" || value === "published";
}
