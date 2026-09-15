-- ============================================================================
-- Divine Motion V2 — 0003_media_upload_lifecycle.sql
-- ============================================================================
-- Implementation Brief 014 — see docs/decisions/ADR-017-r2-direct-upload-lifecycle.md
-- for the full writeup, including why the simpler-looking option (making
-- `uploaded_at` nullable) was tried first and rejected: it requires SQLite's
-- "recreate the table" technique (no ALTER COLUMN exists), and `media` is
-- referenced by live foreign keys from six other tables. Verified
-- empirically against a real local D1: `DROP TABLE media` fails with
-- `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended:
-- SQLITE_CONSTRAINT_TRIGGER)` even when preceded by `PRAGMA
-- foreign_keys=OFF;` in the same batch — a D1/Wrangler `execute`/migration
-- call runs as one transaction, and SQLite treats that PRAGMA as a no-op
-- once a transaction is already open. Structurally inapplicable without
-- also recreating all six referencing tables — disproportionate for this
-- fix.
--
-- Chosen instead: add `authorized_at`, a new column with an unambiguous
-- meaning ("row created / upload authorized") via a plain ADD COLUMN — no
-- table recreation, no FK risk. `uploaded_at` itself is left unchanged at
-- the schema level (still NOT NULL); its application-level semantics are
-- now: a provisional value equal to `authorized_at` until the upload is
-- actually confirmed (`markMediaUploaded` in src/lib/db/media.ts), then
-- overwritten with the real confirmation timestamp. Never a lie, never an
-- opaque sentinel — see the ADR for the full reasoning.
--
-- 0001_initial.sql and 0002_...sql remain immutable — this is a
-- forward-fix, not a retroactive edit.
-- ============================================================================

ALTER TABLE media ADD COLUMN authorized_at INTEGER;

-- Backfill for rows that existed before this migration: under the old
-- (pre-Brief-014) code, `uploaded_at` WAS stamped at authorize time, so for
-- these specific pre-existing rows it is a correct value to backfill
-- `authorized_at` from.
UPDATE media SET authorized_at = uploaded_at WHERE authorized_at IS NULL;
