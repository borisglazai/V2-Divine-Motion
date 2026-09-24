/**
 * Staging bug fix — `/admin/site/contact`'s Enregistrer button submitted
 * the wrong form. Root cause: `BaseLayout.astro`'s `#cms-editor-form`
 * used to WRAP `<main>`. Every other editor page's public content is
 * plain text/images (no native form controls), so that was harmless —
 * but Contact's public content has its own real `<form class="contact-form">`
 * (Implementation Brief 003: visual only, never actually submits, but
 * still a real `<form>` element with `required` fields). Nesting a
 * `<form>` inside another is invalid HTML — confirmed by inspecting the
 * real parsed DOM before fixing this: the browser's parser silently
 * dropped the inner `<form>` tag and merged its `required` fields into
 * the outer `#cms-editor-form`, so clicking "Enregistrer" (which submits
 * `#cms-editor-form`) triggered the PUBLIC contact form's native
 * validation ("Veuillez renseigner ce champ." on Nom) instead of saving.
 *
 * Fix: `#cms-editor-form` is now a separate, empty sibling of `<main>`
 * (never wraps it), and `<main>` carries `data-cms-fields-for="cms-editor-form"`
 * so EditorToolbar.astro's submit-time script can still find the CMS's
 * own fields without DOM containment. This suite proves the real,
 * previously-broken chain end to end; the regression check for the other
 * 4 editor pages (whose fields WERE always found via containment and
 * must still be found the same way now) lives in
 * tests/admin/layout-picker.browser.test.ts (Travail) and is re-verified
 * manually for Accueil/Services/À propos per this fix's own report.
 *
 * Same infrastructure as layout-picker.browser.test.ts (see that file's
 * header for why `astro dev` + Playwright, not `node --test` + `fetch()`):
 * a real browser is required because the bug was entirely about how the
 * BROWSER's own HTML parser and native form-validation behave, which a
 * plain HTTP request can never exercise. Own port (4330) and doesn't
 * share helpers with that file, matching this project's existing
 * per-file test isolation convention (tests/dal/harness.ts's own doc).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { startAstroDevServer, type AstroDevServer } from "../setup/astro-dev-server";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const PORT = 4330;
const BASE_URL = `http://localhost:${PORT}`;
const CONTACT_EDITOR_URL = `${BASE_URL}/admin/site/contact?lang=fr`;

let browser: Browser;
let page: Page;
let devServer: AstroDevServer;

function seedContactContentIfMissing(): void {
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      `INSERT INTO contact_content (hero_title_fr, hero_title_en, hero_subtext_fr, hero_subtext_en, details_label_fr, details_label_en, closing_note_fr, closing_note_en, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at) SELECT 'Parlons de votre projet.', 'Let''s talk about your project.', 'Quelques details.', 'A few details.', 'Coordonnees', 'Get in touch', 'Chaque projet commence par une conversation.', 'Every project starts with a conversation.', 'published', 'published', 1, 1, 1, 1 WHERE NOT EXISTS (SELECT 1 FROM contact_content);`,
    ],
    { cwd: repoRoot, stdio: "pipe" },
  );
}

function resetContactHeroTitle(): void {
  try {
    execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "DB",
        "--local",
        "--command",
        `UPDATE contact_content SET hero_title_fr = 'Parlons de votre projet.' WHERE status = 'published';`,
      ],
      { cwd: repoRoot, stdio: "pipe" },
    );
  } catch {
    // Best-effort cleanup only.
  }
}

before(async () => {
  seedContactContentIfMissing();
  devServer = await startAstroDevServer({ repoRoot, port: PORT, readyUrl: `${BASE_URL}/` });
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
});

after(async () => {
  resetContactHeroTitle();
  await browser?.close();
  await devServer?.stop();
});

test("the public contact form is a real, independent <form> element — never merged into the CMS editor form", async () => {
  await page.goto(CONTACT_EDITOR_URL, { waitUntil: "networkidle" });

  const publicFormCount = await page.locator("form.contact-form").count();
  assert.equal(publicFormCount, 1, "the public contact form must exist as its own element");

  // The definitive proof this bug was ever real: what <form> a field's own
  // `.form` IDL property resolves to (not just what's visually present).
  const nameFieldFormClass = await page.evaluate(() => document.getElementById("name")?.form?.className ?? null);
  assert.match(nameFieldFormClass ?? "", /contact-form/, "the public 'name' field must belong to the public contact form, never to #cms-editor-form");

  const cmsFormExists = await page.locator("form#cms-editor-form").count();
  assert.equal(cmsFormExists, 1, "the CMS editor form must still exist, as a separate element");
});

test("public form fields start empty", async () => {
  const nameValue = await page.locator("#name").inputValue();
  const emailValue = await page.locator("#email").inputValue();
  assert.equal(nameValue, "");
  assert.equal(emailValue, "");
});

test("editing a CMS field and clicking Enregistrer never triggers the public form's native validation, and saves successfully", async () => {
  const titleField = page.locator('[data-cms-field="heroTitleFr"]');
  await titleField.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("TITRE CONTACT MODIFIE PAR LE TEST");
  await page.locator("body").click({ position: { x: 5, y: 5 } });

  let nativeDialogSeen = false;
  page.once("dialog", async (dialog) => {
    nativeDialogSeen = true;
    await dialog.dismiss();
  });

  const saveButton = page.locator('button[form="cms-editor-form"]', { hasText: "Enregistrer" });
  // `force: true` only bypasses Playwright's own pre-click actionability
  // checks — needed here purely because Astro's `astro dev`-only devtools
  // overlay (`<astro-dev-toolbar>`, never present in production/preview)
  // happens to sit at the exact bottom edge of the viewport, unrelated to
  // the bug this suite covers (same as layout-picker.browser.test.ts).
  await Promise.all([page.waitForURL(/flash=success/, { timeout: 10_000 }), saveButton.click({ force: true })]);

  assert.equal(nativeDialogSeen, false, "no native browser validation dialog should ever fire");
  assert.match(page.url(), /flash=success/, "the CMS save must actually succeed — proves the correct form was submitted");
});

test("after a full reload, the CMS edit persisted and the public form is still present and untouched", async () => {
  await page.goto(CONTACT_EDITOR_URL, { waitUntil: "networkidle" });

  const titleAfterReload = (await page.locator('[data-cms-field="heroTitleFr"]').textContent())?.trim();
  assert.equal(titleAfterReload, "TITRE CONTACT MODIFIE PAR LE TEST");

  const publicFormCount = await page.locator("form.contact-form").count();
  assert.equal(publicFormCount, 1, "the public contact form must still be present after the CMS save");

  const nameValue = await page.locator("#name").inputValue();
  assert.equal(nameValue, "", "the public form's fields must remain untouched by the CMS save");
});
