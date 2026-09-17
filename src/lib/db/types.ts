/**
 * Data Access Layer — shared types (Implementation Brief 011).
 *
 * Row types below mirror `migrations/0001_initial.sql` column-for-column,
 * in D1's own shape: booleans are 0/1 INTEGER, timestamps are Unix
 * milliseconds INTEGER, nullable columns are `| null` (D1 never returns
 * `undefined`). This is deliberate — see docs/DATA_ARCHITECTURE.md "DAL
 * conventions": one canonical shape per table, no separate
 * Row/PublicView pair for every entity. Callers that need a boolean or a
 * locale-resolved field use the small helpers in `mappers.ts` at the call
 * site, not a second parallel type.
 */

export type Locale = "fr" | "en";

// ---------------------------------------------------------------------------
// Result convention (Brief 011 §26): a discriminated union, not thrown
// exceptions, for every EXPECTED business outcome (not found, draft
// already exists, rights not confirmed, ...). A raw D1/SQL error
// (constraint violation the app layer failed to pre-check, a network
// error) is still allowed to throw — those are unexpected, not part of
// normal control flow, and the caller has no meaningful recovery for them
// beyond logging. See docs/DATA_ARCHITECTURE.md "DAL error model".
// ---------------------------------------------------------------------------
export type Result<T, E = DbError> = { ok: true; data: T } | { ok: false; error: E };

export type DbErrorCode =
  | "NOT_FOUND"
  | "DRAFT_ALREADY_EXISTS"
  | "NO_DRAFT"
  | "PUBLICATION_RIGHTS_REQUIRED"
  | "INVALID_STATE"
  | "VALIDATION_FAILED"
  | "MEDIA_IN_USE";

export interface DbError {
  code: DbErrorCode;
  message: string;
}

export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function fail(code: DbErrorCode, message: string): Result<never, DbError> {
  return { ok: false, error: { code, message } };
}

// ---------------------------------------------------------------------------
// Row-level status columns shared by every table in `PublishableTable`
// (ADR-013). `status` says whether THIS row is the live published row or
// a pending draft shadow (`draft_of_id` points at its published parent
// when it is). `fr_status`/`en_status` are a separate, simpler lever —
// see publish.ts header comment — meaningful only on the published row.
// ---------------------------------------------------------------------------
export type RowStatus = "draft" | "published";
export type LanguageStatus = "draft" | "published" | "archived";
/** home_content and the other 4 page-content tables never use 'archived'. */
export type PageLanguageStatus = "draft" | "published";

export interface Publishable {
  id: number;
  status: RowStatus;
  draft_of_id: number | null;
}

// ---------------------------------------------------------------------------
// MEDIA
// ---------------------------------------------------------------------------
export interface MediaRow {
  id: number;
  storage_key: string;
  original_filename: string | null;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  media_type: "image";
  alt_fr: string | null;
  alt_en: string | null;
  focal_x: number;
  focal_y: number;
  processing_status: "pending" | "uploaded" | "ready" | "failed" | "abandoned";
  publication_rights_confirmed: 0 | 1;
  publication_rights_note: string | null;
  publication_rights_confirmed_at: number | null;
  /**
   * Provisional (equal to `authorized_at`) until `processing_status` is
   * 'uploaded' or 'ready' — only trustworthy as a real confirmation from
   * that point on. See docs/decisions/ADR-017-r2-direct-upload-lifecycle.md.
   */
  uploaded_at: number;
  /** When the row was created / the upload was authorized — unambiguous in every state, unlike `uploaded_at` (Brief 014, ADR-017). */
  authorized_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  created_by: string | null;
  updated_by: string | null;
}

// ---------------------------------------------------------------------------
// WORK ITEMS
// ---------------------------------------------------------------------------
export interface WorkItemRow extends Publishable {
  media_id: number;
  category: "wedding" | "portrait" | "event" | null;
  position: number;
  ratio: string;
  caption_fr: string | null;
  caption_en: string | null;
  alt_fr: string;
  alt_en: string;
  focal_x: number;
  focal_y: number;
  is_visible: 0 | 1;
  featured_on_home: 0 | 1;
  fr_status: LanguageStatus;
  en_status: LanguageStatus;
  fr_published_at: number | null;
  en_published_at: number | null;
  created_at: number;
  updated_at: number;
  created_by: string | null;
  updated_by: string | null;
}

