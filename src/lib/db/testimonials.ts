/**
 * Testimonials repository — simple MVP model, no review system.
 * Soft-deletable (only meaningful on the published row — see
 * migrations/0001_initial.sql comment on `deleted_at`).
 */
import type { Locale, Result, TestimonialRow } from "./types";
import { fail, ok } from "./types";
import { nowMs } from "./mappers";
import {
  createDraftFromPublished,
  createNewDraft,
  deleteDraft,
  getDraftOf,
  publishDraft,
  setLanguageStatus,
  updateDraft,
  type PublishableConfig,
} from "./publish";
import { getMedia } from "./media";

const TABLE = "testimonials";

const CONFIG: PublishableConfig = {
  table: TABLE,
  copyColumns: [
    "author_name",
    "quote_fr",
    "quote_en",
    "role_context_fr",
    "role_context_en",
    "photo_media_id",
    "position",
    "is_visible",
  ],
};

export async function listPublishedTestimonials(db: D1Database, locale: Locale): Promise<TestimonialRow[]> {
  const statusCol = `${locale}_status`;
  const { results } = await db
    .prepare(
      `SELECT * FROM testimonials WHERE status = 'published' AND ${statusCol} = 'published' AND is_visible = 1 AND deleted_at IS NULL ORDER BY position`,
    )
    .all<TestimonialRow>();
  return results;
}

export async function listAllTestimonials(db: D1Database, includeDeleted = false): Promise<TestimonialRow[]> {
  const query = includeDeleted
    ? `SELECT * FROM testimonials ORDER BY position, id`
    : `SELECT * FROM testimonials WHERE deleted_at IS NULL ORDER BY position, id`;
  const { results } = await db.prepare(query).all<TestimonialRow>();
  return results;
}

export async function getTestimonial(db: D1Database, id: number): Promise<TestimonialRow | null> {
  const row = await db.prepare(`SELECT * FROM testimonials WHERE id = ?`).bind(id).first<TestimonialRow>();
  return row ?? null;
}

/** Admin edit page's "open the existing draft, or offer to create one" read — same role as getWorkItemDraft/getServiceDraft. */
export async function getTestimonialDraft(db: D1Database, publishedId: number): Promise<TestimonialRow | null> {
  return (await getDraftOf(db, TABLE, publishedId)) as TestimonialRow | null;
}

/**
 * Public media route's authorization check (src/lib/public-media.ts),
 * testimonials' side of the same trust boundary isMediaUsedByPublicWorkItem/
 * isMediaUsedByPublicService enforce for Travail/Services — true only if
 * this media is the current `photo_media_id` of a testimonial that is
 * actually live somewhere public right now.
 */
export async function isMediaUsedByPublicTestimonial(db: D1Database, mediaId: number): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM testimonials WHERE photo_media_id = ? AND status = 'published' AND is_visible = 1 AND deleted_at IS NULL AND (fr_status = 'published' OR en_status = 'published') LIMIT 1`,
    )
    .bind(mediaId)
    .first();
  return row !== null;
}

export interface TestimonialInput {
  authorName: string;
  quoteFr: string;
  quoteEn: string;
  roleContextFr?: string | null;
  roleContextEn?: string | null;
  photoMediaId?: number | null;
  position: number;
  isVisible?: boolean;
}

function toRow(input: TestimonialInput): Record<string, unknown> {
  return {
    author_name: input.authorName,
    quote_fr: input.quoteFr,
    quote_en: input.quoteEn,
    role_context_fr: input.roleContextFr ?? null,
    role_context_en: input.roleContextEn ?? null,
    photo_media_id: input.photoMediaId ?? null,
    position: input.position,
    is_visible: input.isVisible === false ? 0 : 1,
  };
}

export async function createTestimonial(
  db: D1Database,
  input: TestimonialInput,
  createdBy?: string,
): Promise<Result<{ draftId: number }>> {
  return createNewDraft(db, CONFIG, toRow(input), {}, createdBy);
}

export async function createTestimonialDraft(
  db: D1Database,
  publishedId: number,
  updatedBy?: string,
): Promise<Result<{ draftId: number }>> {
  return createDraftFromPublished(db, CONFIG, publishedId, updatedBy);
}

export async function updateTestimonialDraft(
  db: D1Database,
  draftId: number,
  input: Partial<TestimonialInput>,
  updatedBy?: string,
): Promise<Result<void>> {
  const fields: Record<string, unknown> = {};
  if (input.authorName !== undefined) fields.author_name = input.authorName;
  if (input.quoteFr !== undefined) fields.quote_fr = input.quoteFr;
  if (input.quoteEn !== undefined) fields.quote_en = input.quoteEn;
  if (input.roleContextFr !== undefined) fields.role_context_fr = input.roleContextFr;
  if (input.roleContextEn !== undefined) fields.role_context_en = input.roleContextEn;
  if (input.photoMediaId !== undefined) fields.photo_media_id = input.photoMediaId;
  if (input.position !== undefined) fields.position = input.position;
  if (input.isVisible !== undefined) fields.is_visible = input.isVisible ? 1 : 0;
  return updateDraft(db, TABLE, draftId, fields, updatedBy);
}

export async function deleteTestimonialDraft(db: D1Database, draftId: number): Promise<Result<void>> {
  return deleteDraft(db, TABLE, draftId);
}

/**
 * Publication-rights preflight for the media-change-on-a-live-row case
 * (CMS Work Patch 013A's fix for work_items, mirrored for services in the
 * Services CMS brief, and here for consistency — the D1 trigger
 * `trg_testimonials_rights_gate_media_change` already covers this as the
 * last line of defense, but without a clear business error message
 * beforehand). Only blocks when the merge would make an unrighted photo
 * visible: a brand-new testimonial, or one with no photo at all, is
 * never blocked here.
 */
export async function publishTestimonial(
  db: D1Database,
  draftId: number,
  updatedBy?: string,
): Promise<Result<{ publishedId: number }>> {
  return publishDraft(db, CONFIG, draftId, {
    updatedBy,
    preflight: async (draft) => {
      const publishedId = draft.draft_of_id as number | null;
      if (publishedId === null) return null;

      const photoMediaId = draft.photo_media_id as number | null;
      if (photoMediaId === null) return null;

      const published = await db
        .prepare(`SELECT fr_status, en_status FROM testimonials WHERE id = ?`)
        .bind(publishedId)
        .first<{ fr_status: string; en_status: string }>();
      if (!published) return null;

      const anyLanguageLive = published.fr_status === "published" || published.en_status === "published";
      if (!anyLanguageLive) return null;

      const media = await getMedia(db, photoMediaId);
      if (!media || media.publication_rights_confirmed !== 1) {
        return {
          code: "PUBLICATION_RIGHTS_REQUIRED",
          message: `testimonial #${publishedId}: this row has a live language — the draft's photo publication rights must be confirmed before publishing`,
        };
      }
      return null;
    },
  });
}

