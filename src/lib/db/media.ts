/**
 * Media repository — metadata only, still no transformation. Brief 014
 * adds the real R2 upload lifecycle (`processing_status` transitions
 * through 'pending'/'uploaded'/'ready'/'failed'/'abandoned'), but this
 * file never touches R2 itself — that's `src/lib/storage/` (key
 * generation, presigned URLs, object verification), which this file's
 * callers (`src/lib/admin/media-actions.ts`) compose with these DAL
 * functions. `media` is NOT part of the draft/publish mechanism (ADR-013
 * covers `work_items`/`services`/`testimonials`/page content, not `media`
 * itself) — it has its own, simpler lifecycle: `processing_status` and
 * `deleted_at` (trash).
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
 *
 * `authorized_at` is the unambiguous "row created / upload authorized"
 * timestamp (Brief 014, ADR-017). `uploaded_at` is set to the SAME value
 * here — an honest provisional placeholder, not a claim that the upload
 * happened — and is overwritten with the real confirmation timestamp by
 * `markMediaUploaded` once the object is actually confirmed present in R2.
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
      `INSERT INTO media (storage_key, original_filename, mime_type, size_bytes, processing_status, uploaded_at, authorized_at, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      input.storageKey,
      input.originalFilename ?? null,
      input.mimeType,
      input.sizeBytes,
      now,
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

/**
 * `pending -> uploaded`: the server has confirmed (via an R2 HEAD) that
 * the object is actually present — the one moment `uploaded_at` becomes
 * a real, trustworthy timestamp rather than the provisional placeholder
 * `createMediaMetadata` set it to (ADR-017). Called from the
 * `/upload-complete` flow before deeper validation (magic bytes,
 * dimensions) runs.
 */
export async function markMediaUploaded(db: D1Database, id: number): Promise<Result<void>> {
  const now = nowMs();
  const result = await db
    .prepare(
      `UPDATE media SET processing_status = 'uploaded', uploaded_at = ?, updated_at = ? WHERE id = ? AND processing_status = 'pending'`,
    )
    .bind(now, now, id)
    .run();
  if (result.meta.changes === 0) {
    return fail("INVALID_STATE", `media #${id} is not pending`);
  }
  return ok(undefined);
}

/** Post-upload validation succeeded (ADR-006: real MIME/dimensions check happens after the direct R2 upload, before the media is usable). Only reachable from 'uploaded' — the flow always confirms presence (markMediaUploaded) before validating content. */
export async function markMediaReady(
  db: D1Database,
  id: number,
  dimensions: { width: number; height: number },
): Promise<Result<void>> {
  const result = await db
    .prepare(
      `UPDATE media SET processing_status = 'ready', width = ?, height = ?, updated_at = ? WHERE id = ? AND processing_status = 'uploaded'`,
    )
    .bind(dimensions.width, dimensions.height, nowMs(), id)
    .run();
  if (result.meta.changes === 0) {
    return fail("INVALID_STATE", `media #${id} is not uploaded`);
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
 * Cleanup (Brief 014 §18 — "une fonction cleanup réutilisable suffit", no
 * Cron Trigger in this brief): marks `abandoned` every `pending` row whose
 * `authorized_at` is older than `olderThanMs`. Callable manually, from a
 * future Cron Trigger, or opportunistically before listing the library.
 * Returns the number of rows abandoned.
 */
export async function abandonStalePendingMedia(db: D1Database, olderThanMs: number): Promise<number> {
  const cutoff = nowMs() - olderThanMs;
  const result = await db
    .prepare(
      `UPDATE media SET processing_status = 'abandoned', updated_at = ? WHERE processing_status = 'pending' AND authorized_at < ?`,
    )
    .bind(nowMs(), cutoff)
    .run();
  return result.meta.changes;
}

/**
 * Trash (soft delete). Review 011A: blocks with `MEDIA_IN_USE` — and
 * writes nothing — if `getMediaUsage` finds any active reference
 * (draft or published; a media referenced only by a draft shadow row is
 * still "in use", since publishing that draft would leave the public
 * site pointing at a trashed file). This is a DAL-level guarantee, not
 * only a CMS UI warning: the reference check runs before the UPDATE, in
 * the same call, so there's no gap a future caller could bypass. Hard
 * deletion, by contrast, is blocked at the database level (FK RESTRICT,
 * migrations/0001_initial.sql) — this repository does not expose a
 * hard-delete function at all.
 */
export async function softDeleteMedia(db: D1Database, id: number): Promise<Result<void>> {
  const usage = await getMediaUsage(db, id);
  const activeReferences = usage.filter((u) => u.count > 0);
  if (activeReferences.length > 0) {
    const detail = activeReferences.map((u) => `${u.table}.${u.column} (${u.count})`).join(", ");
    return fail("MEDIA_IN_USE", `media #${id} is still referenced: ${detail}`);
  }

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

/** How many rows across the schema reference this media — used by `softDeleteMedia` itself to block trashing an in-use media, and kept exported for the future CMS to display the detail (which rows) before an admin even attempts a delete. */
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
