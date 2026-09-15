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

export async function publishTestimonial(
  db: D1Database,
  draftId: number,
  updatedBy?: string,
): Promise<Result<{ publishedId: number }>> {
  return publishDraft(db, CONFIG, draftId, { updatedBy });
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
