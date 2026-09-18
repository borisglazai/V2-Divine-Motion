/**
 * Éditeur visuel Phase 3 — client-side-only behavior that no plain HTTP/DAL
 * test can exercise (see tests/public/site-editor-phase3.test.ts for the
 * server-side coverage of Retirer/Remettre, Précédent/Suivant, layout
 * losslessness, mandatory alt and the focal point):
 *
 *  - Alt reuse from the media picker, creation-time only (Boris's brief
 *    §11, validated orientation 3): pre-fills an EMPTY slot's alt FR/EN
 *    from the picked media's own alt, but never touches an EXISTING item's
 *    already-set alt on "Changer l'image".
 *  - The focal point's click-to-set UI (§10): a click inside the small
 *    preview updates the hidden focalX/focalY fields and the marker,
 *    immediately, before any save.
 *  - Retirer's confirmation guard (§4).
 *  - Keyboard operability of the "Modifier" panel toggle (§12/accessibility).
 *  - Mobile: quick actions stay reachable and tappable, nothing hidden
 *    under the fixed toolbar (§12).
 *
 * Same `astro dev` + Playwright pattern as
 * tests/admin/layout-picker.browser.test.ts and
 * tests/admin/contact-form-isolation.browser.test.ts — see that file's
 * header for why `astro dev` (not `astro preview`) and why
 * `execFileSync`/`astro dev stop` instead of tracking a child PID. Seeds
 * its own media + work_items rows directly against the SAME default local
 * D1 `astro dev` reads (idempotent, `WHERE NOT EXISTS`), at very high,
 * isolated `position` values so it never collides with whatever the
 * developer's own seed/dev data looks like.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const PORT = 4328;
const BASE_URL = `http://localhost:${PORT}`;
const TRAVAIL_EDITOR_URL = `${BASE_URL}/admin/site/travail?lang=fr`;

const SEED_MEDIA_STORAGE_KEY = "media/phase3-browser-seed.jpg";
const SEED_MEDIA_ALT_FR = "Alt FR du média Phase 3 (réutilisable à la création)";
const SEED_MEDIA_ALT_EN = "Alt EN of the Phase 3 media (reusable at creation)";
const ITEM_ALT_FR = "PHASE3-BROWSER-ITEM-ALT-FR";

let browser: Browser;
let page: Page;

function d1(command: string): string {
  return execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", command], { cwd: repoRoot, stdio: "pipe" }).toString();
}

function d1Json<T>(command: string): T {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", command], { cwd: repoRoot, stdio: "pipe" }).toString();
  return JSON.parse(out) as T;
}

/** Idempotent seed: one ready, rights-confirmed media (with a known alt) and one published, visible, FR+EN-live work_item using a DIFFERENT alt — so "reused at creation" vs. "never overwritten on an existing item" are trivially distinguishable in the DOM. */
function seedPhase3Fixtures(): void {
  d1(
    `INSERT INTO media (storage_key, mime_type, size_bytes, width, height, media_type, alt_fr, alt_en, focal_x, focal_y, processing_status, publication_rights_confirmed, uploaded_at, created_at, updated_at) SELECT '${SEED_MEDIA_STORAGE_KEY}', 'image/jpeg', 100, 800, 600, 'image', '${SEED_MEDIA_ALT_FR}', '${SEED_MEDIA_ALT_EN}', 50, 50, 'ready', 1, 1, 1, 1 WHERE NOT EXISTS (SELECT 1 FROM media WHERE storage_key = '${SEED_MEDIA_STORAGE_KEY}');`,
  );
  const mediaRows = d1Json<[{ results: { id: number }[] }]>(`SELECT id FROM media WHERE storage_key = '${SEED_MEDIA_STORAGE_KEY}';`);
  const mediaId = mediaRows[0].results[0].id;

  d1(
    `INSERT INTO work_items (status, media_id, position, ratio, alt_fr, alt_en, focal_x, focal_y, is_visible, featured_on_home, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at) SELECT 'published', ${mediaId}, 9600, '4/5', '${ITEM_ALT_FR}', 'PHASE3-BROWSER-ITEM-ALT-EN', 50, 50, 1, 0, 'published', 'published', 1, 1, 1, 1 WHERE NOT EXISTS (SELECT 1 FROM work_items WHERE media_id = ${mediaId} AND position = 9600);`,
  );
}

