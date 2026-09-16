import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const distClient = fileURLToPath(new URL("../dist/client/", import.meta.url));

// Mirrors docs/INFORMATION_ARCHITECTURE.md exactly. If a route is renamed
// or added there, update this list in the same change.
//
// travail/en-work (Validation Brief 014S), services/en-services (Services
// CMS brief), and index/en-index (Témoignages CMS brief) are deliberately
// absent here: all six switched from `prerender = true` (static output,
// checked below) to `prerender = false` (server-rendered per request,
// real CMS data — see src/components/pages/WorkView.astro /
// ServicesView.astro / HomeView.astro) so a publish/reload is ever
// reflected. Their HTTP-level equivalent of this check lives in
// tests/admin/routes.test.mjs ("public CMS pages render server-side"),
// which already spawns a real `astro preview` server for the admin
// security suite — no separate server-spawning test file needed here.
const expectedRoutes = [
  { locale: "fr", htmlPath: "a-propos/index.html" },
  { locale: "fr", htmlPath: "contact/index.html" },
  { locale: "fr", htmlPath: "confidentialite/index.html" },
  { locale: "en", htmlPath: "en/about/index.html" },
  { locale: "en", htmlPath: "en/contact/index.html" },
  { locale: "en", htmlPath: "en/privacy/index.html" },
];

test("build produced every FR/EN public route from INFORMATION_ARCHITECTURE.md", () => {
  assert.ok(
    existsSync(distClient),
    "dist/client not found — run `npm run build` before `npm test`",
  );

  for (const route of expectedRoutes) {
    const fullPath = path.join(distClient, route.htmlPath);
    assert.ok(existsSync(fullPath), `Missing built route: ${route.htmlPath}`);
  }
});

test("each route renders <html lang> matching its locale", () => {
  for (const route of expectedRoutes) {
    const fullPath = path.join(distClient, route.htmlPath);
    const html = readFileSync(fullPath, "utf-8");
    assert.match(
      html,
      new RegExp(`<html lang="${route.locale}"`),
      `${route.htmlPath} should declare lang="${route.locale}"`,
    );
  }
});

test("FR/EN route pairs cross-reference each other via hreflang", () => {
  // travail/en-work, services/en-services, and index/en-index are no
  // longer static output (see expectedRoutes' header comment) — a-propos
  // is still prerendered and shares the same BaseLayout hreflang wiring,
  // so it stays a valid cross-check for this mechanism.
  const about = readFileSync(path.join(distClient, "a-propos/index.html"), "utf-8");
  assert.match(about, /hreflang="en" href="[^"]*\/en\/about"/);
});
