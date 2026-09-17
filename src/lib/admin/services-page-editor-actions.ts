/**
 * Éditeur visuel Phase 1 — texte de page Services (`services_page_content`).
 * Never touches `services` (the individual service items CMS, already
 * validated — see Services CMS brief) — this is exclusively the page-level
 * copy (title/intro/approach label/final CTA) that ServicesView.astro
 * still reads from a mock. Phase 1 leaves the 3 approach steps'
 * individual text out of scope (see docs/CMS_SPEC.md "Éditeur visuel
 * Phase 1") — only the section label is editable here.
 */
import * as pages from "@/lib/db/pages";
import { adminErrorMessage } from "./errors";
import { withFlash } from "./flash";
import { ensureSiteEditorDraft, publishSiteEditorPage, setSiteEditorLanguageStatusAction } from "./site-editor-shared";
import type { Locale } from "@/lib/db/types";

const REDIRECT_BASE = "/admin/site/services";

export interface ServicesPageEditorFields {
  titleFr?: string;
  titleEn?: string;
  introFr?: string;
  introEn?: string;
  approachLabelFr?: string;
  approachLabelEn?: string;
  ctaHeadlineFr?: string;
  ctaHeadlineEn?: string;
}

function toRow(fields: ServicesPageEditorFields): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (fields.titleFr !== undefined) row.title_fr = fields.titleFr;
  if (fields.titleEn !== undefined) row.title_en = fields.titleEn;
  if (fields.introFr !== undefined) row.intro_fr = fields.introFr;
  if (fields.introEn !== undefined) row.intro_en = fields.introEn;
  if (fields.approachLabelFr !== undefined) row.approach_label_fr = fields.approachLabelFr;
  if (fields.approachLabelEn !== undefined) row.approach_label_en = fields.approachLabelEn;
  if (fields.ctaHeadlineFr !== undefined) row.cta_headline_fr = fields.ctaHeadlineFr;
  if (fields.ctaHeadlineEn !== undefined) row.cta_headline_en = fields.ctaHeadlineEn;
  return row;
}

export async function saveServicesPageEditorAction(
  db: D1Database,
  fields: ServicesPageEditorFields,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const draftResult = await ensureSiteEditorDraft(db, pages.servicesPageContent, updatedBy);
  if (!draftResult.ok) {
    return { redirect: withFlash(REDIRECT_BASE, "error", adminErrorMessage(draftResult.error)) };
  }

  const updated = await pages.updateServicesPageContentDraft(db, draftResult.data.draftId, toRow(fields), updatedBy);
  if (!updated.ok) {
    return { redirect: withFlash(REDIRECT_BASE, "error", adminErrorMessage(updated.error)) };
  }

  return { redirect: withFlash(REDIRECT_BASE, "success", "Brouillon enregistré.") };
}

export async function publishServicesPageEditorAction(db: D1Database, updatedBy: string): Promise<{ redirect: string }> {
  return publishSiteEditorPage(db, pages.servicesPageContent, REDIRECT_BASE, updatedBy);
}

export async function setServicesPageEditorLanguageStatusAction(
  db: D1Database,
  locale: Locale,
  status: "draft" | "published",
  updatedBy: string,
): Promise<{ redirect: string }> {
  return setSiteEditorLanguageStatusAction(db, pages.servicesPageContent, REDIRECT_BASE, locale, status, updatedBy);
}
