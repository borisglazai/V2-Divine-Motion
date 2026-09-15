/**
 * Work items repository (Travail) — curation only, no layout/composition
 * (ADR-014: that's frontend-only, keyed off position/count/ratio).
 */
import type { Locale, Result, WorkItemRow } from "./types";
import { fail, ok } from "./types";
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

export interface ReorderDraftResult {
  publishedId: number;
  draftId: number;
}

/**
 * Review 011A — REPLACES the earlier `reorderWorkItems`, which wrote
 * `position` directly onto `status='published'` rows. That violated
 * ADR-013/*Save Draft ≠ Publish*: an admin reordering Travail must never
 * change what the public site shows until an explicit Publish. Removed
 * outright rather than reinterpreted under the same name.
 *
 * This version only ever writes to draft shadow rows. For each published
 * id in `orderedPublishedIds`, it reuses that item's existing draft if
 * one is already open, or creates one (`createDraftFromPublished`) if
 * not — reordering is content-adjacent curation, so a missing draft is
 * created rather than the call failing, but nothing is ever published as
 * a side effect: the published rows, and therefore the public site, are
 * untouched by this function under all circumstances.
 *
 * Publishing the new order is a SEPARATE, explicit step per item
 * (`publishWorkItem(db, draftId)` for each id returned here) — see the
 * limitation below before assuming that step is atomic across the whole
 * set.
 *
 * NOT ATOMIC ACROSS ITEMS, documented rather than worked around
 * (Review 011A §1 "STOP and document precisely"): `publishDraft` is
 * atomic per item (one `batch()` — see publish.ts), but publishing N
 * reordered items is N separate calls, hence N separate transactions. A
 * crash between two of them leaves a partially-applied order genuinely
 * visible on the public site (some items already in their new position,
 * others not). Guaranteeing all-or-nothing publication across an
 * arbitrary set of items would need a new primitive this layer
 * deliberately does not build now (e.g. a publish-batch/orchestration
 * table, or extending `db.batch()` usage across multiple tables' rows at
 * once) — that is CMS-level orchestration, explicitly left for the CMS
 * Implementation Brief to design, not invented silently here.
 */
export async function reorderWorkItemDrafts(
  db: D1Database,
  orderedPublishedIds: number[],
  updatedBy?: string,
): Promise<Result<ReorderDraftResult[]>> {
  if (orderedPublishedIds.length === 0) return ok([]);

  const placeholders = orderedPublishedIds.map(() => "?").join(", ");
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS count FROM work_items WHERE id IN (${placeholders}) AND status = 'published'`)
    .bind(...orderedPublishedIds)
    .first<{ count: number }>();
  if (!countRow || countRow.count !== orderedPublishedIds.length) {
    return fail("NOT_FOUND", "one or more work_item ids are not published rows");
  }

  const results: ReorderDraftResult[] = [];
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
