/**
 * SEO — one row per known page (`page_key`), FR/EN columns, no draft
 * mechanism (same reasoning as settings.ts: `page_seo` has no
 * `status`/`draft_of_id` columns in the validated schema). Deliberately
 * simple — no SEO "engine", just get/update per page.
 */
import type { PageKey, PageSeoRow, Result } from "./types";
import { fail, ok } from "./types";
import { nowMs } from "./mappers";

export async function getPageSeo(db: D1Database, pageKey: PageKey): Promise<PageSeoRow | null> {
  const row = await db.prepare(`SELECT * FROM page_seo WHERE page_key = ?`).bind(pageKey).first<PageSeoRow>();
  return row ?? null;
}

export async function listPageSeo(db: D1Database): Promise<PageSeoRow[]> {
  const { results } = await db.prepare(`SELECT * FROM page_seo ORDER BY page_key`).all<PageSeoRow>();
  return results;
}

export interface PageSeoInput {
  titleFr?: string;
  titleEn?: string;
  descriptionFr?: string;
  descriptionEn?: string;
  ogMediaId?: number | null;
  canonicalOverride?: string | null;
  noindex?: boolean;
}

export async function updatePageSeo(
  db: D1Database,
  pageKey: PageKey,
  input: PageSeoInput,
  updatedBy?: string,
): Promise<Result<void>> {
  const fields: Record<string, unknown> = {};
  if (input.titleFr !== undefined) fields.title_fr = input.titleFr;
  if (input.titleEn !== undefined) fields.title_en = input.titleEn;
  if (input.descriptionFr !== undefined) fields.description_fr = input.descriptionFr;
  if (input.descriptionEn !== undefined) fields.description_en = input.descriptionEn;
  if (input.ogMediaId !== undefined) fields.og_media_id = input.ogMediaId;
  if (input.canonicalOverride !== undefined) fields.canonical_override = input.canonicalOverride;
  if (input.noindex !== undefined) fields.noindex = input.noindex ? 1 : 0;

  const columns = Object.keys(fields);
  if (columns.length === 0) return ok(undefined);

  const result = await db
    .prepare(`UPDATE page_seo SET ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE page_key = ?`)
    .bind(...columns.map((c) => fields[c]), nowMs(), updatedBy ?? null, pageKey)
    .run();
  if (result.meta.changes === 0) return fail("NOT_FOUND", `page_seo for '${pageKey}' not found`);
  return ok(undefined);
}
