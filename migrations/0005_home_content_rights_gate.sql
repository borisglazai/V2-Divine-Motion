-- ============================================================================
-- Divine Motion V2 — 0005_home_content_rights_gate.sql
-- ============================================================================
-- Éditeur visuel / "Modifier le site" Phase 1. `home_content` (schema
-- since 0001, DAL since Brief 011) has three media references —
-- `hero_media_id` (NOT NULL), `editorial_media_id` and
-- `about_preview_media_id` (both nullable) — but, like `services` before
-- the Services CMS brief, was never added to ADR-011's publication-rights
-- guard: grep across migrations/*.sql before this file confirms zero
-- `trg_home_content_*` trigger existed. Real gap, not a documented
-- exclusion: `home_content` had no real CMS module (hence no real
-- publish path) until this brief made it one. Same pattern as
-- migrations/0004_services_cms.sql, applied to all three media columns —
-- every one of them can become publicly visible the moment a language is
-- published, so every one of them is gated.
--
-- `about_content`/`contact_content` (also media-bearing, also ungated)
-- are deliberately NOT touched here — this brief does not build an admin
-- write path for either (see docs/CMS_SPEC.md "Éditeur visuel Phase 1"),
-- so nothing here makes their existing latent gap any more reachable
-- than it already was. Left for whichever future brief gives them a real
-- publish path, exactly the reasoning ADR-011's Services addendum used.
--
-- 0001-0004 remain immutable — this is a forward-fix, never a
-- retroactive edit.
-- ============================================================================

CREATE TRIGGER trg_home_content_rights_gate_fr
BEFORE UPDATE OF fr_status ON home_content
WHEN NEW.fr_status = 'published'
  AND (
    (SELECT publication_rights_confirmed FROM media WHERE id = NEW.hero_media_id) = 0
    OR (NEW.editorial_media_id IS NOT NULL AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.editorial_media_id) = 0)
    OR (NEW.about_preview_media_id IS NOT NULL AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.about_preview_media_id) = 0)
  )
BEGIN
  SELECT RAISE(ABORT, 'home_content: cannot publish FR — one or more referenced media publication rights not confirmed');
END;

CREATE TRIGGER trg_home_content_rights_gate_en
BEFORE UPDATE OF en_status ON home_content
WHEN NEW.en_status = 'published'
  AND (
    (SELECT publication_rights_confirmed FROM media WHERE id = NEW.hero_media_id) = 0
    OR (NEW.editorial_media_id IS NOT NULL AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.editorial_media_id) = 0)
    OR (NEW.about_preview_media_id IS NOT NULL AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.about_preview_media_id) = 0)
  )
BEGIN
  SELECT RAISE(ABORT, 'home_content: cannot publish EN — one or more referenced media publication rights not confirmed');
END;

CREATE TRIGGER trg_home_content_rights_gate_hero_media_change
BEFORE UPDATE OF hero_media_id ON home_content
WHEN NEW.status = 'published'
  AND (NEW.fr_status = 'published' OR NEW.en_status = 'published')
  AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.hero_media_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'home_content: cannot change hero media on a row with a live language — new media publication rights not confirmed');
END;

CREATE TRIGGER trg_home_content_rights_gate_editorial_media_change
BEFORE UPDATE OF editorial_media_id ON home_content
WHEN NEW.status = 'published'
  AND (NEW.fr_status = 'published' OR NEW.en_status = 'published')
  AND NEW.editorial_media_id IS NOT NULL
  AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.editorial_media_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'home_content: cannot change editorial media on a row with a live language — new media publication rights not confirmed');
END;

CREATE TRIGGER trg_home_content_rights_gate_about_preview_media_change
BEFORE UPDATE OF about_preview_media_id ON home_content
WHEN NEW.status = 'published'
  AND (NEW.fr_status = 'published' OR NEW.en_status = 'published')
  AND NEW.about_preview_media_id IS NOT NULL
  AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.about_preview_media_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'home_content: cannot change about-preview media on a row with a live language — new media publication rights not confirmed');
END;
