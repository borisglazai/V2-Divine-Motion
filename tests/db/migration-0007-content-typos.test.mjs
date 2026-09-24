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

function wrangler(persistDir, args) {
  return execFileSync("npx", ["wrangler", "d1", ...args, "--local", "--persist-to", persistDir], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

function execute(persistDir, sql) {
  return wrangler(persistDir, ["execute", "DB", "--json", "--command", sql]);
}

function rows(persistDir, sql) {
  const output = execute(persistDir, sql);
  return JSON.parse(output.slice(output.indexOf("[")))[0].results;
}

describe("migration 0007 — exact-match staging typo repair", () => {
  const persistDir = freshDir(".wrangler-test-migration-0007");

  test("repairs only the confirmed corrupt values and preserves custom copy", () => {
    wrangler(persistDir, ["migrations", "apply", "DB"]);
    wrangler(persistDir, ["execute", "DB", "--file", "seeds/local.sql"]);

    execute(
      persistDir,
      `UPDATE home_content
         SET hero_headline_fr = 'Des imagfgtes qui resftent en mouvement.',
             hero_headline_en = 'Owner-authored English headline.';
       UPDATE contact_content
         SET hero_title_fr = 'Parlons de votre prffffffojet.';`,
    );

    wrangler(persistDir, ["execute", "DB", "--file", "migrations/0007_fix_staging_content_typos.sql"]);

    const home = rows(persistDir, "SELECT hero_headline_fr, hero_headline_en FROM home_content WHERE status = 'published';")[0];
    const contact = rows(persistDir, "SELECT hero_title_fr FROM contact_content WHERE status = 'published';")[0];

    assert.equal(home.hero_headline_fr, "Des images qui restent en mouvement.");
    assert.equal(home.hero_headline_en, "Owner-authored English headline.");
    assert.equal(contact.hero_title_fr, "Parlons de votre projet.");
  });
});
