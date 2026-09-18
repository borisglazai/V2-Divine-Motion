/**
 * Test harness for the DAL suite (Implementation Brief 011) — gets a real
 * `D1Database` object backed by the same local D1 SQLite persistence
 * Wrangler itself uses, via Miniflare's Node API directly (the same
 * mechanism `wrangler d1 execute --local` uses internally — see
 * node_modules/wrangler/wrangler-dist/cli.js `executeLocally`). This lets
 * the test suite call the actual TypeScript repository functions
 * in-process (fast — no CLI subprocess per query, unlike
 * tests/db/helpers.mjs's approach in Brief 010) while still exercising a
 * genuine D1 engine, not node:sqlite against a bare file.
 *
 * Each caller uses its OWN isolated persistence directory, separate from
 * the developer's seeded dev DB (.wrangler/), from the Brief 010 invariant
 * suite's directory (.wrangler-test/), and from every other caller of this
 * harness.
 *
 * Phase 4 (Boris's audit §2/§3) — `resetTestDb(dirName)` REQUIRES its
 * argument; there is no shared default anymore. There used to be one
 * (`.wrangler-test-dal/`), silently reused by every caller that didn't
 * pass a name — harmless as long as no two of those callers ever ran at
 * the same time, but nothing enforced that. Two `wrangler d1` subprocess
 * trees hitting the same on-disk SQLite directory concurrently (`rm -rf`
 * in one process racing `wrangler d1 migrations apply`/`execute` in
 * another) is exactly the failure mode observed when
 * `db:test:invariants` was accidentally run twice at once during Phase 3
 * closure — real flakiness, just self-inflicted rather than a CI property.
 * Making `dirName` mandatory turns "don't run these two scripts at the
 * same time" from an implicit convention into a compile-time necessity:
 * every caller now names its own directory, so there is no shared default
 * left to collide on.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
let currentPersistDir = path.join(repoRoot, ".wrangler-test-dal");
// Matches wrangler.toml's [[d1_databases]] database_id for the default
// (non-`--env`) binding — the local D1 SQLite file is keyed by this id,
// not by the binding name, so this must match exactly what
// `wrangler d1 migrations apply DB --local --persist-to <dir>` uses.
const LOCAL_DB_ID = "00000000-0000-0000-0000-000000000000";
// Local-only bucket name for Miniflare's R2 emulation (Brief 014 §45 —
// "ne pas appeler un vrai bucket distant pour les tests unitaires") — never
// a real Cloudflare resource, just a key into resourcePersistencePath.
const LOCAL_R2_BUCKET_NAME = "divine-motion-v2-media-test";

let mf: Miniflare | undefined;

/**
 * Wipes the isolated persistence dir, re-applies migrations/ via the real
 * Wrangler CLI, and returns a live D1Database. `dirName` is mandatory —
 * always a name unique to the calling test file (see the file header
 * comment: no shared default left to collide on).
 */
export async function resetTestDb(dirName: string): Promise<D1Database> {
  if (mf) {
    await mf.dispose();
    mf = undefined;
  }
  currentPersistDir = path.join(repoRoot, dirName);
  if (existsSync(currentPersistDir)) {
    rmSync(currentPersistDir, { recursive: true, force: true });
  }
  execFileSync(
    "npx",
    ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", currentPersistDir],
    { cwd: repoRoot, stdio: "pipe" },
  );

  const resourcePersistencePath = path.join(currentPersistDir, "v3");
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "",
      resourcePersistencePath,
      d1Databases: { DB: LOCAL_DB_ID },
      r2Buckets: { MEDIA: LOCAL_R2_BUCKET_NAME },
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await mf.getD1Database("DB")) as any as D1Database;
}

/** The same Miniflare instance's local R2 emulation (Brief 014) — call after `resetTestDb()`, which owns the `mf` lifecycle. */
export async function getTestBucket(): Promise<R2Bucket> {
  if (!mf) throw new Error("getTestBucket() called before resetTestDb()");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await mf.getR2Bucket("MEDIA")) as any as R2Bucket;
}

/** Applies seeds/local.sql to the isolated test DB via the real Wrangler CLI (same file the local/staging seed uses — see docs/DEPLOYMENT.md). */
export function seedTestDb(): void {
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "DB", "--local", "--persist-to", currentPersistDir, "--file", "seeds/local.sql"],
    { cwd: repoRoot, stdio: "pipe" },
  );
}

export async function closeTestDb(): Promise<void> {
  if (mf) {
    await mf.dispose();
    mf = undefined;
  }
}
