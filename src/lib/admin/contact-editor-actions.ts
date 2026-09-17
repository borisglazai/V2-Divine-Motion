/**
 * Éditeur visuel Phase 2 — Contact page-level copy (`contact_content`:
 * hero title/intro, details label, closing note). Same pattern as
 * home-editor-actions.ts. The contact form itself (already visual-only,
 * no real backend — see ContactView.astro's own header comment) is never
 * touched here: this phase is editorial content only, per Boris's brief.
 */
import * as pages from "@/lib/db/pages";
import type { Locale } from "@/lib/db/types";
import { adminErrorMessage } from "./errors";
import { withFlash } from "./flash";
import { ensureSiteEditorDraft, publishSiteEditorPage, setSiteEditorLanguageStatusAction } from "./site-editor-shared";

const REDIRECT_BASE = "/admin/site/contact";

export interface ContactEditorFields {
  heroTitleFr?: string;
  heroTitleEn?: string;
  heroSubtextFr?: string;
  heroSubtextEn?: string;
  detailsLabelFr?: string;
  detailsLabelEn?: string;
  closingNoteFr?: string;
  closingNoteEn?: string;
}

function toRow(fields: ContactEditorFields): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (fields.heroTitleFr !== undefined) row.hero_title_fr = fields.heroTitleFr;
  if (fields.heroTitleEn !== undefined) row.hero_title_en = fields.heroTitleEn;
  if (fields.heroSubtextFr !== undefined) row.hero_subtext_fr = fields.heroSubtextFr;
  if (fields.heroSubtextEn !== undefined) row.hero_subtext_en = fields.heroSubtextEn;
  if (fields.detailsLabelFr !== undefined) row.details_label_fr = fields.detailsLabelFr;
  if (fields.detailsLabelEn !== undefined) row.details_label_en = fields.detailsLabelEn;
  if (fields.closingNoteFr !== undefined) row.closing_note_fr = fields.closingNoteFr;
  if (fields.closingNoteEn !== undefined) row.closing_note_en = fields.closingNoteEn;
  return row;
}

export async function saveContactEditorAction(db: D1Database, fields: ContactEditorFields, updatedBy: string): Promise<{ redirect: string }> {
  const draftResult = await ensureSiteEditorDraft(db, pages.contactContent, updatedBy);
  if (!draftResult.ok) {
    return { redirect: withFlash(REDIRECT_BASE, "error", adminErrorMessage(draftResult.error)) };
  }

  const updated = await pages.updateContactContentDraft(db, draftResult.data.draftId, toRow(fields), updatedBy);
  if (!updated.ok) {
    return { redirect: withFlash(REDIRECT_BASE, "error", adminErrorMessage(updated.error)) };
  }

  return { redirect: withFlash(REDIRECT_BASE, "success", "Brouillon enregistré.") };
}

export async function publishContactEditorAction(db: D1Database, updatedBy: string): Promise<{ redirect: string }> {
  return publishSiteEditorPage(db, pages.contactContent, REDIRECT_BASE, updatedBy);
}

export async function setContactEditorLanguageStatusAction(
  db: D1Database,
  locale: Locale,
  status: "draft" | "published",
  updatedBy: string,
): Promise<{ redirect: string }> {
  return setSiteEditorLanguageStatusAction(db, pages.contactContent, REDIRECT_BASE, locale, status, updatedBy);
}