// ---------------------------------------------------------------------------
// SERVICES
// ---------------------------------------------------------------------------
export interface ServiceRow extends Publishable {
  slug: string;
  title_fr: string;
  title_en: string;
  tagline_fr: string | null;
  tagline_en: string | null;
  description_fr: string;
  description_en: string;
  media_id: number;
  ratio: string;
  image_alt_fr: string;
  image_alt_en: string;
  cta_label_fr: string;
  cta_label_en: string;
  position: number;
  is_active: 0 | 1;
  fr_status: LanguageStatus;
  en_status: LanguageStatus;
  fr_published_at: number | null;
  en_published_at: number | null;
  created_at: number;
  updated_at: number;
  created_by: string | null;
  updated_by: string | null;
}

export interface ServiceFeatureRow {
  id: number;
  service_id: number;
  position: number;
  text_fr: string;
  text_en: string;
}

// ---------------------------------------------------------------------------
// TESTIMONIALS
// ---------------------------------------------------------------------------
export interface TestimonialRow extends Publishable {
  author_name: string;
  quote_fr: string;
  quote_en: string;
  role_context_fr: string | null;
  role_context_en: string | null;
  photo_media_id: number | null;
  position: number;
  is_visible: 0 | 1;
  fr_status: LanguageStatus;
  en_status: LanguageStatus;
  fr_published_at: number | null;
  en_published_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  created_by: string | null;
  updated_by: string | null;
}

// ---------------------------------------------------------------------------
// PAGE CONTENT
// ---------------------------------------------------------------------------
export interface HomeContentRow extends Publishable {
  hero_headline_fr: string;
  hero_headline_en: string;
  hero_subline_fr: string;
  hero_subline_en: string;
  hero_media_id: number;
  hero_image_alt_fr: string;
  hero_image_alt_en: string;
  work_preview_label_fr: string;
  work_preview_label_en: string;
  work_preview_link_label_fr: string;
  work_preview_link_label_en: string;
  brand_statement_fr: string;
  brand_statement_en: string;
  services_preview_label_fr: string;
  services_preview_label_en: string;
  editorial_media_id: number | null;
  editorial_image_alt_fr: string | null;
  editorial_image_alt_en: string | null;
  about_preview_label_fr: string;
  about_preview_label_en: string;
  about_preview_text_fr: string;
  about_preview_text_en: string;
  about_preview_media_id: number | null;
  about_preview_image_alt_fr: string | null;
  about_preview_image_alt_en: string | null;
  final_cta_headline_fr: string;
  final_cta_headline_en: string;
  work_preview_visible: 0 | 1;
  brand_statement_visible: 0 | 1;
  services_preview_visible: 0 | 1;
  editorial_visible: 0 | 1;
  about_preview_visible: 0 | 1;
  fr_status: PageLanguageStatus;
  en_status: PageLanguageStatus;
  fr_published_at: number | null;
  en_published_at: number | null;
  created_at: number;
  updated_at: number;
  created_by: string | null;
  updated_by: string | null;
}

export type WorkGalleryLayout = "editorial" | "story" | "minimal";

export interface WorkPageContentRow extends Publishable {
  title_fr: string;
  title_en: string;
  intro_fr: string;
  intro_en: string;
  cta_headline_fr: string;
  cta_headline_en: string;
  /** Admin-selected composition identifier (migrations/0006) — see docs/decisions/ADR-014's addendum. The definition of each layout stays in src/lib/work-gallery-layouts.ts, never here. */
  gallery_layout: WorkGalleryLayout;
  fr_status: PageLanguageStatus;
  en_status: PageLanguageStatus;
  fr_published_at: number | null;
  en_published_at: number | null;
  created_at: number;
  updated_at: number;
  created_by: string | null;
  updated_by: string | null;
}

