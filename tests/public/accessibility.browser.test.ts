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
import { execFileSync } from "node:child_process";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type Page } from "playwright";

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

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Dev server did not become ready at ${url}: ${lastError}`);
}

function killWhateverIsOnPort(port: number): void {
  let pids = "";
  try {
    pids = execFileSync("lsof", ["-t", `-i:${port}`], { encoding: "utf-8" }).trim();
  } catch {
    return;
  }
  for (const pidString of pids.split("\n").filter(Boolean)) {
    const pid = Number(pidString);
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
    execFileSync(path.join(repoRoot, "node_modules", ".bin", "astro"), ["dev", "stop"], {
      cwd: repoRoot,
      stdio: "pipe",
    });
  } catch {
    // Best effort; the port cleanup below is the fallback.
  }
}

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
    } catch (error) {
      lastError = error;
      stopDevServer();
      killWhateverIsOnPort(PORT);
    }
  }
  throw new Error(`astro dev failed to start after 3 attempts: ${lastError}`);
}

function formatViolations(route: string, violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ");
      return `${route}: ${violation.id} (${violation.impact}) — ${violation.help}; targets: ${targets}`;
    })
    .join("\n");
}

before(async () => {
  killWhateverIsOnPort(PORT);
  startDevServer();
  await waitForServer(`${BASE_URL}/`, 30_000);
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
});

after(async () => {
  await browser?.close();
  stopDevServer();
  killWhateverIsOnPort(PORT);
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
