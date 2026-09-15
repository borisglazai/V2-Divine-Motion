// Migration 0003 sequencing tests (Implementation Brief 014 §15/§97) — same
// empirical discipline as CMS Work Patch 013A's 0002 sequencing checks:
// prove against a REAL local D1, not just by reading the SQL, that (a) a
// brand-new database applying 0001+0002+0003 in order works, (b) re-running
// `wrangler d1 migrations apply` a second time is a safe no-op (the
// migration-tracking table, not raw SQL re-execution, is what's idempotent
// here — see docs/decisions/ADR-017-r2-direct-upload-lifecycle.md for why
// the migration itself is a plain, non-reversible `ADD COLUMN`), and (c)
// upgrading a database that only had 0001+0002 applied correctly backfills
// `authorized_at` for pre-existing rows from their `uploaded_at` (the exact
// case migrations/0003_media_upload_lifecycle.sql's own header comment
// documents).
//
// Uses its own isolated persistence directories, separate from every other
// suite's (.wrangler-test/, .wrangler-test-dal/) — never interferes with
// them and can run concurrently.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");

function freshDir(name) {
  const dir = path.join(repoRoot, name);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  return dir;
}

function applyAllMigrations(persistDir) {
  return execFileSync(
    "npx",
    ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", persistDir],
    { cwd: repoRoot, stdio: "pipe", encoding: "utf8" },
  );
}

function execFile(persistDir, filePath) {
  return execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "DB", "--local", "--persist-to", persistDir, "--file", filePath],
    { cwd: repoRoot, stdio: "pipe", encoding: "utf8" },
  );
}

function execSqlJson(persistDir, sql) {
  const output = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "DB", "--local", "--persist-to", persistDir, "--json", "--command", sql],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );
  const jsonStart = output.indexOf("[");
  return JSON.parse(output.slice(jsonStart));
}

function rows(persistDir, sql) {
  return execSqlJson(persistDir, sql)[0].results;
}

describe("migration 0003 — fresh apply + re-apply idempotence", () => {
  const persistDir = freshDir(".wrangler-test-migration-0003-fresh");

  test("0001 + 0002 + 0003 apply cleanly in order on a brand-new database", () => {
    assert.doesNotThrow(() => applyAllMigrations(persistDir));
    const cols = rows(persistDir, "PRAGMA table_info(media);").map((c) => c.name);
    assert.ok(cols.includes("authorized_at"), "authorized_at must exist after a fresh apply");
    assert.ok(cols.includes("uploaded_at"), "uploaded_at (0001) must still exist — 0003 never drops/renames it");
  });

  test("re-running `migrations apply` a second time is a safe no-op", () => {
    // The migration-tracking table (d1_migrations), not the raw SQL file,
    // is what makes this safe — see this file's header comment.
    assert.doesNotThrow(() => applyAllMigrations(persistDir));
    const applied = rows(persistDir, "SELECT name FROM d1_migrations ORDER BY name;").map((r) => r.name);
    assert.equal(applied.filter((n) => n.includes("media_upload_lifecycle")).length, 1, "0003 must be recorded exactly once, not reapplied");
  });
});

describe("migration 0003 — upgrading a database that only had 0001+0002", () => {
  const persistDir = freshDir(".wrangler-test-migration-0003-upgrade");

  test("0001 + 0002 applied first (raw, no 0003 yet)", () => {
    assert.doesNotThrow(() => execFile(persistDir, "migrations/0001_initial.sql"));
    assert.doesNotThrow(() => execFile(persistDir, "migrations/0002_publication_rights_media_change_guard.sql"));
    const cols = rows(persistDir, "PRAGMA table_info(media);").map((c) => c.name);
    assert.ok(!cols.includes("authorized_at"), "authorized_at must not exist yet — 0003 hasn't run");
  });

  test("a pre-existing media row survives 0003 and gets authorized_at backfilled from uploaded_at", () => {
    execSqlJson(
      persistDir,
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at) VALUES ('media/pre-0003.jpg','image/jpeg',12345,999000,999000,999000);",
    );

    assert.doesNotThrow(() => execFile(persistDir, "migrations/0003_media_upload_lifecycle.sql"));

    const cols = rows(persistDir, "PRAGMA table_info(media);").map((c) => c.name);
    assert.ok(cols.includes("authorized_at"), "authorized_at must exist after 0003");

    const row = rows(persistDir, "SELECT uploaded_at, authorized_at FROM media WHERE storage_key='media/pre-0003.jpg';")[0];
    assert.equal(row.authorized_at, row.uploaded_at, "pre-existing row's authorized_at must be backfilled from its uploaded_at (0003's own documented reasoning)");
    assert.equal(row.authorized_at, 999000);
  });

  test("a row inserted after 0003 with no authorized_at stays NULL — the column is genuinely nullable, no default lie", () => {
    execSqlJson(
      persistDir,
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at) VALUES ('media/post-0003-no-authorized-at.jpg','image/jpeg',1,1,1,1);",
    );
    const row = rows(persistDir, "SELECT authorized_at FROM media WHERE storage_key='media/post-0003-no-authorized-at.jpg';")[0];
    assert.equal(row.authorized_at, null);
  });
});
