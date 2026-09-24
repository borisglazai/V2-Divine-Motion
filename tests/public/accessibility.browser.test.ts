/**
 * Production-readiness accessibility gate.
 *
 * Runs axe-core in a real Chromium page against every public FR/EN route.
 * The gate is intentionally scoped to WCAG 2.2 A/AA tags and serious or
 * critical impact: lower-confidence/manual-review findings still belong in
 * final QA, while violations that can materially block users fail CI.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type Page } from "playwright";
import { startAstroDevServer, type AstroDevServer } from "../setup/astro-dev-server";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const PORT = 4336;
const BASE_URL = `http://localhost:${PORT}`;

const PUBLIC_ROUTES = [
  "/",
  "/travail",
  "/services",
  "/a-propos",
  "/contact",
  "/confidentialite",
  "/en",
  "/en/work",
  "/en/services",
  "/en/about",
  "/en/contact",
  "/en/privacy",
] as const;

let browser: Browser;
let page: Page;
let devServer: AstroDevServer;

function formatViolations(route: string, violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ");
      return `${route}: ${violation.id} (${violation.impact}) — ${violation.help}; targets: ${targets}`;
    })
    .join("\n");
}

before(async () => {
  devServer = await startAstroDevServer({ repoRoot, port: PORT, readyUrl: `${BASE_URL}/` });
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
});

after(async () => {
  await browser?.close();
  await devServer?.stop();
});

for (const route of PUBLIC_ROUTES) {
  test(`${route} has no serious or critical WCAG 2.2 A/AA axe violations`, async () => {
    const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
    assert.ok(response, `${route} must respond`);
    assert.equal(response!.status(), 200, `${route} must render successfully`);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const blocking = results.violations.filter((violation) =>
      violation.impact === "serious" || violation.impact === "critical"
    );

    assert.equal(blocking.length, 0, formatViolations(route, blocking));
  });
}
