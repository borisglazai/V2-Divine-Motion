-- ============================================================================
-- Divine Motion V2 — 0004_services_cms.sql
-- ============================================================================
-- Implementation Brief — Services CMS. Turns `services` (schema already
-- present since 0001, DAL already present since Brief 011) into the
-- second real CMS module after Travail. Two additive, non-destructive
-- changes, bundled here because both are required for the same feature
-- and both touch only `services`:
--
-- 1. `tagline_fr`/`tagline_en` — a short localized hook distinct from
--    `title_fr/en` (the service name) and `description_fr/en` (the long
--    body). Neither the original schema nor the pre-CMS mock
--    (src/data/mock/services.ts) had this field; the admin brief asks
--    for it explicitly ("courte accroche"). Nullable: existing/seeded
--    rows get no value backfilled (there is no source of truth to derive
--    one from) rather than a fabricated placeholder string.
--
-- 2. `trg_services_rights_gate_fr/en` + `trg_services_rights_gate_media_change`
--    — services.media_id is NOT NULL (every service requires a main
--    image) but, unlike work_items/testimonials, `services` was never
--    added to ADR-011's publication-rights guard: grep across
--    migrations/*.sql before this file confirms zero `trg_services_*`
--    trigger existed. That was a real gap, not a documented exclusion —
--    ADR-011 itself says the guard applies "at each public usage point",
--    and services had no real CMS module (hence no real publication
--    path) until this brief. These three triggers are the exact same
--    pattern already applied to work_items in 0001_initial.sql and
--    0002_publication_rights_media_change_guard.sql (CMS Work Patch
--    013A) — same WHEN clauses, same RAISE(ABORT, ...) shape, same
--    application-level preflight in src/lib/db/services.ts as the first
--    line of defense (see publishService/setServiceLanguageStatus).
--
-- 0001/0002/0003 remain immutable — this is a forward-fix, never a
-- retroactive edit.
-- ============================================================================

ALTER TABLE services ADD COLUMN tagline_fr TEXT;
ALTER TABLE services ADD COLUMN tagline_en TEXT;

CREATE TRIGGER trg_services_rights_gate_fr
BEFORE UPDATE OF fr_status ON services
WHEN NEW.fr_status = 'published'
  AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.media_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'services: cannot publish FR — media publication rights not confirmed');
END;

CREATE TRIGGER trg_services_rights_gate_en
BEFORE UPDATE OF en_status ON services
WHEN NEW.en_status = 'published'
  AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.media_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'services: cannot publish EN — media publication rights not confirmed');
END;

CREATE TRIGGER trg_services_rights_gate_media_change
BEFORE UPDATE OF media_id ON services
WHEN NEW.status = 'published'
  AND (NEW.fr_status = 'published' OR NEW.en_status = 'published')
  AND (SELECT publication_rights_confirmed FROM media WHERE id = NEW.media_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'services: cannot change media on a row with a live language — new media publication rights not confirmed');
END;
