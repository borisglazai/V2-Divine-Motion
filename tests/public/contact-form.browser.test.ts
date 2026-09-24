/**
 * Browser tests for the real Contact form (Production Readiness — Step 1).
 * Same `astro dev` + Playwright infrastructure as
 * tests/admin/contact-form-isolation.browser.test.ts (own port, no shared
 * helpers — see that file's header for the full "why a real browser"
 * rationale, which also applies here: native form submission, an
 * in-place server re-render on error, and Cloudflare Turnstile's own
 * client-side widget script are all things a plain `fetch()` test can't
 * exercise).
 *
 * Two tiers, deliberately:
 *
 * 1. Validation-error visibility (FR + EN) — runs unconditionally. This
 *    path never reaches Turnstile or Resend (src/lib/contact/submit-action.ts's
 *    check order: validation fails first), so it needs no outbound network
 *    beyond the local dev server, and no secret.
 *
 * 2. Full success flow (FR + EN) — a real submission has to pass a real
 *    Cloudflare Turnstile round-trip (the widget script loaded from
 *    challenges.cloudflare.com, using wrangler.toml's local "always
 *    passes" test key pair) AND a real Resend API call. Neither is
 *    something this repository can fake from a browser test without
 *    reaching for a live network and, for Resend, a real API key — there
 *    is no local emulation for either (unlike D1/R2, which Miniflare
 *    emulates locally). These two tests are SKIPPED unless
 *    `CONTACT_FORM_E2E_RESEND_API_KEY` is set in the environment running
 *    the suite, with a clear skip reason — this is a genuine, documented
 *    environment gap (this session's own sandbox has outbound network to
 *    challenges.cloudflare.com/api.resend.com blocked by organization
 *    policy), not something silently worked around. See the delivery
 *    report's "actions manuelles restantes" for what's needed to actually
 *    run these two in CI.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { startAstroDevServer, type AstroDevServer } from "../setup/astro-dev-server";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const PORT = 4335;
const BASE_URL = `http://localhost:${PORT}`;
const DEV_VARS_PATH = path.join(repoRoot, ".dev.vars");
const DEV_VARS_BACKUP_PATH = path.join(repoRoot, ".dev.vars.contact-form-browser-test.bak");

const RESEND_API_KEY = process.env.CONTACT_FORM_E2E_RESEND_API_KEY;
const canRunFullE2E = Boolean(RESEND_API_KEY);
const skipFullE2EReason = "requires CONTACT_FORM_E2E_RESEND_API_KEY (a real Resend API key) plus outbound network access to challenges.cloudflare.com and api.resend.com — not available in every environment this suite runs in";

let browser: Browser;
let page: Page;
let restoredDevVars = false;
let devServer: AstroDevServer;

function runD1(sql: string): void {
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", sql], { cwd: repoRoot, stdio: "pipe" });
}

function seedSiteSettingsIfMissing(): void {
  runD1(
    `INSERT INTO site_settings (id, brand_name, contact_email, instagram_url, instagram_handle_label, default_seo_title_fr, default_seo_title_en, default_seo_description_fr, default_seo_description_en, updated_at) SELECT 1, 'Divine Motion', 'hello@divinemotion.ca', 'https://instagram.com/divinemotion', 'Instagram', 'Divine Motion', 'Divine Motion', 'Photographie et vidéographie', 'Photography and videography', 1 WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE id = 1);`,
  );
}

function seedContactContentIfMissing(): void {
  runD1(
    `INSERT INTO contact_content (hero_title_fr, hero_title_en, hero_subtext_fr, hero_subtext_en, details_label_fr, details_label_en, closing_note_fr, closing_note_en, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at) SELECT 'Parlons de votre projet.', 'Let''s talk about your project.', 'Quelques details.', 'A few details.', 'Coordonnees', 'Get in touch', 'Chaque projet commence par une conversation.', 'Every project starts with a conversation.', 'published', 'published', 1, 1, 1, 1 WHERE NOT EXISTS (SELECT 1 FROM contact_content);`,
  );
}

function setUpDevVarsForFullE2E(): void {
  if (!canRunFullE2E) return;
  if (fs.existsSync(DEV_VARS_PATH)) fs.copyFileSync(DEV_VARS_PATH, DEV_VARS_BACKUP_PATH);
  const existing = fs.existsSync(DEV_VARS_PATH) ? fs.readFileSync(DEV_VARS_PATH, "utf-8") : "";
  const withoutKey = existing
    .split("\n")
    .filter((line) => !line.startsWith("RESEND_API_KEY="))
    .join("\n");
  fs.writeFileSync(DEV_VARS_PATH, `${withoutKey}\nRESEND_API_KEY=${RESEND_API_KEY}\n`);
}

function restoreDevVars(): void {
  if (!canRunFullE2E || restoredDevVars) return;
  restoredDevVars = true;
  if (fs.existsSync(DEV_VARS_BACKUP_PATH)) {
    fs.copyFileSync(DEV_VARS_BACKUP_PATH, DEV_VARS_PATH);
    fs.rmSync(DEV_VARS_BACKUP_PATH);
  } else {
    fs.rmSync(DEV_VARS_PATH, { force: true });
  }
}

before(async () => {
  seedSiteSettingsIfMissing();
  seedContactContentIfMissing();
  setUpDevVarsForFullE2E();
  devServer = await startAstroDevServer({ repoRoot, port: PORT, readyUrl: `${BASE_URL}/` });
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
});

after(async () => {
  await browser?.close();
  await devServer?.stop();
  restoreDevVars();
});

test("FR — submitting with missing required fields re-renders the same page with visible, per-field errors (no redirect)", async () => {
  await page.goto(`${BASE_URL}/contact`, { waitUntil: "networkidle" });

  await page.locator("#email").fill("marie@example.com");
  await page.locator("#message").fill("Bonjour, ceci est un test.");
  // #name and #serviceType left empty on purpose.

  await Promise.all([page.waitForLoadState("networkidle"), page.locator('button[type="submit"]', { hasText: "Envoyer" }).click({ force: true })]);

  assert.doesNotMatch(page.url(), /flash=success/, "an invalid submission must never redirect to the success flash");

  const nameError = (await page.locator("#name-error").textContent())?.trim();
  const serviceTypeError = (await page.locator("#serviceType-error").textContent())?.trim();
  assert.ok(nameError && nameError.length > 0, "the name field's error must be visible");
  assert.ok(serviceTypeError && serviceTypeError.length > 0, "the serviceType field's error must be visible");

  const emailValue = await page.locator("#email").inputValue();
  const messageValue = await page.locator("#message").inputValue();
  assert.equal(emailValue, "marie@example.com", "already-valid fields must be re-filled, not cleared, on error");
  assert.equal(messageValue, "Bonjour, ceci est un test.");
});

test("EN — submitting with missing required fields re-renders the same page with visible, per-field errors (no redirect)", async () => {
  await page.goto(`${BASE_URL}/en/contact`, { waitUntil: "networkidle" });

  await page.locator("#email").fill("marie@example.com");
  await page.locator("#message").fill("Hello, this is a test.");

  await Promise.all([page.waitForLoadState("networkidle"), page.locator('button[type="submit"]', { hasText: "Send" }).click({ force: true })]);

  assert.doesNotMatch(page.url(), /flash=success/);

  const nameError = (await page.locator("#name-error").textContent())?.trim();
  const serviceTypeError = (await page.locator("#serviceType-error").textContent())?.trim();
  assert.ok(nameError && nameError.length > 0);
  assert.ok(serviceTypeError && serviceTypeError.length > 0);

  const emailValue = await page.locator("#email").inputValue();
  assert.equal(emailValue, "marie@example.com");
});

test(
  "FR — a fully valid submission passes Turnstile, sends the email, and redirects to a visible success message",
  { skip: canRunFullE2E ? false : skipFullE2EReason },
  async () => {
    await page.goto(`${BASE_URL}/contact`, { waitUntil: "networkidle" });

    await page.locator("#name").fill("Marie Tremblay");
    await page.locator("#email").fill("marie@example.com");
    await page.locator("#serviceType").selectOption({ index: 1 });
    await page.locator("#message").fill("Bonjour, j'aimerais discuter de mon mariage.");

    await page.waitForFunction(
      () => (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value,
      { timeout: 15_000 },
    );

    await Promise.all([page.waitForURL(/flash=success/, { timeout: 15_000 }), page.locator('button[type="submit"]', { hasText: "Envoyer" }).click({ force: true })]);

    const successMessage = (await page.locator(".flash-message--success").textContent())?.trim();
    assert.ok(successMessage && successMessage.length > 0, "a visible success message must be shown after redirect");
  },
);

test(
  "EN — a fully valid submission passes Turnstile, sends the email, and redirects to a visible success message",
  { skip: canRunFullE2E ? false : skipFullE2EReason },
  async () => {
    await page.goto(`${BASE_URL}/en/contact`, { waitUntil: "networkidle" });

    await page.locator("#name").fill("Marie Tremblay");
    await page.locator("#email").fill("marie@example.com");
    await page.locator("#serviceType").selectOption({ index: 1 });
    await page.locator("#message").fill("Hello, I'd like to talk about my wedding.");

    await page.waitForFunction(
      () => (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value,
      { timeout: 15_000 },
    );

    await Promise.all([page.waitForURL(/flash=success/, { timeout: 15_000 }), page.locator('button[type="submit"]', { hasText: "Send" }).click({ force: true })]);

    const successMessage = (await page.locator(".flash-message--success").textContent())?.trim();
    assert.ok(successMessage && successMessage.length > 0);
  },
);
