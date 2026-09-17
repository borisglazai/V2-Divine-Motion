/**
 * Éditeur visuel Phase 2 — page-level Travail copy (`work_page_content`:
 * title/intro/CTA + the admin-selected `gallery_layout`). Same pattern as
 * services-page-editor-actions.ts. Never touches individual `work_items`
 * (their own gallery-slot editing — src/lib/admin/work-slot-actions.ts).
 */
import * as pages from "@/lib/db/pages";
import type { Locale, WorkGalleryLayout } from "@/lib/db/types";
import { adminErrorMessage } from "./errors";
import { withFlash } from "./flash";
import { ensureSiteEditorDraft, publishSiteEditorPage, setSiteEditorLanguageStatusAction } from "./site-editor-shared";

const REDIRECT_BASE = "/admin/site/travail";
const VALID_LAYOUTS: readonly WorkGalleryLayout[] = ["editorial", "story", "minimal"];

export function isValidGalleryLayout(value: string): value is WorkGalleryLayout {
  return (VALID_LAYOUTS as readonly string[]).includes(value);
}

export interface WorkPageEditorFields {
  titleFr?: string;
  titleEn?: string;
  introFr?: string;
  introEn?: string;
  ctaHeadlineFr?: string;
  ctaHeadlineEn?: string;
  galleryLayout?: WorkGalleryLayout;
}

function toRow(fields: WorkPageEditorFields): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (fields.titleFr !== undefined) row.title_fr = fields.titleFr;
  if (fields.titleEn !== undefined) row.title_en = fields.titleEn;
  if (fields.introFr !== undefined) row.intro_fr = fields.introFr;
  if (fields.introEn !== undefined) row.intro_en = fields.introEn;
  if (fields.ctaHeadlineFr !== undefined) row.cta_headline_fr = fields.ctaHeadlineFr;
  if (fields.ctaHeadlineEn !== undefined) row.cta_headline_en = fields.ctaHeadlineEn;
  if (fields.galleryLayout !== undefined) row.gallery_layout = fields.galleryLayout;
  return row;
}

export async function saveWorkPageEditorAction(db: D1Database, fields: WorkPageEditorFields, updatedBy: string): Promise<{ redirect: string }> {
  const draftResult = await ensureSiteEditorDraft(db, pages.workPageContent, updatedBy);
  if (!draftResult.ok) {
    return { redirect: withFlash(REDIRECT_BASE, "error", adminErrorMessage(draftResult.error)) };
  }

  const updated = await pages.updateWorkPageContentDraft(db, draftResult.data.draftId, toRow(fields), updatedBy);
  if (!updated.ok) {
    return { redirect: withFlash(REDIRECT_BASE, "error", adminErrorMessage(updated.error)) };
  }

  return { redirect: withFlash(REDIRECT_BASE, "success", "Brouillon enregistré.") };
}

export async function publishWorkPageEditorAction(db: D1Database, updatedBy: string): Promise<{ redirect: string }> {
  return publishSiteEditorPage(db, pages.workPageContent, REDIRECT_BASE, updatedBy);
}

export async function setWorkPageEditorLanguageStatusAction(
  db: D1Database,
  locale: Locale,
  status: "draft" | "published",
  updatedBy: string,
): Promise<{ redirect: string }> {
  return setSiteEditorLanguageStatusAction(db, pages.workPageContent, REDIRECT_BASE, locale, status, updatedBy);
}
