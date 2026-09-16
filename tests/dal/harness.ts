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
 * Uses its own isolated persistence directory (.wrangler-test-dal/),
 * separate from both the developer's seeded dev DB (.wrangler/) and the
 * Brief 010 invariant suite's directory (.wrangler-test/) — the two
 * suites never interfere with each other and can run concurrently.
 *
 * `resetTestDb()` takes an optional `dirName` (Validation Brief 014S) so
 * that test files invoked TOGETHER in a single `node --test a.ts b.ts`
 * command — which Node runs as concurrent child processes, one per file —
 * don't race on the same on-disk directory (`rm -rf` in one process vs.
 * `wrangler d1 migrations apply` in another producing "table already
 * exists"). Every existing caller keeps the shared default directory
 * (they've each only ever run alone or alongside files that don't touch
 * this harness), so this is additive, not a behavior change for them.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const DEFAULT_PERSIST_DIR_NAME = ".wrangler-test-dal";
let currentPersistDir = path.join(repoRoot, DEFAULT_PERSIST_DIR_NAME);
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
 * Wrangler CLI, and returns a live D1Database. Pass `dirName` to use a
 * directory other than the shared default — required when this file's
 * caller runs in the same `node --test` invocation as another file that
 * also calls `resetTestDb()` (see the file header comment).
 */
export async function resetTestDb(dirName: string = DEFAULT_PERSIST_DIR_NAME): Promise<D1Database> {
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
