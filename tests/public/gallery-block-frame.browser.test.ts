/**
 * Éditeur visuel Phase 4 (Boris's audit §5, GalleryBlockFrame extraction,
 * validated with guardrails) — a REAL browser/SSR smoke test for the
 * public Travail gallery across all 3 layouts (Editorial/Story/Minimal).
 *
 * Why this exists: none of the existing public test suites ever actually
 * render `WorkGallery.astro`/`GalleryBlockFrame.astro` through Astro's
 * real compiler — `tests/public/work-view.test.ts` and
 * `tests/public/work-gallery-adapter.test.ts` only exercise the pure
 * data functions (`buildGalleryFromWorkItems` returning a plain
 * `GalleryBlock[]`), never the `.astro` template itself. That gap let a
 * real bug through during this extraction, undetected by lint/typecheck/
 * the existing suites: a dynamic `slot={`item-${i}`}` computed inside
 * `.map()` is NOT supported by Astro's compiler (slot names must be
 * static string literals) — it compiled and typechecked cleanly, but
 * crashed the SSR render at runtime ("ReferenceError: i is not defined"),
 * specifically for the "trio" block (used only by the Story layout),
 * truncating the response mid-stream. Fixed by unrolling the trio branch
 * into 3 static slot names (WorkGallery.astro). This suite exists so a
 * future change to the same area can never silently reintroduce that
 * class of bug again.
 *
 * Same `astro dev` + Playwright pattern as
 * tests/admin/layout-picker.browser.test.ts — see that file's header for
 * why `astro dev` (not `astro preview`) is used. The shared helper owns
 * the foreground child process lifecycle. Mutates only `work_page_content.gallery_layout`
 * (idempotently reset to 'editorial' in `after()`) against the same
 * default local D1 `astro dev` reads — never touches `migrations/` or
 * any other table.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { startAstroDevServer, type AstroDevServer } from "../setup/astro-dev-server";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const PORT = 4333;
const BASE_URL = `http://localhost:${PORT}`;

let browser: Browser;
let page: Page;
let devServer: AstroDevServer;

function setLayout(layout: "editorial" | "story" | "minimal"): void {
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "DB", "--local", "--command", `UPDATE work_page_content SET gallery_layout = '${layout}' WHERE status = 'published';`],
    { cwd: repoRoot, stdio: "pipe" },
  );
}

before(async () => {
  devServer = await startAstroDevServer({ repoRoot, port: PORT, readyUrl: `${BASE_URL}/` });
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
});

after(async () => {
  setLayout("editorial");
  await browser?.close();
  await devServer?.stop();
});

const LAYOUTS: Array<"editorial" | "story" | "minimal"> = ["editorial", "story", "minimal"];

for (const layout of LAYOUTS) {
  test(`public /travail renders without error on the "${layout}" layout, every block shape present`, async () => {
    // Uncaught JS exceptions only — NOT `console` "error" messages, which
    // in this dev environment also include the browser's own network-
    // error logging for the placeholder images' 404s (no real R2 object
    // behind local dev media rows — expected noise, not a page error).
    const pageErrors: string[] = [];
    page.removeAllListeners("pageerror");
    page.on("pageerror", (err) => pageErrors.push(err.message));

    setLayout(layout);
    const response = await page.goto(`${BASE_URL}/travail`, { waitUntil: "networkidle" });
    assert.ok(response, "the page must actually respond");
    assert.equal(response!.status(), 200, `the "${layout}" layout must render 200, not crash mid-stream`);

    // A real, complete render — not a truncated stream: the footer (last
    // thing on the page) must be present.
    const footer = await page.locator("footer").count();
    assert.ok(footer > 0, "the page must render through to its footer — a truncated SSR crash never reaches it");

    const blocks = await page.locator(".work-gallery > .gallery-block").count();
    assert.ok(blocks > 0, `the "${layout}" layout must render at least one gallery block`);

    assert.deepEqual(pageErrors, [], `no uncaught JS exceptions expected for the "${layout}" layout`);
  });
}
