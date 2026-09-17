/**
 * Éditeur visuel / "Modifier le site" Phase 1 — shared mutation logic for
 * the singleton page-content tables (home_content, services_page_content,
 * ...; src/lib/db/pages.ts's pageRepo factory). Every one of these tables
 * has exactly the same "draft/publish/language-status" shape as
 * work-actions.ts/services-actions.ts, just with a different field set
 * per page — this factors out the identical "ensure a draft exists, then
 * mutate it" plumbing once instead of copy-pasting it per page.
 */
import { getMedia } from "@/lib/db/media";
import type { Locale, Result } from "@/lib/db/types";
import { fail } from "@/lib/db/types";
import { withFlash } from "./flash";
import { adminErrorMessage } from "./errors";

export interface SiteEditorRepo<Row extends { id: number }> {
  getPublished(db: D1Database): Promise<Row | null>;
  getDraft(db: D1Database): Promise<Row | null>;
  createDraft(db: D1Database, updatedBy?: string): Promise<Result<{ draftId: number }>>;
  publish(db: D1Database, draftId: number, updatedBy?: string): Promise<Result<{ publishedId: number }>>;
  setLanguageStatus(db: D1Database, locale: Locale, status: "draft" | "published", updatedBy?: string): Promise<Result<void>>;
}

/**
 * Opens the existing draft, or creates one from the published row — same
 * "edit always touches a draft" rule as every other CMS module.
 *
 * Bug fix (staging validation): this used to trust `repo.getDraft(db)`
 * alone — if a draft happened to exist, it was reused without ever
 * confirming a published row still exists, so "Enregistrer" could report
 * success on a table with no live published row while "Publier FR"/
 * "Publier" (which both correctly require one) then failed with a
 * confusing NOT_FOUND, well after the save had already looked fine. Save
 * and publish now share the exact same "a published row must exist"
 * precondition, so a table in that state fails clearly and immediately
 * at save time instead of appearing to succeed and breaking later.
 */
export async function ensureSiteEditorDraft<Row extends { id: number }>(
  db: D1Database,
  repo: SiteEditorRepo<Row>,
  updatedBy: string,
): Promise<Result<{ draftId: number }>> {
  const published = await repo.getPublished(db);
  if (!published) {
    return fail("NOT_FOUND", "no published row to draft from — this page has never been published");
  }
  const existing = await repo.getDraft(db);
  if (existing) return { ok: true, data: { draftId: existing.id } };
  return repo.createDraft(db, updatedBy);
}

/** Same "media exists, not deleted, ready" check every media-referencing form in this codebase runs before writing (work-actions.ts/services-actions.ts/testimonials-actions.ts). */
export async function siteEditorMediaIsUsable(db: D1Database, mediaId: number | null): Promise<boolean> {
  if (mediaId === null) return true;
  const media = await getMedia(db, mediaId);
  return !!media && media.deleted_at === null && media.processing_status === "ready";
}

export async function publishSiteEditorPage<Row extends { id: number }>(
  db: D1Database,
  repo: SiteEditorRepo<Row>,
  redirectBase: string,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const draft = await repo.getDraft(db);
  if (!draft) {
    return { redirect: withFlash(redirectBase, "error", "Aucun brouillon à publier.") };
  }
  const result = await repo.publish(db, draft.id, updatedBy);
  if (!result.ok) {
    return { redirect: withFlash(redirectBase, "error", adminErrorMessage(result.error)) };
  }
  return { redirect: withFlash(redirectBase, "success", "Page publiée.") };
}

export async function setSiteEditorLanguageStatusAction<Row extends { id: number }>(
  db: D1Database,
  repo: SiteEditorRepo<Row>,
  redirectBase: string,
  locale: Locale,
  status: "draft" | "published",
  updatedBy: string,
): Promise<{ redirect: string }> {
  const result = await repo.setLanguageStatus(db, locale, status, updatedBy);
  if (!result.ok) {
    return { redirect: withFlash(redirectBase, "error", adminErrorMessage(result.error)) };
  }
  return { redirect: withFlash(redirectBase, "success", `Statut ${locale.toUpperCase()} mis à jour.`) };
}
