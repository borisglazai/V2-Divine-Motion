/**
 * Visual Editor Phase 4 addendum — real browser/SSR regression for Home's
 * new D1-backed Travail/Services previews (`src/components/pages/HomeView.astro`).
 *
 * Same `astro dev` + Playwright pattern as
 * tests/public/gallery-block-frame.browser.test.ts (see that file's
 * header for why `astro dev`, not `astro preview`) — CF Access is
 * bypassed in DEV mode (src/lib/auth/guard.ts), same as every other
 * `/admin/**` browser test in this project.
 *
 * CI migrates the default local D1 but never seeds it (see
 * tests/admin/layout-picker.browser.test.ts's header) — this suite seeds
 * its own minimal, idempotent fixture (`WHERE NOT EXISTS`, keyed off a
 * distinctive alt/slug) so it never collides with seeds/local.sql or any
 * other browser test's own seeding on the same shared default D1: one
 * ready+rights-confirmed media, one featured/published/visible work item,
 * one published/active service.
 *
 * Covers exactly what Boris's brief asked for as "régression": the public
 * Home (FR/EN) renders the real previews without error, and the Visual
 * Editor's edit mode still works — hero/brand statement/final CTA stay
 * editable, while the Travail/Services previews render (dynamically, from
 * real data) without exposing any admin/CMS control on the public page.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { startAstroDevServer, type AstroDevServer } from "../setup/astro-dev-server";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const PORT = 4334;
const BASE_URL = `http://localhost:${PORT}`;

let browser: Browser;
let page: Page;
let devServer: AstroDevServer;

function runD1(sql: string): void {
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", sql], { cwd: repoRoot, stdio: "pipe" });
}

/** Idempotent — safe to run against an already-seeded db (matches tests/admin/layout-picker.browser.test.ts's own convention). */
function seedHomePreviewFixtures(): void {
  runD1(
    `INSERT INTO media (storage_key, mime_type, size_bytes, processing_status, publication_rights_confirmed, publication_rights_confirmed_at, uploaded_at, authorized_at, created_at, updated_at) SELECT 'media/home-preview-browser-seed.jpg', 'image/jpeg', 1000, 'ready', 1, 1, 1, 1, 1, 1 WHERE NOT EXISTS (SELECT 1 FROM media WHERE storage_key = 'media/home-preview-browser-seed.jpg');`,
  );
  runD1(
    `INSERT INTO work_items (media_id, position, ratio, alt_fr, alt_en, is_visible, featured_on_home, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at) SELECT (SELECT id FROM media WHERE storage_key = 'media/home-preview-browser-seed.jpg'), 1, '3/2', 'Home preview browser seed FR', 'Home preview browser seed EN', 1, 1, 'published', 'published', 1, 1, 1, 1 WHERE NOT EXISTS (SELECT 1 FROM work_items WHERE alt_fr = 'Home preview browser seed FR');`,
  );
  runD1(
    `INSERT INTO services (slug, title_fr, title_en, description_fr, description_en, media_id, ratio, image_alt_fr, image_alt_en, cta_label_fr, cta_label_en, position, is_active, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at) SELECT 'home-preview-browser-seed', 'Service seed FR', 'Service seed EN', 'Description FR seed', 'Description EN seed', (SELECT id FROM media WHERE storage_key = 'media/home-preview-browser-seed.jpg'), '4/5', 'Alt FR', 'Alt EN', 'CTA FR', 'CTA EN', 1, 1, 'published', 'published', 1, 1, 1, 1 WHERE NOT EXISTS (SELECT 1 FROM services WHERE slug = 'home-preview-browser-seed');`,
  );
}

before(async () => {
  devServer = await startAstroDevServer({ repoRoot, port: PORT, readyUrl: `${BASE_URL}/` });
  seedHomePreviewFixtures();
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
});

after(async () => {
  await browser?.close();
  await devServer?.stop();
});

for (const [label, path_] of [
  ["FR", "/"],
  ["EN", "/en"],
] as const) {
  test(`public Home (${label}) renders the real Travail/Services previews without error`, async () => {
    const pageErrors: string[] = [];
    page.removeAllListeners("pageerror");
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const response = await page.goto(`${BASE_URL}${path_}`, { waitUntil: "networkidle" });
    assert.ok(response);
    assert.equal(response!.status(), 200);

    const footer = await page.locator("footer").count();
    assert.ok(footer > 0, "a truncated SSR crash never reaches the footer");

    const workItems = await page.locator(".work-mosaic__item").count();
    assert.ok(workItems > 0, "the seeded featured work item must render in the mosaic");

    const workImgSrc = await page.locator(".work-mosaic__item img").first().getAttribute("src");
    assert.ok(workImgSrc?.startsWith("/media/"), `expected the real public media route, got: ${workImgSrc}`);

    const serviceCards = await page.locator(".services-editorial__item").count();
    assert.ok(serviceCards > 0, "the seeded published service must render as a card");

    const serviceImgSrc = await page.locator(".services-editorial__item img").first().getAttribute("src");
    assert.ok(serviceImgSrc?.startsWith("/media/"), `expected the real public media route, got: ${serviceImgSrc}`);

    // No admin/CMS control ever renders on the public page — Editable.astro
    // itself renders zero extra markup (not even a wrapper) when
    // editable=false (src/components/admin/Editable.astro), so this is a
    // real structural guarantee, not just an absence of styling.
    assert.equal(await page.locator("[data-cms-field]").count(), 0);
    assert.equal(await page.locator(".cms-toolbar").count(), 0);
    assert.equal(await page.locator(".admin-btn").count(), 0);

    assert.deepEqual(pageErrors, []);
  });
}

test("Visual Editor edit mode (/admin/site) still renders: hero/brand statement/final CTA stay editable, previews render dynamically", async () => {
  const pageErrors: string[] = [];
  page.removeAllListeners("pageerror");
  page.on("pageerror", (err) => pageErrors.push(err.message));

  const response = await page.goto(`${BASE_URL}/admin/site?lang=fr`, { waitUntil: "networkidle" });
  assert.ok(response);
  assert.equal(response!.status(), 200);

  // The 3 fields this brief explicitly keeps editable.
  const editableFields = await page.locator('[data-cms-field="heroHeadlineFr"], [data-cms-field="brandStatementFr"], [data-cms-field="finalCtaHeadlineFr"]').count();
  assert.ok(editableFields > 0, "hero/brand statement/final CTA must stay editable in edit mode");

  // The previews still render (dynamically, from real data) — same
  // fixture as the public-mode assertions above, just reachable through
  // the edit-mode read path (draft-or-published).
  const workItems = await page.locator(".work-mosaic__item").count();
  assert.ok(workItems > 0, "the Travail preview must still render in edit mode");
  const serviceCards = await page.locator(".services-editorial__item").count();
  assert.ok(serviceCards > 0, "the Services preview must still render in edit mode");

  // But the previews are NOT wrapped in an editable control (out of scope
  // for this brief — curated from Travail/Services only, per Boris).
  const workMosaicEditable = await page.locator(".work-mosaic [data-cms-field]").count();
  assert.equal(workMosaicEditable, 0, "the Travail preview must not become directly editable on Home");
  const servicesEditable = await page.locator(".services-editorial [data-cms-field]").count();
  assert.equal(servicesEditable, 0, "the Services preview must not become directly editable on Home");

  assert.deepEqual(pageErrors, []);
});
