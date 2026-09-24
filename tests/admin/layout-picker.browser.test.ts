/**
 * Staging bug fix — Travail's gallery-layout picker
 * (src/components/admin/EditorToolbar.astro). Root cause: the picker's
 * "selected" visual state (`.cms-layout-picker__option--active`) was
 * computed ONLY at server-render time from the page's initial
 * `gallery_layout`; nothing ever updated it client-side after a click, so
 * the underlying native radio actually changed correctly (confirmed by
 * reproducing the bug against a real running dev server before fixing it)
 * but the admin saw zero visual feedback and had no way to tell their
 * click had registered.
 *
 * This needs a REAL browser (Playwright), not `node --test` + `fetch()`
 * like tests/admin/routes.test.mjs: the bug is entirely in client-side
 * JS/CSS state that a plain HTTP request can never exercise. Uses
 * `astro dev` (not `astro preview`) — Cloudflare Access is bypassed in
 * DEV mode by design (src/lib/auth/guard.ts's `import.meta.env.DEV`
 * branch), so this can actually load and interact with
 * `/admin/site/travail` without a real Access JWT, same as every manual
 * smoke test this project has used for `/admin/site/**` so far.
 *
 * The shared browser-test helper starts `astro dev` as a foreground child,
 * waits for HTTP readiness and retains the process handle for reliable
 * teardown. This matches current Astro behavior and avoids CI timeouts.
 *
 * CI runs `db:migrate:local` before this suite but never seeds the
 * default local D1 (only isolated per-file `--persist-to` DBs get
 * seeded, via tests/dal/harness.ts) — so this suite seeds its own
 * `work_page_content` published row directly against the SAME default
 * D1 `astro dev` reads, idempotently (`WHERE NOT EXISTS`), exactly the
 * repair pattern used for the real staging incident. Safe to also run
 * locally against an already-seeded DB.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { startAstroDevServer, type AstroDevServer } from "../setup/astro-dev-server";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const PORT = 4327;
const BASE_URL = `http://localhost:${PORT}`;
const TRAVAIL_EDITOR_URL = `${BASE_URL}/admin/site/travail?lang=fr`;

let browser: Browser;
let page: Page;
let devServer: AstroDevServer;

function seedWorkPageContentIfMissing(): void {
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      `INSERT INTO work_page_content (title_fr, title_en, intro_fr, intro_en, cta_headline_fr, cta_headline_en, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at) SELECT 'Travail', 'Work', 'Une selection de notre regard.', 'A glimpse into how we see.', 'Vous avez quelque chose a raconter ?', 'Have a story to tell?', 'published', 'published', 1, 1, 1, 1 WHERE NOT EXISTS (SELECT 1 FROM work_page_content);`,
    ],
    { cwd: repoRoot, stdio: "pipe" },
  );
}

function resetGalleryLayoutToEditorial(): void {
  try {
    execFileSync(
      "npx",
      ["wrangler", "d1", "execute", "DB", "--local", "--command", `UPDATE work_page_content SET gallery_layout = 'editorial' WHERE status = 'published';`],
      { cwd: repoRoot, stdio: "pipe" },
    );
  } catch {
    // Best-effort cleanup only.
  }
}

before(async () => {
  seedWorkPageContentIfMissing();
  devServer = await startAstroDevServer({ repoRoot, port: PORT, readyUrl: `${BASE_URL}/` });
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
});

after(async () => {
  resetGalleryLayoutToEditorial();
  await browser?.close();
  await devServer?.stop();
});

async function activeLayoutValue(): Promise<string | null> {
  return page.locator(".cms-layout-picker__option--active input").getAttribute("value");
}

test("clicking Story visually selects it and deselects Editorial (fixed) — mouse", async () => {
  await page.goto(TRAVAIL_EDITOR_URL, { waitUntil: "networkidle" });

  // Baseline may be whatever a previous run left behind — force a known start.
  await page.locator('input[name="galleryLayout"][value="editorial"]').locator("xpath=..").click();
  await page.waitForTimeout(150);
  assert.equal(await activeLayoutValue(), "editorial", "baseline: Editorial must read as selected before the real assertions");

  const storyLabel = page.locator(".cms-layout-picker__option", { has: page.locator('input[name="galleryLayout"][value="story"]') });
  await storyLabel.click();
  await page.waitForTimeout(150);

  assert.equal(await page.locator('input[name="galleryLayout"][value="story"]').isChecked(), true, "the underlying radio must be checked");
  assert.equal(await page.locator('input[name="galleryLayout"][value="editorial"]').isChecked(), false, "Editorial's radio must be unchecked");
  assert.equal(await activeLayoutValue(), "story", "the visual --active class must move to Story immediately on click");
});

test("clicking Minimal works the same way, from any starting state", async () => {
  const minimalLabel = page.locator(".cms-layout-picker__option", { has: page.locator('input[name="galleryLayout"][value="minimal"]') });
  await minimalLabel.click();
  await page.waitForTimeout(150);
  assert.equal(await activeLayoutValue(), "minimal");
  assert.equal(await page.locator('input[name="galleryLayout"][value="story"]').isChecked(), false, "Story must no longer be checked");
});

test("keyboard: focusing a radio and pressing Space selects it and updates the visual state", async () => {
  const editorialInput = page.locator('input[name="galleryLayout"][value="editorial"]');
  await editorialInput.focus();
  await page.keyboard.press(" ");
  await page.waitForTimeout(150);

  assert.equal(await editorialInput.isChecked(), true);
  assert.equal(await activeLayoutValue(), "editorial");
});

test("Enregistrer persists the visually-selected layout, and it survives a reload", async () => {
  const storyLabel = page.locator(".cms-layout-picker__option", { has: page.locator('input[name="galleryLayout"][value="story"]') });
  await storyLabel.click();
  await page.waitForTimeout(150);
  assert.equal(await activeLayoutValue(), "story", "precondition: Story must be visually selected before saving");

  const saveButton = page.locator('button[form="cms-editor-form"]', { hasText: "Enregistrer" });
  // `force: true` only skips Playwright's own pre-click actionability
  // checks (visible/enabled/stable/unobstructed) — the real click event
  // still fires on the real button. Needed here purely because Astro's
  // own `astro dev`-only devtools overlay (`<astro-dev-toolbar>`, never
  // present in production/preview) happens to sit at the exact bottom
  // edge of the viewport, overlapping this fixed toolbar — a dev-mode
  // test artifact, unrelated to the bug this suite covers.
  await Promise.all([page.waitForURL(/flash=success/, { timeout: 10_000 }), saveButton.click({ force: true })]);

  await page.goto(TRAVAIL_EDITOR_URL, { waitUntil: "networkidle" });
  assert.equal(await page.locator('input[name="galleryLayout"][value="story"]').isChecked(), true, "Story must still be the checked radio after a full reload");
  assert.equal(await activeLayoutValue(), "story", "Story must still read as visually selected after a full reload");
});
