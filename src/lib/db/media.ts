/**
 * Media repository — metadata only (Brief 011 §15). No R2, no upload, no
 * transformation. `media` is NOT part of the draft/publish mechanism
 * (ADR-013 covers `work_items`/`services`/`testimonials`/page content,
 * not `media` itself) — it has its own, simpler lifecycle:
 * `processing_status` (upload progress) and `deleted_at` (trash).
 */
import type { MediaRow, Result } from "./types";
import { fail, ok } from "./types";
import { nowMs } from "./mappers";

export async function getMedia(db: D1Database, id: number): Promise<MediaRow | null> {
  const row = await db.prepare(`SELECT * FROM media WHERE id = ?`).bind(id).first<MediaRow>();
  return row ?? null;
}

export interface ListMediaOptions {
  includeDeleted?: boolean;
}

export async function listMedia(db: D1Database, options: ListMediaOptions = {}): Promise<MediaRow[]> {
  const query = options.includeDeleted
    ? `SELECT * FROM media ORDER BY created_at DESC`
    : `SELECT * FROM media WHERE deleted_at IS NULL ORDER BY created_at DESC`;
  const { results } = await db.prepare(query).all<MediaRow>();
  return results;
}

export interface CreateMediaInput {
  storageKey: string;
  originalFilename?: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Creates the metadata row the moment an upload is authorized (ADR-006
 * presigned direct upload) — before the file has actually landed in R2,
 * so no upload can ever leave an incoherent/missing row.
 * `processing_status` starts 'pending'.
 */
export async function createMediaMetadata(
  db: D1Database,
  input: CreateMediaInput,
  createdBy?: string,
): Promise<Result<{ id: number }>> {
  if (!input.storageKey || !input.mimeType || input.sizeBytes <= 0) {
    return fail("VALIDATION_FAILED", "storageKey, mimeType and a positive sizeBytes are required");
  }
  const now = nowMs();
  const result = await db
    .prepare(
      `INSERT INTO media (storage_key, original_filename, mime_type, size_bytes, processing_status, uploaded_at, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      input.storageKey,
      input.originalFilename ?? null,
      input.mimeType,
      input.sizeBytes,
      now,
      now,
      now,
      createdBy ?? null,
      createdBy ?? null,
    )
    .run<{ id: number }>();
  return ok({ id: result.results[0].id });
}

export interface UpdateMediaInput {
  altFr?: string | null;
  altEn?: string | null;
  focalX?: number;
  focalY?: number;
  publicationRightsConfirmed?: boolean;
  publicationRightsNote?: string | null;
}

export async function updateMediaMetadata(
  db: D1Database,
  id: number,
  input: UpdateMediaInput,
  updatedBy?: string,
): Promise<Result<void>> {
  const fields: Record<string, unknown> = {};
  if (input.altFr !== undefined) fields.alt_fr = input.altFr;
  if (input.altEn !== undefined) fields.alt_en = input.altEn;
  if (input.focalX !== undefined) fields.focal_x = input.focalX;
  if (input.focalY !== undefined) fields.focal_y = input.focalY;
  if (input.publicationRightsNote !== undefined) fields.publication_rights_note = input.publicationRightsNote;
  if (input.publicationRightsConfirmed !== undefined) {
    fields.publication_rights_confirmed = input.publicationRightsConfirmed ? 1 : 0;
    fields.publication_rights_confirmed_at = input.publicationRightsConfirmed ? nowMs() : null;
  }
  const columns = Object.keys(fields);
  if (columns.length === 0) return ok(undefined);

  const result = await db
    .prepare(
      `UPDATE media SET ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE id = ?`,
    )
    .bind(...columns.map((c) => fields[c]), nowMs(), updatedBy ?? null, id)
    .run();
  if (result.meta.changes === 0) return fail("NOT_FOUND", `media #${id} not found`);
  return ok(undefined);
}

/** Post-upload validation succeeded (ADR-006: real MIME/dimensions check happens after the direct R2 upload, before the media is usable). */
export async function markMediaReady(
  db: D1Database,
  id: number,
  dimensions: { width: number; height: number },
): Promise<Result<void>> {
  const result = await db
    .prepare(
      `UPDATE media SET processing_status = 'ready', width = ?, height = ?, updated_at = ? WHERE id = ? AND processing_status IN ('pending', 'uploaded')`,
    )
    .bind(dimensions.width, dimensions.height, nowMs(), id)
    .run();
  if (result.meta.changes === 0) {
    return fail("INVALID_STATE", `media #${id} is not pending/uploaded`);
  }
  return ok(undefined);
}

export async function markMediaFailed(db: D1Database, id: number): Promise<Result<void>> {
  const result = await db
    .prepare(`UPDATE media SET processing_status = 'failed', updated_at = ? WHERE id = ?`)
    .bind(nowMs(), id)
    .run();
  if (result.meta.changes === 0) return fail("NOT_FOUND", `media #${id} not found`);
  return ok(undefined);
}

/**
 * Trash (soft delete). Does NOT block on usage — see `getMediaUsage`
 * below. Warning the admin before trashing a referenced media is a CMS
 * UI concern (a future brief); this layer only exposes the reference
 * count so that UI can make the call. Hard deletion, by contrast, IS
 * blocked at the database level (FK RESTRICT, migrations/0001_initial.sql)
 * — this repository does not expose a hard-delete function at all.
 */
export async function softDeleteMedia(db: D1Database, id: number): Promise<Result<void>> {
  const result = await db
    .prepare(`UPDATE media SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
    .bind(nowMs(), nowMs(), id)
    .run();
  if (result.meta.changes === 0) return fail("NOT_FOUND", `media #${id} not found or already deleted`);
  return ok(undefined);
}

export async function restoreMedia(db: D1Database, id: number): Promise<Result<void>> {
  const result = await db
    .prepare(`UPDATE media SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL`)
    .bind(nowMs(), id)
    .run();
  if (result.meta.changes === 0) return fail("NOT_FOUND", `media #${id} not found or not deleted`);
  return ok(undefined);
}

export interface MediaUsage {
  table: string;
  column: string;
  count: number;
}

/** How many rows across the schema reference this media — used by the CMS to warn before trashing, and to explain why a hard delete would be RESTRICTed. */
export async function getMediaUsage(db: D1Database, id: number): Promise<MediaUsage[]> {
  const references: [string, string][] = [
    ["work_items", "media_id"],
    ["services", "media_id"],
    ["testimonials", "photo_media_id"],
    ["home_content", "hero_media_id"],
    ["home_content", "editorial_media_id"],
    ["home_content", "about_preview_media_id"],
    ["about_content", "hero_media_id"],
    ["about_content", "breathing_media_id"],
    ["about_content", "human_note_media_id"],
    ["page_seo", "og_media_id"],
  ];
  const statements = references.map(([table, column]) =>
    db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).bind(id),
  );
  const results = await db.batch<{ count: number }>(statements);
  return references.map(([table, column], i) => ({
    table,
    column,
    count: results[i].results[0].count,
  }));
}