/** Best-effort cleanup of any draft this suite's Modifier/focal/retirer tests may have opened, so a re-run starts from the same published baseline. */
function resetSeedItemDraft(): void {
  try {
    d1(`DELETE FROM work_items WHERE draft_of_id = (SELECT id FROM work_items WHERE position = 9600 AND status = 'published');`);
    d1(`UPDATE work_items SET is_visible = 1 WHERE position = 9600 AND status = 'published';`);
  } catch {
    // Best-effort only.
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Dev server did not become ready at ${url} in time: ${lastError}`);
}

function killWhateverIsOnPort(port: number): void {
  let pids = "";
  try {
    pids = execFileSync("lsof", ["-t", `-i:${port}`], { encoding: "utf-8" }).trim();
  } catch {
    return;
  }
  for (const pidStr of pids.split("\n").filter(Boolean)) {
    const pid = Number(pidStr);
    if (pid === process.pid || pid === process.ppid) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

function stopDevServer(): void {
  try {
    execFileSync(path.join(repoRoot, "node_modules", ".bin", "astro"), ["dev", "stop"], { cwd: repoRoot, stdio: "pipe" });
  } catch {
    // Best-effort — killWhateverIsOnPort below is the real fallback.
  }
}

/** `astro dev` occasionally fails to bring its daemon up ("process exited before becoming ready", transient, observed repeatedly in this project) — retry a few times before giving up. */
function startDevServer(): void {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execFileSync(path.join(repoRoot, "node_modules", ".bin", "astro"), ["dev", "--port", String(PORT)], {
        cwd: repoRoot,
        stdio: "pipe",
        timeout: 20_000,
      });
      return;
    } catch (err) {
      lastError = err;
      stopDevServer();
      killWhateverIsOnPort(PORT);
    }
  }
  throw new Error(`astro dev failed to start after 3 attempts: ${lastError}`);
}

before(async () => {
  killWhateverIsOnPort(PORT);
  seedPhase3Fixtures();
  startDevServer();
  await waitForServer(`${BASE_URL}/`, 30_000);
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
});

after(async () => {
  resetSeedItemDraft();
  await browser?.close();
  stopDevServer();
  killWhateverIsOnPort(PORT);
});

function seedItemSlot() {
  return page.locator(".gallery-slot--occupied", { has: page.locator(`input[name="altFr"][value="${ITEM_ALT_FR}"]`) });
}

test("empty slot: picking a media pre-fills alt FR/EN from the media's own alt — only shown after a media is picked", async () => {
  await page.goto(TRAVAIL_EDITOR_URL, { waitUntil: "networkidle" });

  const emptySlot = page.locator(".gallery-slot--empty").first();
  const newFields = emptySlot.locator("[data-gallery-slot-new-fields]");
  const displayBefore = await newFields.evaluate((el) => getComputedStyle(el).display);
  assert.equal(displayBefore, "none", "alt/caption fields must be hidden before any media is picked (Boris's brief §3)");

  await emptySlot.locator("[data-cms-open-media-picker]").click();
  await page.locator(`[data-cms-media-option][data-media-alt-fr="${SEED_MEDIA_ALT_FR}"]`).click();

  const displayAfter = await newFields.evaluate((el) => getComputedStyle(el).display);
  assert.notEqual(displayAfter, "none", "fields must become visible once a media is picked");

  assert.equal(await emptySlot.locator('input[name="altFr"]').inputValue(), SEED_MEDIA_ALT_FR, "alt FR must be pre-filled from the picked media's own alt");
  assert.equal(await emptySlot.locator('input[name="altEn"]').inputValue(), SEED_MEDIA_ALT_EN, "alt EN must be pre-filled from the picked media's own alt");

  // Still fully editable — never a locked/invented value.
  await emptySlot.locator('input[name="altFr"]').fill("Texte alternatif choisi par l'admin");
  assert.equal(await emptySlot.locator('input[name="altFr"]').inputValue(), "Texte alternatif choisi par l'admin");
});

test("occupied slot: 'Changer l'image' never overwrites the item's already-set alt", async () => {
  await page.goto(TRAVAIL_EDITOR_URL, { waitUntil: "networkidle" });

  const slot = seedItemSlot();
  assert.equal(await slot.locator('input[name="altFr"]').inputValue(), ITEM_ALT_FR, "precondition: the existing item's alt is what we seeded");

  // EditableImage's full-surface trigger opens the shared picker.
  await slot.locator(".cms-editable-image__trigger").click({ force: true });
  await page.locator(`[data-cms-media-option][data-media-alt-fr="${SEED_MEDIA_ALT_FR}"]`).click();

  assert.equal(
    await slot.locator('input[name="altFr"]').inputValue(),
    ITEM_ALT_FR,
    "changing the image on an EXISTING item must never touch its already-set alt — validated orientation 3",
  );
});

test("focal point: clicking inside the preview updates the hidden fields and the marker immediately", async () => {
  await page.goto(TRAVAIL_EDITOR_URL, { waitUntil: "networkidle" });
  const slot = seedItemSlot();

  await slot.locator("[data-gallery-slot-panel-toggle]").click();
  const focalPreview = slot.locator("[data-gallery-slot-focal-preview]");
  await focalPreview.waitFor({ state: "visible" });

  const box = await focalPreview.boundingBox();
  assert.ok(box);
  // Click near the top-left quadrant — expect a low percentage on both axes.
  await focalPreview.click({ position: { x: Math.round(box!.width * 0.2), y: Math.round(box!.height * 0.2) } });

  const x = Number(await slot.locator('[data-gallery-slot-focal-input="x"]').inputValue());
  const y = Number(await slot.locator('[data-gallery-slot-focal-input="y"]').inputValue());
  assert.ok(x >= 10 && x <= 30, `expected focalX near 20, got ${x}`);
  assert.ok(y >= 10 && y <= 30, `expected focalY near 20, got ${y}`);

  const markerLeft = await slot.locator("[data-gallery-slot-focal-marker]").evaluate((el) => (el as HTMLElement).style.left);
  assert.equal(markerLeft, `${x}%`, "the marker must move immediately, before any save");
});

test("Phase 4: focal point is keyboard-operable — arrows nudge fine, Shift+arrow nudges coarse, bounded 0-100", async () => {
  await page.goto(TRAVAIL_EDITOR_URL, { waitUntil: "networkidle" });
  const slot = seedItemSlot();

  await slot.locator("[data-gallery-slot-panel-toggle]").click();
  const focalPreview = slot.locator("[data-gallery-slot-focal-preview]");
  await focalPreview.waitFor({ state: "visible" });

  // A real Tab stop, not just clickable.
  assert.equal(await focalPreview.getAttribute("tabindex"), "0");
  assert.equal(await focalPreview.getAttribute("role"), "group");

  await focalPreview.focus();
  const xInput = slot.locator('[data-gallery-slot-focal-input="x"]');
  const yInput = slot.locator('[data-gallery-slot-focal-input="y"]');
  const startX = Number(await xInput.inputValue());
  const startY = Number(await yInput.inputValue());

  await page.keyboard.press("ArrowRight");
  assert.equal(Number(await xInput.inputValue()), Math.min(100, startX + 2), "a plain arrow key must nudge by the fine step (2)");

  await page.keyboard.press("Shift+ArrowDown");
  assert.equal(Number(await yInput.inputValue()), Math.min(100, startY + 10), "Shift+arrow must nudge by the coarse step (10)");

  // Bounds: push far past 100 and confirm it clamps, never exceeds.
  for (let i = 0; i < 12; i++) await page.keyboard.press("Shift+ArrowRight");
  assert.equal(Number(await xInput.inputValue()), 100, "focalX must clamp at 100, never overflow");

  for (let i = 0; i < 12; i++) await page.keyboard.press("Shift+ArrowLeft");
  assert.equal(Number(await xInput.inputValue()), 0, "focalX must clamp at 0, never go negative");
});

test("keyboard: focusing 'Modifier' and pressing Enter expands the panel", async () => {
  await page.goto(TRAVAIL_EDITOR_URL, { waitUntil: "networkidle" });
  const slot = seedItemSlot();
  const toggle = slot.locator("[data-gallery-slot-panel-toggle]");
  const panel = slot.locator(".gallery-slot__panel");
  // Phase 4 addendum: the publish-group is now a sibling of .gallery-slot__panel
  // (not nested inside it — fixes a nested-<form> bug, see GallerySlot.astro's
  // own comment there), but still collapses/expands together with it, via the
  // same [data-gallery-slot-panel] marker on both and a shared aria-controls.
  const publishGroup = slot.locator(".gallery-slot__publish-group");

  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  const panelId = await panel.getAttribute("id");
  const publishGroupId = await publishGroup.getAttribute("id");
  assert.ok(panelId, "the panel must have an id for aria-controls to reference");
  assert.ok(publishGroupId, "the publish-group must have an id for aria-controls to reference");
  const ariaControls = (await toggle.getAttribute("aria-controls")) ?? "";
  assert.deepEqual(
    ariaControls.split(" "),
    [panelId, publishGroupId],
    "Phase 4: the toggle must point aria-controls at both collapsible regions' real ids",
  );

  await toggle.focus();
  await page.keyboard.press("Enter");

  assert.equal(await toggle.getAttribute("aria-expanded"), "true", "keyboard activation must expand the panel exactly like a click");
  assert.equal(await panel.evaluate((el) => getComputedStyle(el).display), "flex");
  assert.equal(await publishGroup.evaluate((el) => getComputedStyle(el).display), "flex", "the publish-group must expand together with the panel");
});

test("Phase 4 addendum: 'Afficher sur l'accueil' — checking it, saving, and reloading keeps the checked state visible (draft), and writes featured_on_home=1 on the draft row", async () => {
  await page.goto(TRAVAIL_EDITOR_URL, { waitUntil: "networkidle" });
  let slot = seedItemSlot();
  await slot.locator("[data-gallery-slot-panel-toggle]").click();

  const checkbox = slot.locator('input[name="featuredOnHome"]');
  assert.equal(await checkbox.isChecked(), false, "precondition: the seeded item is not featured");
  assert.equal(
    await slot.locator("label", { hasText: "Afficher sur l'accueil" }).locator("span", { hasText: "sélection Travail de la page d'accueil" }).count(),
    1,
    "the plain-language help text must be present, not the raw column name",
  );

  await checkbox.check();
  // Deliberately NOT { force: true } here: the page's fixed toolbar
  // (EditorToolbar.astro) can visually sit over this button once the
  // panel is expanded and pushes the slot's content down — force would
  // skip Playwright's "not covered by another element" check and could
  // silently click through to the toolbar instead (found while writing
  // this test). Letting Playwright auto-scroll and verify the real
  // target is what actually proves this button submits its own form.
  await Promise.all([
    page.waitForURL(/flash=success/, { timeout: 10_000 }),
    slot.locator("button", { hasText: "Enregistrer l'emplacement" }).click(),
  ]);

  const draftRowsAfterSave = d1Json<[{ results: { featured_on_home: number }[] }]>(
    `SELECT featured_on_home FROM work_items WHERE draft_of_id = (SELECT id FROM work_items WHERE position = 9600 AND status = 'published');`,
  );
  assert.equal(draftRowsAfterSave[0].results[0]?.featured_on_home, 1, "the draft row must carry featured_on_home=1 right after the save");

  // Reload the editor from scratch — a real navigation, not just re-reading in-memory state.
  await page.goto(TRAVAIL_EDITOR_URL, { waitUntil: "networkidle" });
  slot = seedItemSlot();
  await slot.locator("[data-gallery-slot-panel-toggle]").click();
  assert.equal(await slot.locator('input[name="featuredOnHome"]').isChecked(), true, "the checked state must survive a full page reload");
});

test("Retirer requires confirmation — declining leaves the item fully untouched", async () => {
  await page.goto(TRAVAIL_EDITOR_URL, { waitUntil: "networkidle" });
  const slot = seedItemSlot();

  page.once("dialog", (dialog) => dialog.dismiss());
  await slot.locator("button", { hasText: "Retirer" }).click({ force: true });
  await page.waitForTimeout(300);

  // Declining must never navigate/submit — still on the editor, item still shown as not masked.
  assert.equal(page.url().includes("flash="), false, "a dismissed confirm must never let the form submit");
  assert.equal(await slot.locator(".gallery-slot__status-tag--hidden").count(), 0, "the item must not read as Masqué after declining");
});

test("Retirer (confirmed) marks the item Masqué immediately (still draft), and Remettre restores it", async () => {
  await page.goto(TRAVAIL_EDITOR_URL, { waitUntil: "networkidle" });
  let slot = seedItemSlot();

  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([page.waitForURL(/flash=success/, { timeout: 10_000 }), slot.locator("button", { hasText: "Retirer" }).click({ force: true })]);

  slot = seedItemSlot();
  assert.equal(await slot.locator(".gallery-slot__status-tag--hidden").count(), 1, "Masqué must be visible immediately after Retirer, even before publish");

  await slot.locator("button", { hasText: "Remettre" }).click({ force: true });
  await page.waitForURL(/flash=success/, { timeout: 10_000 });

  slot = seedItemSlot();
  assert.equal(await slot.locator(".gallery-slot__status-tag--hidden").count(), 0, "Remettre must clear the Masqué state immediately");
});

test("mobile viewport: the quick-action toolstrip stays reachable and tappable, nothing hidden under the fixed toolbar", async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(TRAVAIL_EDITOR_URL, { waitUntil: "networkidle" });

  const slot = seedItemSlot();
  const toggle = slot.locator("[data-gallery-slot-panel-toggle]");
  await toggle.scrollIntoViewIfNeeded();
  // A real tap — if the fixed mobile toolbar overlapped this control,
  // Playwright's actionability check (element must actually receive the
  // pointer event) would time out here instead of succeeding.
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");

  await page.setViewportSize({ width: 1400, height: 1000 });
});
