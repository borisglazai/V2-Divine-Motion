-- ============================================================================
-- Divine Motion V2 — 0006_visual_editor_phase2.sql
-- ============================================================================
-- Éditeur visuel Phase 2 (Travail / À propos / Contact). Two independent
-- additions, bundled in one migration because they land in the same
-- brief — see the two sections below for why each is here and why
-- neither needed its own migration file.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. work_page_content.gallery_layout — the admin's EXPLICIT choice of
--    which of the 3 named portfolio compositions (Editorial/Story/Minimal)
--    is currently active. This is content, not presentation: ADR-014 bars
--    a `layout` column because it would encode a decision the admin has
--    no right to change (per-image full/centered/duo, still 100% frontend
--    -computed, untouched by this column). Here the admin explicitly
--    picks the composition — by ADR-014's own reasoning ("une donnée que
--    l'admin n'a explicitement pas le droit de changer n'a pas besoin de
--    vivre dans la base de contenu"), a value the admin DOES have the
--    right to change belongs in content. The column stores only WHICH
--    named template is selected — an identifier, exactly like
--    `hero_media_id` points at a media row without dictating that row's
--    internal structure. The templates themselves (slot sequences, block
--    types, CSS) stay entirely in src/lib/work-gallery-layouts.ts and
--    WorkGallery.astro — never in D1, never admin-editable at that level.
--    See docs/decisions/ADR-014-work-services-presentation-ownership.md's
--    addendum for the full reasoning, confirmed with Boris before this
--    migration was written.
-- ----------------------------------------------------------------------------
ALTER TABLE work_page_content
  ADD COLUMN gallery_layout TEXT NOT NULL DEFAULT 'editorial'
    CHECK (gallery_layout IN ('editorial', 'story', 'minimal'));

-- ----------------------------------------------------------------------------
-- 2. about_content publication-rights gate — same real gap `home_content`
--    had before migration 0005: `about_content` has three media
--    references (`hero_media_id` NOT NULL, `breathing_media_id` and
--    `human_note_media_id` both nullable) but has never had a real admin
--    publish path (Phase 1 explicitly left it "audit only" —
--    docs/CMS_SPEC.md), so grep across migrations/*.sql before this file
--    confirms zero `trg_about_content_*` trigger existed. Phase 2 gives
--    `about_content` a real publish path (`/admin/site/a-propos`), so
--    this closes the gap now, exact same 5-trigger shape as 0005 (2
--    language-status triggers checking all 3 media fields' rights + 3
--    media-change guards, one per media column) — including for
--    breathing/human_note media even though this phase's admin UI does
--    not expose editing them yet (same reasoning 0005 used for
--    editorial_media_id/about_preview_media_id on home_content: close
--    the whole class of gap once, not field-by-field as each gets wired).
--    `contact_content` has no media columns — nothing to gate there.
-- ----------------------------------------------------------------------------
CREATE TRIGGER trg_about_content_rights_gate_fr
BEFORE UPDATE OF fr_status ON about_content
WHEN NEW.fr_status = 'published'
  AND (
    (SELECT publication_rights_confirmed FROM media WHERE id = NEW.hero_media_id) = 0
    OR (NEW.breathing_media_id IS NOT NULL AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.breathing_media_id) = 0)
    OR (NEW.human_note_media_id IS NOT NULL AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.human_note_media_id) = 0)
  )
BEGIN
  SELECT RAISE(ABORT, 'about_content: cannot publish FR — one or more referenced media publication rights not confirmed');
END;

CREATE TRIGGER trg_about_content_rights_gate_en
BEFORE UPDATE OF en_status ON about_content
WHEN NEW.en_status = 'published'
  AND (
    (SELECT publication_rights_confirmed FROM media WHERE id = NEW.hero_media_id) = 0
    OR (NEW.breathing_media_id IS NOT NULL AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.breathing_media_id) = 0)
    OR (NEW.human_note_media_id IS NOT NULL AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.human_note_media_id) = 0)
  )
BEGIN
  SELECT RAISE(ABORT, 'about_content: cannot publish EN — one or more referenced media publication rights not confirmed');
END;

CREATE TRIGGER trg_about_content_rights_gate_hero_media_change
BEFORE UPDATE OF hero_media_id ON about_content
WHEN NEW.status = 'published'
  AND (NEW.fr_status = 'published' OR NEW.en_status = 'published')
  AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.hero_media_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'about_content: cannot change hero media on a row with a live language — new media publication rights not confirmed');
END;

CREATE TRIGGER trg_about_content_rights_gate_breathing_media_change
BEFORE UPDATE OF breathing_media_id ON about_content
WHEN NEW.status = 'published'
  AND (NEW.fr_status = 'published' OR NEW.en_status = 'published')
  AND NEW.breathing_media_id IS NOT NULL
  AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.breathing_media_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'about_content: cannot change breathing media on a row with a live language — new media publication rights not confirmed');
END;

CREATE TRIGGER trg_about_content_rights_gate_human_note_media_change
BEFORE UPDATE OF human_note_media_id ON about_content
WHEN NEW.status = 'published'
  AND (NEW.fr_status = 'published' OR NEW.en_status = 'published')
  AND NEW.human_note_media_id IS NOT NULL
  AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.human_note_media_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'about_content: cannot change human-note media on a row with a live language — new media publication rights not confirmed');
END;
