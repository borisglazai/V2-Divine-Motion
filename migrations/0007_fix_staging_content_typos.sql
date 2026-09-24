-- ============================================================================
-- Divine Motion V2 — 0007_fix_staging_content_typos.sql
-- ============================================================================
-- Correct three confirmed accidental edits currently visible on staging.
--
-- Every UPDATE is guarded by the exact corrupted value. This deliberately
-- preserves any legitimate owner-authored copy and makes the migration a
-- no-op everywhere the typo is absent. No production deployment is performed
-- by this change; staging applies it through the existing Cloudflare Builds
-- pipeline.
-- ============================================================================

UPDATE home_content
SET hero_headline_fr = 'Des images qui restent en mouvement.',
    updated_at = strftime('%s', 'now') * 1000
WHERE hero_headline_fr = 'Des imagfgtes qui resftent en mouvement.';

UPDATE home_content
SET hero_headline_en = 'Images that stay in motion.',
    updated_at = strftime('%s', 'now') * 1000
WHERE hero_headline_en = 'Images that stdday in motion.';

UPDATE contact_content
SET hero_title_fr = 'Parlons de votre projet.',
    updated_at = strftime('%s', 'now') * 1000
WHERE hero_title_fr = 'Parlons de votre prffffffojet.';
