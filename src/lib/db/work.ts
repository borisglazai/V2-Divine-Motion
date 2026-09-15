/**
 * Work items repository (Travail) — curation only, no layout/composition
 * (ADR-014: that's frontend-only, keyed off position/count/ratio).
 */
import type { Locale, Result, WorkItemRow } from "./types";
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

const TABLE = "work_items";

/** Columns copied draft -> published on publishDraft — never status/draft_of_id/fr_status/en_status/timestamps (see publish.ts header). */
const CONFIG: PublishableConfig = {
  table: TABLE,
  copyColumns: [
    "media_id",
    "category",
    "position",
    "ratio",
    "caption_fr",
    "caption_en",
    "alt_fr",
    "alt_en",
    "focal_x",
    "focal_y",
    "is_visible",
    "featured_on_home",
  ],
};

/** Public read: only what the Travail page (a given locale) may show. */
export async function listPublishedWorkItems(db: D1Database, locale: Locale): Promise<WorkItemRow[]> {
  const statusCol = `${locale}_status`;
  const { results } = await db
    .prepare(
      `SELECT * FROM work_items WHERE status = 'published' AND ${statusCol} = 'published' AND is_visible = 1 ORDER BY position`,
    )
    .all<WorkItemRow>();
  return results;
}

export async function listFeaturedOnHome(db: D1Database, locale: Locale): Promise<WorkItemRow[]> {
  const statusCol = `${locale}_status`;
  const { results } = await db
    .prepare(
      `SELECT * FROM work_items WHERE status = 'published' AND ${statusCol} = 'published' AND is_visible = 1 AND featured_on_home = 1 ORDER BY position`,
    )
    .all<WorkItemRow>();
  return results;
}

/** Admin read: every row, draft and published, for the future CMS list view. */
export async function listAllWorkItems(db: D1Database): Promise<WorkItemRow[]> {
  const { results } = await db.prepare(`SELECT * FROM work_items ORDER BY position, id`).all<WorkItemRow>();
  return results;
}

export async function getWorkItem(db: D1Database, id: number): Promise<WorkItemRow | null> {
  const row = await db.prepare(`SELECT * FROM work_items WHERE id = ?`).bind(id).first<WorkItemRow>();
  return row ?? null;
}

export interface WorkItemInput {
  mediaId: number;
  category?: "wedding" | "portrait" | "event" | null;
  position: number;
  ratio: string;
  captionFr?: string | null;
  captionEn?: string | null;
  altFr: string;
  altEn: string;
  focalX?: number;
  focalY?: number;
  isVisible?: boolean;
  featuredOnHome?: boolean;
}

function toRow(input: WorkItemInput): Record<string, unknown> {
  return {
    media_id: input.mediaId,
    category: input.category ?? null,
    position: input.position,
    ratio: input.ratio,
    caption_fr: input.captionFr ?? null,
    caption_en: input.captionEn ?? null,
    alt_fr: input.altFr,
    alt_en: input.altEn,
    focal_x: input.focalX ?? 50,
    focal_y: input.focalY ?? 50,
    is_visible: input.isVisible === false ? 0 : 1,
    featured_on_home: input.featuredOnHome ? 1 : 0,
  };
}

export async function createWorkItem(
  db: D1Database,
  input: WorkItemInput,
  createdBy?: string,
): Promise<Result<{ draftId: number }>> {
  if (!input.altFr || !input.altEn) {
    return fail("VALIDATION_FAILED", "altFr and altEn are required (accessibility, never optional)");
  }
  return createNewDraft(db, CONFIG, toRow(input), {}, createdBy);
}

export async function createWorkItemDraft(
  db: D1Database,
  publishedId: number,
  updatedBy?: string,
): Promise<Result<{ draftId: number }>> {
  return createDraftFromPublished(db, CONFIG, publishedId, updatedBy);
}

