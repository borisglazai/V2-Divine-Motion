// Test helpers for the D1 invariant suite (Implementation Brief 010).
//
// Deliberately shells out to the real `wrangler d1 execute` CLI rather than
// opening the local D1 SQLite file directly — every query in this suite
// genuinely goes through Wrangler/Miniflare's D1 emulation, not just
// node:sqlite against a bare file (Brief 010 §14: "Ne pas dépendre
// uniquement de node:sqlite... cette phase doit vérifier le comportement
// dans l'écosystème Cloudflare").
//
// Runs against an ISOLATED local D1 persistence directory (.wrangler-test/),
// separate from the developer's seeded local DB (.wrangler/) — running this
// suite never touches or resets a developer's local seed data.

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const PERSIST_DIR = path.join(repoRoot, ".wrangler-test");

export function resetLocalD1() {
  if (existsSync(PERSIST_DIR)) {
    rmSync(PERSIST_DIR, { recursive: true, force: true });
  }
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--persist-to",
      PERSIST_DIR,
    ],
    { cwd: repoRoot, stdio: "pipe" },
  );
}

/**
 * Executes one or more semicolon-separated SQL statements against the
 * isolated local D1 test database and returns the parsed per-statement
 * results array (same shape `wrangler d1 execute --json` prints).
 * Throws with wrangler's own stderr on any SQL error (constraint
 * violation, trigger RAISE(ABORT), etc.) — callers use this to assert
 * both success and expected failure.
 */
export function execD1(sql) {
  const output = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--persist-to",
      PERSIST_DIR,
      "--json",
      "--command",
      sql,
    ],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );
  // wrangler prints a proxy-warning banner before the JSON on some setups;
  // the JSON payload is always the last well-formed `[...]` in stdout.
  const jsonStart = output.indexOf("[");
  return JSON.parse(output.slice(jsonStart));
}

/** Convenience: run `sql`, return the `.results` rows of statement index `i` (default: last statement). */
export function rows(sql, i = -1) {
  const result = execD1(sql);
  const idx = i < 0 ? result.length + i : i;
  return result[idx].results;
}

/**
 * Convenience: assert that running `sql` throws (a CHECK/FK/trigger
 * rejection). Returns the error message. Wrangler prints the actual
 * `{"error": {"text": "..."}}` payload to STDOUT (not stderr — stderr on
 * a failed `d1 execute` only carries the proxy-environment banner), so
 * this reads stdout first and falls back to stderr/e.message.
 */
export function expectSqlError(sql) {
  try {
    execD1(sql);
  } catch (e) {
    const stdout = e.stdout?.toString() ?? "";
    const stderr = e.stderr?.toString() ?? "";
    return stdout.trim() || stderr.trim() || e.message;
  }
  throw new Error(`Expected SQL to fail, but it succeeded: ${sql}`);
}
