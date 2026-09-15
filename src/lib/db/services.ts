/**
 * Services repository — exactly 3 MVP rows (Mariages/Portraits/
 * Événements). No `layout` column at all (ADR-014): the three
 * compositions are a frontend decision keyed off `slug`. `service_id` is
 * a stable identifier this repository never invents or changes.
 */
import type { Locale, Result, ServiceFeatureRow, ServiceRow } from "./types";
import {
  createDraftFromPublished,
  createNewDraft,
  deleteDraft,
  publishDraft,
  replaceDraftChildren,
  setLanguageStatus,
  updateDraft,
  type ChildTableConfig,
  type PublishableConfig,
} from "./publish";

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

export interface ServiceInput {
  slug: string;
  titleFr: string;
  titleEn: string;
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

export async function publishService(
  db: D1Database,
  draftId: number,
  updatedBy?: string,
): Promise<Result<{ publishedId: number }>> {
  return publishDraft(db, CONFIG, draftId, { updatedBy });
}

/** No publication-rights gate here (unlike work_items/testimonials) — services aren't in scope of ADR-011's trigger list. */
export async function setServiceLanguageStatus(
  db: D1Database,
  id: number,
  locale: Locale,
  status: "draft" | "published" | "archived",
  updatedBy?: string,
): Promise<Result<void>> {
  return setLanguageStatus(db, TABLE, id, locale, status, { updatedBy });
}
