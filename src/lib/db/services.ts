/**
 * Services repository. Started as exactly 3 MVP rows (Mariages/Portraits/
 * Événements) but the CMS module built on top of this (Services CMS
 * brief) allows creating more — nothing here caps the row count. No
 * `layout` column at all regardless (ADR-014): the visual composition is
 * a frontend decision keyed off `slug` (see src/lib/service-layout.ts),
 * never CMS-editable content.
 */
import type { Locale, Result, ServiceFeatureRow, ServiceRow } from "./types";
import { fail, ok } from "./types";
import {
  createDraftFromPublished,
  createNewDraft,
  deleteDraft,
  getDraftOf,
  publishDraft,
  replaceDraftChildren,
  setLanguageStatus,
  updateDraft,
  type ChildTableConfig,
  type PublishableConfig,
} from "./publish";
import { getMedia } from "./media";

const TABLE = "services";

const FEATURES_CHILD: ChildTableConfig = {
  table: "service_features",
  parentColumn: "service_id",
  copyColumns: ["position", "text_fr", "text_en"],
};

const CONFIG: PublishableConfig = {
  table: TABLE,
  copyColumns: [
    "slug",
    "title_fr",
    "title_en",
    "tagline_fr",
    "tagline_en",
    "description_fr",
    "description_en",
    "media_id",
    "ratio",
    "image_alt_fr",
    "image_alt_en",
    "cta_label_fr",
    "cta_label_en",
    "position",
    "is_active",
  ],
  children: [FEATURES_CHILD],
};

export interface ServiceWithFeatures extends ServiceRow {
  features: ServiceFeatureRow[];
}

async function attachFeatures(db: D1Database, services: ServiceRow[]): Promise<ServiceWithFeatures[]> {
  if (services.length === 0) return [];
  const placeholders = services.map(() => "?").join(", ");
  const { results } = await db
    .prepare(`SELECT * FROM service_features WHERE service_id IN (${placeholders}) ORDER BY service_id, position`)
    .bind(...services.map((s) => s.id))
    .all<ServiceFeatureRow>();
  const byService = new Map<number, ServiceFeatureRow[]>();
  for (const f of results) {
    if (!byService.has(f.service_id)) byService.set(f.service_id, []);
    byService.get(f.service_id)!.push(f);
  }
  return services.map((s) => ({ ...s, features: byService.get(s.id) ?? [] }));
}

/** Public read: the 3 (or fewer, if one is inactive) services this locale can show, features included. */
export async function listPublishedServices(db: D1Database, locale: Locale): Promise<ServiceWithFeatures[]> {
  const statusCol = `${locale}_status`;
  const { results } = await db
    .prepare(
      `SELECT * FROM services WHERE status = 'published' AND ${statusCol} = 'published' AND is_active = 1 ORDER BY position`,
    )
    .all<ServiceRow>();
  return attachFeatures(db, results);
}

export async function listAllServices(db: D1Database): Promise<ServiceRow[]> {
  const { results } = await db.prepare(`SELECT * FROM services ORDER BY position, id`).all<ServiceRow>();
  return results;
}

export async function getService(db: D1Database, id: number): Promise<ServiceWithFeatures | null> {
  const row = await db.prepare(`SELECT * FROM services WHERE id = ?`).bind(id).first<ServiceRow>();
  if (!row) return null;
  const [withFeatures] = await attachFeatures(db, [row]);
  return withFeatures;
}

/** Admin edit page's "open the existing draft, or offer to create one" read — same role as getWorkItemDraft. */
export async function getServiceDraft(db: D1Database, publishedId: number): Promise<ServiceWithFeatures | null> {
  const draft = (await getDraftOf(db, TABLE, publishedId)) as ServiceRow | null;
  if (!draft) return null;
  const [withFeatures] = await attachFeatures(db, [draft]);
  return withFeatures;
}

/**
 * Public media route's authorization check (src/lib/public-media.ts),
 * services' side of the same trust boundary isMediaUsedByPublicWorkItem
 * enforces for Travail — true only if this media is the current
 * `media_id` of a service that is actually live somewhere public right
 * now.
 */
