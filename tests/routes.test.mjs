import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const distChunks = path.join(repoRoot, "dist/server/chunks");

// Mirrors docs/INFORMATION_ARCHITECTURE.md. All public pages are SSR now:
// their content, SEO and settings can come from D1 and must be visible without
// rebuilding static HTML after every CMS publication.
const expectedRoutes = [
  { locale: "fr", route: "/", source: "src/pages/index.astro" },
  { locale: "fr", route: "/travail", source: "src/pages/travail.astro" },
  { locale: "fr", route: "/services", source: "src/pages/services.astro" },
  { locale: "fr", route: "/a-propos", source: "src/pages/a-propos.astro" },
  { locale: "fr", route: "/contact", source: "src/pages/contact.astro" },
  { locale: "fr", route: "/confidentialite", source: "src/pages/confidentialite.astro" },
  { locale: "en", route: "/en", source: "src/pages/en/index.astro" },
  { locale: "en", route: "/en/work", source: "src/pages/en/work.astro" },
  { locale: "en", route: "/en/services", source: "src/pages/en/services.astro" },
  { locale: "en", route: "/en/about", source: "src/pages/en/about.astro" },
  { locale: "en", route: "/en/contact", source: "src/pages/en/contact.astro" },
  { locale: "en", route: "/en/privacy", source: "src/pages/en/privacy.astro" },
];

function serverManifestSource() {
  assert.ok(existsSync(distChunks), "dist/server/chunks not found — run `npm run build` before `npm test`");
  const manifestFile = readdirSync(distChunks).find((name) => {
    if (!/^server_.*\.mjs$/.test(name)) return false;
    return readFileSync(path.join(distChunks, name), "utf8").includes("deserializeManifest(");
  });
  assert.ok(manifestFile, "Astro server manifest chunk not found after build");
  return readFileSync(path.join(distChunks, manifestFile), "utf8");
}

test("server build contains every FR/EN public route", () => {
  const manifest = serverManifestSource();
  for (const { route, source } of expectedRoutes) {
    assert.ok(
      manifest.includes(`"route": "${route}"`) && manifest.includes(`"component": "${source}"`),
      `Missing SSR route ${route} (${source}) in the Astro server manifest`,
    );
  }
});

test("every public route passes its matching locale to the shared view", () => {
  for (const { locale, source } of expectedRoutes) {
    const page = readFileSync(path.join(repoRoot, source), "utf8");
    assert.match(page, new RegExp(`locale=["']${locale}["']`), `${source} should pass locale="${locale}"`);
  }
});

test("the shared public layout renders lang and reciprocal hreflang metadata", () => {
  const layout = readFileSync(path.join(repoRoot, "src/layouts/BaseLayout.astro"), "utf8");
  assert.match(layout, /<html lang=\{locale\}>/);
  assert.match(layout, /rel="alternate" hreflang="fr"/);
  assert.match(layout, /rel="alternate" hreflang="en"/);
  assert.match(layout, /rel="alternate" hreflang="x-default"/);
});