/** Gated exactly like work_items: publishing with a photo requires that photo's rights confirmed (ADR-011). A text-only testimonial (no photo) is never gated. */
export async function setTestimonialLanguageStatus(
  db: D1Database,
  id: number,
  locale: Locale,
  status: "draft" | "published" | "archived",
  updatedBy?: string,
): Promise<Result<void>> {
  return setLanguageStatus(db, TABLE, id, locale, status, {
    updatedBy,
    preflight: async (row) => {
      if (status !== "published") return null;
      const photoMediaId = row.photo_media_id as number | null;
      if (photoMediaId === null) return null;
      const media = await getMedia(db, photoMediaId);
      if (!media || media.publication_rights_confirmed !== 1) {
        return {
          code: "PUBLICATION_RIGHTS_REQUIRED",
          message: `testimonial #${id}: referenced photo publication rights are not confirmed`,
        };
      }
      return null;
    },
  });
}

export async function softDeleteTestimonial(db: D1Database, id: number): Promise<Result<void>> {
  const result = await db
    .prepare(`UPDATE testimonials SET deleted_at = ?, updated_at = ? WHERE id = ? AND status = 'published' AND deleted_at IS NULL`)
    .bind(nowMs(), nowMs(), id)
    .run();
  if (result.meta.changes === 0) return fail("NOT_FOUND", `testimonial #${id} not found or already deleted`);
  return ok(undefined);
}

export async function restoreTestimonial(db: D1Database, id: number): Promise<Result<void>> {
  const result = await db
    .prepare(`UPDATE testimonials SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL`)
    .bind(nowMs(), id)
    .run();
  if (result.meta.changes === 0) return fail("NOT_FOUND", `testimonial #${id} not found or not deleted`);
  return ok(undefined);
}

export interface ReorderTestimonialDraftResult {
  publishedId: number;
  draftId: number;
}

/** Draft-safe reordering — same pattern as reorderWorkItemDrafts/reorderServiceDrafts (Review 011A): never writes position directly onto a published row. */
export async function reorderTestimonialDrafts(
  db: D1Database,
  orderedPublishedIds: number[],
  updatedBy?: string,
): Promise<Result<ReorderTestimonialDraftResult[]>> {
  if (orderedPublishedIds.length === 0) return ok([]);

  const placeholders = orderedPublishedIds.map(() => "?").join(", ");
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS count FROM testimonials WHERE id IN (${placeholders}) AND status = 'published' AND deleted_at IS NULL`)
    .bind(...orderedPublishedIds)
    .first<{ count: number }>();
  if (!countRow || countRow.count !== orderedPublishedIds.length) {
    return fail("NOT_FOUND", "one or more testimonial ids are not published rows");
  }

  const results: ReorderTestimonialDraftResult[] = [];
  for (let i = 0; i < orderedPublishedIds.length; i++) {
    const publishedId = orderedPublishedIds[i];
    const existingDraft = await getDraftOf(db, TABLE, publishedId);
    let draftId: number;
    if (existingDraft) {
      draftId = existingDraft.id;
    } else {
      const created = await createDraftFromPublished(db, CONFIG, publishedId, updatedBy);
      if (!created.ok) return created;
      draftId = created.data.draftId;
    }
    const updated = await updateDraft(db, TABLE, draftId, { position: i + 1 }, updatedBy);
    if (!updated.ok) return updated;
    results.push({ publishedId, draftId });
  }

  return ok(results);
}
