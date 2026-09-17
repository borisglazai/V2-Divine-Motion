/**
 * Éditeur visuel Phase 1 — Accueil. Mutation logic for `home_content`
 * behind the visual editor (`/admin/site`). Phase 1's editable field set
 * is intentionally a subset of the full schema (see
 * docs/CMS_SPEC.md "Éditeur visuel Phase 1") — hero text + hero media,
 * brand statement, final CTA headline. The other home_content fields
 * (work/services preview labels, section visibility toggles) exist in
 * the schema and stay at their seeded values; a future iteration can
 * expose them the same way, without any DAL/migration work.
 */
import * as pages from "@/lib/db/pages";
import { withFlash } from "./flash";
import { adminErrorMessage } from "./errors";
import { ensureSiteEditorDraft, publishSiteEditorPage, setSiteEditorLanguageStatusAction, siteEditorMediaIsUsable } from "./site-editor-shared";
import type { Locale } from "@/lib/db/types";

const REDIRECT_BASE = "/admin/site";

export interface HomeEditorFields {
  heroHeadlineFr?: string;
  heroHeadlineEn?: string;
  heroSublineFr?: string;
  heroSublineEn?: string;
  heroMediaId?: number;
  heroImageAltFr?: string;
  heroImageAltEn?: string;
  brandStatementFr?: string;
  brandStatementEn?: string;
  finalCtaHeadlineFr?: string;
  finalCtaHeadlineEn?: string;
}

function toRow(fields: HomeEditorFields): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (fields.heroHeadlineFr !== undefined) row.hero_headline_fr = fields.heroHeadlineFr;
  if (fields.heroHeadlineEn !== undefined) row.hero_headline_en = fields.heroHeadlineEn;
  if (fields.heroSublineFr !== undefined) row.hero_subline_fr = fields.heroSublineFr;
  if (fields.heroSublineEn !== undefined) row.hero_subline_en = fields.heroSublineEn;
  if (fields.heroMediaId !== undefined) row.hero_media_id = fields.heroMediaId;
  if (fields.heroImageAltFr !== undefined) row.hero_image_alt_fr = fields.heroImageAltFr;
  if (fields.heroImageAltEn !== undefined) row.hero_image_alt_en = fields.heroImageAltEn;
  if (fields.brandStatementFr !== undefined) row.brand_statement_fr = fields.brandStatementFr;
  if (fields.brandStatementEn !== undefined) row.brand_statement_en = fields.brandStatementEn;
  if (fields.finalCtaHeadlineFr !== undefined) row.final_cta_headline_fr = fields.finalCtaHeadlineFr;
  if (fields.finalCtaHeadlineEn !== undefined) row.final_cta_headline_en = fields.finalCtaHeadlineEn;
  return row;
}

export async function saveHomeEditorAction(
  db: D1Database,
  fields: HomeEditorFields,
  updatedBy: string,
): Promise<{ redirect: string }> {
  if (fields.heroMediaId !== undefined && !(await siteEditorMediaIsUsable(db, fields.heroMediaId))) {
    return { redirect: withFlash(REDIRECT_BASE, "error", "Ce média n'est pas disponible (supprimé ou non prêt).") };
  }

  const draftResult = await ensureSiteEditorDraft(db, pages.homeContent, updatedBy);
  if (!draftResult.ok) {
    return { redirect: withFlash(REDIRECT_BASE, "error", adminErrorMessage(draftResult.error)) };
  }

  const updated = await pages.updateHomeContentDraft(db, draftResult.data.draftId, toRow(fields), updatedBy);
  if (!updated.ok) {
    return { redirect: withFlash(REDIRECT_BASE, "error", adminErrorMessage(updated.error)) };
  }

  return { redirect: withFlash(REDIRECT_BASE, "success", "Brouillon enregistré.") };
}

export async function publishHomeEditorAction(db: D1Database, updatedBy: string): Promise<{ redirect: string }> {
  return publishSiteEditorPage(db, pages.homeContent, REDIRECT_BASE, updatedBy);
}

export async function setHomeEditorLanguageStatusAction(
  db: D1Database,
  locale: Locale,
  status: "draft" | "published",
  updatedBy: string,
): Promise<{ redirect: string }> {
  return setSiteEditorLanguageStatusAction(db, pages.homeContent, REDIRECT_BASE, locale, status, updatedBy);
}
