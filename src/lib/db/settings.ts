/**
 * Site settings — a single typed row (`id = 1`), no key/value table (see
 * docs/DATA_ARCHITECTURE.md "Site settings"). No draft mechanism: the
 * validated schema (migrations/0001_initial.sql) gives `site_settings` no
 * `status`/`draft_of_id` columns at all, so this repository updates it
 * directly (Brief 011 §28 — not required to invent one, and not
 * inventing one silently: these fields — brand name, contact email,
 * Instagram, default SEO copy — are low-risk, infrequently-changed
 * configuration, not actively-edited prose; flagged explicitly in
 * IMPLEMENTATION REPORT 011 rather than assumed).
 */
import type { Result, SiteSettingsRow } from "./types";
import { fail, ok } from "./types";
import { nowMs } from "./mappers";

export async function getSiteSettings(db: D1Database): Promise<SiteSettingsRow | null> {
  const row = await db.prepare(`SELECT * FROM site_settings WHERE id = 1`).first<SiteSettingsRow>();
  return row ?? null;
}

export interface SiteSettingsInput {
  brandName?: string;
  contactEmail?: string;
  instagramUrl?: string;
  instagramHandleLabel?: string;
  serviceAreaFr?: string | null;
  serviceAreaEn?: string | null;
  defaultSeoTitleFr?: string;
  defaultSeoTitleEn?: string;
  defaultSeoDescriptionFr?: string;
  defaultSeoDescriptionEn?: string;
}

export async function updateSiteSettings(
  db: D1Database,
  input: SiteSettingsInput,
  updatedBy?: string,
): Promise<Result<void>> {
  const fields: Record<string, unknown> = {};
  if (input.brandName !== undefined) fields.brand_name = input.brandName;
  if (input.contactEmail !== undefined) fields.contact_email = input.contactEmail;
  if (input.instagramUrl !== undefined) fields.instagram_url = input.instagramUrl;
  if (input.instagramHandleLabel !== undefined) fields.instagram_handle_label = input.instagramHandleLabel;
  if (input.serviceAreaFr !== undefined) fields.service_area_fr = input.serviceAreaFr;
  if (input.serviceAreaEn !== undefined) fields.service_area_en = input.serviceAreaEn;
  if (input.defaultSeoTitleFr !== undefined) fields.default_seo_title_fr = input.defaultSeoTitleFr;
  if (input.defaultSeoTitleEn !== undefined) fields.default_seo_title_en = input.defaultSeoTitleEn;
  if (input.defaultSeoDescriptionFr !== undefined) fields.default_seo_description_fr = input.defaultSeoDescriptionFr;
  if (input.defaultSeoDescriptionEn !== undefined) fields.default_seo_description_en = input.defaultSeoDescriptionEn;

  const columns = Object.keys(fields);
  if (columns.length === 0) return ok(undefined);

  const result = await db
    .prepare(`UPDATE site_settings SET ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE id = 1`)
    .bind(...columns.map((c) => fields[c]), nowMs(), updatedBy ?? null)
    .run();
  if (result.meta.changes === 0) return fail("NOT_FOUND", "site_settings row (id=1) not found — seed missing?");
  return ok(undefined);
}