export interface ServicesPageContentRow extends Publishable {
  title_fr: string;
  title_en: string;
  intro_fr: string;
  intro_en: string;
  approach_label_fr: string;
  approach_label_en: string;
  cta_headline_fr: string;
  cta_headline_en: string;
  fr_status: PageLanguageStatus;
  en_status: PageLanguageStatus;
  fr_published_at: number | null;
  en_published_at: number | null;
  created_at: number;
  updated_at: number;
  created_by: string | null;
  updated_by: string | null;
}

export interface ServicesApproachStepRow {
  id: number;
  services_page_id: number;
  position: number;
  title_fr: string;
  title_en: string;
  text_fr: string;
  text_en: string;
}

export interface AboutContentRow extends Publishable {
  hero_title_fr: string;
  hero_title_en: string;
  hero_intro_fr: string;
  hero_intro_en: string;
  hero_media_id: number;
  hero_ratio: string;
  hero_image_alt_fr: string;
  hero_image_alt_en: string;
  story_label_fr: string;
  story_label_en: string;
  approach_label_fr: string;
  approach_label_en: string;
  breathing_media_id: number | null;
  breathing_ratio: string | null;
  breathing_image_alt_fr: string | null;
  breathing_image_alt_en: string | null;
  human_note_text_fr: string;
  human_note_text_en: string;
  human_note_media_id: number | null;
  human_note_ratio: string | null;
  human_note_image_alt_fr: string | null;
  human_note_image_alt_en: string | null;
  final_cta_headline_fr: string;
  final_cta_headline_en: string;
  fr_status: PageLanguageStatus;
  en_status: PageLanguageStatus;
  fr_published_at: number | null;
  en_published_at: number | null;
  created_at: number;
  updated_at: number;
  created_by: string | null;
  updated_by: string | null;
}

export interface AboutStoryParagraphRow {
  id: number;
  about_id: number;
  position: number;
  text_fr: string;
  text_en: string;
}

export interface AboutApproachItemRow {
  id: number;
  about_id: number;
  position: number;
  word_fr: string;
  word_en: string;
  text_fr: string;
  text_en: string;
}

export interface ContactContentRow extends Publishable {
  hero_title_fr: string;
  hero_title_en: string;
  hero_subtext_fr: string;
  hero_subtext_en: string;
  details_label_fr: string;
  details_label_en: string;
  closing_note_fr: string;
  closing_note_en: string;
  fr_status: PageLanguageStatus;
  en_status: PageLanguageStatus;
  fr_published_at: number | null;
  en_published_at: number | null;
  created_at: number;
  updated_at: number;
  created_by: string | null;
  updated_by: string | null;
}

// ---------------------------------------------------------------------------
// SITE SETTINGS / SEO / SNAPSHOTS
// ---------------------------------------------------------------------------
export interface SiteSettingsRow {
  id: 1;
  brand_name: string;
  contact_email: string;
  instagram_url: string;
  instagram_handle_label: string;
  service_area_fr: string | null;
  service_area_en: string | null;
  default_seo_title_fr: string;
  default_seo_title_en: string;
  default_seo_description_fr: string;
  default_seo_description_en: string;
  updated_at: number;
  updated_by: string | null;
}

export type PageKey = "home" | "work" | "services" | "about" | "contact" | "privacy";

export interface PageSeoRow {
  page_key: PageKey;
  title_fr: string;
  title_en: string;
  description_fr: string;
  description_en: string;
  og_media_id: number | null;
  canonical_override: string | null;
  noindex: 0 | 1;
  updated_at: number;
  updated_by: string | null;
}

export type SnapshotEntityType =
  | "work_item"
  | "service"
  | "testimonial"
  | "home_content"
  | "work_page_content"
  | "services_page_content"
  | "about_content"
  | "contact_content";

export interface ContentSnapshotRow {
  id: number;
  entity_type: SnapshotEntityType;
  entity_key: string;
  language: "fr" | "en" | "both";
  snapshot_json: string;
  created_at: number;
  created_by: string | null;
}