export async function isMediaUsedByPublicService(db: D1Database, mediaId: number): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM services WHERE media_id = ? AND status = 'published' AND is_active = 1 AND (fr_status = 'published' OR en_status = 'published') LIMIT 1`,
    )
    .bind(mediaId)
    .first();
  return row !== null;
}

export interface ServiceInput {
  slug: string;
  titleFr: string;
  titleEn: string;
  taglineFr?: string | null;
  taglineEn?: string | null;
  descriptionFr: string;
  descriptionEn: string;
  mediaId: number;
  ratio: string;
  imageAltFr: string;
  imageAltEn: string;
  ctaLabelFr: string;
  ctaLabelEn: string;
  position: number;
  isActive?: boolean;
}

export interface ServiceFeatureInput {
  position: number;
  textFr: string;
  textEn: string;
}

function toRow(input: ServiceInput): Record<string, unknown> {
  return {
    slug: input.slug,
    title_fr: input.titleFr,
    title_en: input.titleEn,
    tagline_fr: input.taglineFr ?? null,
    tagline_en: input.taglineEn ?? null,
    description_fr: input.descriptionFr,
    description_en: input.descriptionEn,
    media_id: input.mediaId,
    ratio: input.ratio,
    image_alt_fr: input.imageAltFr,
    image_alt_en: input.imageAltEn,
    cta_label_fr: input.ctaLabelFr,
    cta_label_en: input.ctaLabelEn,
    position: input.position,
    is_active: input.isActive === false ? 0 : 1,
  };
}

function featureRows(features: ServiceFeatureInput[]): Record<string, unknown>[] {
  return features.map((f) => ({ position: f.position, text_fr: f.textFr, text_en: f.textEn }));
}

export async function createService(
  db: D1Database,
  input: ServiceInput,
  features: ServiceFeatureInput[],
  createdBy?: string,
): Promise<Result<{ draftId: number }>> {
  return createNewDraft(
    db,
    CONFIG,
    toRow(input),
    { service_features: featureRows(features) },
    createdBy,
  );
}

export async function createServiceDraft(
  db: D1Database,
  publishedId: number,
  updatedBy?: string,
): Promise<Result<{ draftId: number }>> {
  return createDraftFromPublished(db, CONFIG, publishedId, updatedBy);
}

export async function updateServiceDraft(
  db: D1Database,
  draftId: number,
  input: Partial<ServiceInput>,
  updatedBy?: string,
): Promise<Result<void>> {
  const fields: Record<string, unknown> = {};
  if (input.slug !== undefined) fields.slug = input.slug;
  if (input.titleFr !== undefined) fields.title_fr = input.titleFr;
  if (input.titleEn !== undefined) fields.title_en = input.titleEn;
  if (input.taglineFr !== undefined) fields.tagline_fr = input.taglineFr;
  if (input.taglineEn !== undefined) fields.tagline_en = input.taglineEn;
  if (input.descriptionFr !== undefined) fields.description_fr = input.descriptionFr;
  if (input.descriptionEn !== undefined) fields.description_en = input.descriptionEn;
  if (input.mediaId !== undefined) fields.media_id = input.mediaId;
  if (input.ratio !== undefined) fields.ratio = input.ratio;
  if (input.imageAltFr !== undefined) fields.image_alt_fr = input.imageAltFr;
  if (input.imageAltEn !== undefined) fields.image_alt_en = input.imageAltEn;
  if (input.ctaLabelFr !== undefined) fields.cta_label_fr = input.ctaLabelFr;
  if (input.ctaLabelEn !== undefined) fields.cta_label_en = input.ctaLabelEn;
  if (input.position !== undefined) fields.position = input.position;
  if (input.isActive !== undefined) fields.is_active = input.isActive ? 1 : 0;
  return updateDraft(db, TABLE, draftId, fields, updatedBy);
}

/** Replaces a draft's features wholesale — does not touch the published row's features until publish. */
export async function updateServiceDraftFeatures(
  db: D1Database,
  draftId: number,
  features: ServiceFeatureInput[],
): Promise<void> {
  return replaceDraftChildren(db, FEATURES_CHILD, draftId, featureRows(features));
}

export async function deleteServiceDraft(db: D1Database, draftId: number): Promise<Result<void>> {
  return deleteDraft(db, TABLE, draftId);
}

/**
 * Publication-rights preflight (migration 0004 extends ADR-011's guard to
 * services, same pattern as CMS Work Patch 013A's publishWorkItem — see
 * that function's header comment for the full reasoning). Only blocks
 * when the merge would make an unrighted media visible: a brand-new
 * service (no live language yet) may still be published/curated freely.
 */
export async function publishService(
  db: D1Database,
  draftId: number,
  updatedBy?: string,
): Promise<Result<{ publishedId: number }>> {
  return publishDraft(db, CONFIG, draftId, {
    updatedBy,
    preflight: async (draft) => {
      const publishedId = draft.draft_of_id as number | null;
      if (publishedId === null) return null;

      const published = await db
        .prepare(`SELECT fr_status, en_status FROM services WHERE id = ?`)
        .bind(publishedId)
        .first<{ fr_status: string; en_status: string }>();
      if (!published) return null;

      const anyLanguageLive = published.fr_status === "published" || published.en_status === "published";
      if (!anyLanguageLive) return null;

      const media = await getMedia(db, draft.media_id as number);
      if (!media || media.publication_rights_confirmed !== 1) {
        return {
          code: "PUBLICATION_RIGHTS_REQUIRED",
          message: `service #${publishedId}: this row has a live language — the draft's media publication rights must be confirmed before publishing`,
        };
      }
      return null;
    },
  });
}

/** Same rights preflight as publishService — the D1 trigger (migrations/0004_services_cms.sql) remains the last line of defense regardless. */
export async function setServiceLanguageStatus(
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
          message: `service #${id}: referenced media publication rights are not confirmed`,
        };
      }
      return null;
    },
  });
}

export interface ReorderServiceDraftResult {
  publishedId: number;
  draftId: number;
}

/** Draft-safe reordering — same pattern as reorderWorkItemDrafts (Review 011A): never writes position directly onto a published row, see that function's header comment for the full reasoning (including the documented non-atomicity across items). */
export async function reorderServiceDrafts(
  db: D1Database,
  orderedPublishedIds: number[],
  updatedBy?: string,
): Promise<Result<ReorderServiceDraftResult[]>> {
  if (orderedPublishedIds.length === 0) return ok([]);

  const placeholders = orderedPublishedIds.map(() => "?").join(", ");
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS count FROM services WHERE id IN (${placeholders}) AND status = 'published'`)
    .bind(...orderedPublishedIds)
    .first<{ count: number }>();
  if (!countRow || countRow.count !== orderedPublishedIds.length) {
    return fail("NOT_FOUND", "one or more service ids are not published rows");
  }

  const results: ReorderServiceDraftResult[] = [];
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