export async function updateWorkItemDraft(
  db: D1Database,
  draftId: number,
  input: Partial<WorkItemInput>,
  updatedBy?: string,
): Promise<Result<void>> {
  const fields: Record<string, unknown> = {};
  if (input.mediaId !== undefined) fields.media_id = input.mediaId;
  if (input.category !== undefined) fields.category = input.category;
  if (input.position !== undefined) fields.position = input.position;
  if (input.ratio !== undefined) fields.ratio = input.ratio;
  if (input.captionFr !== undefined) fields.caption_fr = input.captionFr;
  if (input.captionEn !== undefined) fields.caption_en = input.captionEn;
  if (input.altFr !== undefined) fields.alt_fr = input.altFr;
  if (input.altEn !== undefined) fields.alt_en = input.altEn;
  if (input.focalX !== undefined) fields.focal_x = input.focalX;
  if (input.focalY !== undefined) fields.focal_y = input.focalY;
  if (input.isVisible !== undefined) fields.is_visible = input.isVisible ? 1 : 0;
  if (input.featuredOnHome !== undefined) fields.featured_on_home = input.featuredOnHome ? 1 : 0;
  return updateDraft(db, TABLE, draftId, fields, updatedBy);
}

export async function deleteWorkItemDraft(db: D1Database, draftId: number): Promise<Result<void>> {
  return deleteDraft(db, TABLE, draftId);
}

/** Copies draft content onto the published row (or promotes a brand-new item). Does not touch fr_status/en_status — see setWorkItemLanguageStatus. */
export async function publishWorkItem(
  db: D1Database,
  draftId: number,
  updatedBy?: string,
): Promise<Result<{ publishedId: number }>> {
  return publishDraft(db, CONFIG, draftId, { updatedBy });
}

/**
 * The independent lever for FR/EN visibility (ADR-011/ADR-013 — see
 * publish.ts header). Pre-checks the referenced media's publication
 * rights before the SQL runs, so the caller gets a clear
 * PUBLICATION_RIGHTS_REQUIRED business error instead of a raw trigger
 * abort — the D1 trigger (migrations/0001_initial.sql) remains the last
 * line of defense regardless.
 */
export async function setWorkItemLanguageStatus(
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
      const media = await getMedia(db, row.media_id as number);
      if (!media || media.publication_rights_confirmed !== 1) {
        return {
          code: "PUBLICATION_RIGHTS_REQUIRED",
          message: `work_item #${id}: referenced media publication rights are not confirmed`,
        };
      }
      return null;
    },
  });
}

/**
 * Reorders a set of already-published items in one atomic write.
 * Deliberately direct (bypasses draft/publish): position is a curation/
 * ordering lever, not prose content — the same category as
 * fr_status/en_status above, not the risky "editing text mid-session"
 * scenario ADR-013 protects against. See docs/DATA_ARCHITECTURE.md "DAL:
 * reorder".
 */
export async function reorderWorkItems(
  db: D1Database,
  orderedIds: number[],
  updatedBy?: string,
): Promise<Result<void>> {
  if (orderedIds.length === 0) return ok(undefined);

  // A 0-row UPDATE is not a SQL error, so `batch()` would silently commit
  // the valid updates in the list even if one id were bad — pre-validate
  // every id exists and is published BEFORE writing anything, so a bad
  // id aborts the whole reorder instead of applying it partially.
  const placeholders = orderedIds.map(() => "?").join(", ");
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS count FROM work_items WHERE id IN (${placeholders}) AND status = 'published'`)
    .bind(...orderedIds)
    .first<{ count: number }>();
  if (!countRow || countRow.count !== orderedIds.length) {
    return fail("NOT_FOUND", "one or more work_item ids are not published rows");
  }

  const now = nowMs();
  const statements = orderedIds.map((id, index) =>
    db
      .prepare(`UPDATE work_items SET position = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
      .bind(index + 1, now, updatedBy ?? null, id),
  );
  await db.batch(statements);
  return ok(undefined);
}
