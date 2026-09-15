-- ============================================================================
-- Divine Motion V2 — 0002_publication_rights_media_change_guard.sql
-- ============================================================================
-- CMS Work Patch 013A — closes a gap in the ADR-011 publication-rights
-- invariant: the four triggers in 0001_initial.sql only fire
-- `BEFORE UPDATE OF fr_status`/`en_status`. They do NOT fire when a
-- work_item/testimonial that is already live (fr_status/en_status already
-- 'published') has its referenced media swapped for a different one — the
-- language columns aren't touched by that UPDATE, so those triggers stay
-- silent, and an unrighted media could become publicly visible without ever
-- tripping a fr_status/en_status transition. See docs/decisions/
-- ADR-011-publication-rights-model.md and docs/DATA_ARCHITECTURE.md
-- "Publication rights — media replacement on an already-live row" for the
-- full writeup of the bug and this fix.
--
-- 0001_initial.sql is immutable once applied (see its own header and
-- docs/DEPLOYMENT.md "Migrations — immutabilité") — this is a forward-fix,
-- a new migration, never a retroactive edit of 0001.
--
-- Scope: work_items.media_id and testimonials.photo_media_id only. Every
-- other *_media_id column in the schema (home_content, about_content,
-- page_seo, services.media_id) belongs to entities whose draft/publish
-- CMS module does not exist yet — out of scope for this patch (CMS Work
-- Patch 013A §8: "ne pas construire" anything beyond this exact invariant).
--
-- Trigger scope, deliberately narrow: `AND NEW.status = 'published'` is
-- load-bearing. Without it, this trigger would also fire on
-- `updateWorkItemDraft`'s `UPDATE work_items SET media_id = ? ... WHERE id
-- = ? AND status = 'draft'` — a draft row can carry a stale
-- fr_status/en_status copy from the moment it was branched off its
-- published parent (createDraftFromPublished copies them verbatim; see
-- publish.ts), so without this guard, editing a DRAFT's media selection
-- could be wrongly blocked by a media-rights check that must only ever
-- gate PUBLISHING, never editing a draft (Save Draft =/= Publish, ADR-013).
-- ============================================================================

CREATE TRIGGER trg_work_items_rights_gate_media_change
BEFORE UPDATE OF media_id ON work_items
WHEN NEW.status = 'published'
  AND (NEW.fr_status = 'published' OR NEW.en_status = 'published')
  AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.media_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'work_items: cannot change media on a row with a live language — new media publication rights not confirmed');
END;

CREATE TRIGGER trg_testimonials_rights_gate_media_change
BEFORE UPDATE OF photo_media_id ON testimonials
WHEN NEW.status = 'published'
  AND (NEW.fr_status = 'published' OR NEW.en_status = 'published')
  AND NEW.photo_media_id IS NOT NULL
  AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.photo_media_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'testimonials: cannot change photo on a row with a live language — new media publication rights not confirmed');
END;
