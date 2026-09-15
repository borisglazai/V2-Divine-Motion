/**
 * HTTP-level proof that /admin is actually protected at runtime (Brief 012
 * §21/§36) — spawns the real built Worker via `astro preview` (production
 * mode: `import.meta.env.DEV` is `false`, exactly like a real deploy) and
 * sends real requests to it, the same way an attacker bypassing Cloudflare
 * Access would.
 *
 * Scope, stated explicitly rather than silently assumed: this suite only
 * proves the NEGATIVE paths (no JWT / malformed JWT -> blocked, correct
 * headers, no data leaked) end-to-end over HTTP. It deliberately does NOT
 * attempt the positive "valid Cloudflare Access JWT -> dashboard renders"
 * path over HTTP, because that would need a real Cloudflare Access
 * application issuing real tokens against a real JWKS endpoint — out of
 * scope for this brief (see Brief 012 §43, no staging Access app
 * provisioned). That positive path is instead proven by composing two
 * pieces tested independently: tests/auth/access.test.ts (a real signed
 * JWT verified end-to-end against a local JWKS — signature, issuer,
 * audience, expiry) and tests/dal/dal.test.ts's "admin dashboard summary"
 * suite (the DAL read against real D1). Together they cover every link in
 * the chain; this suite covers the one link they don't: the actual HTTP
 * rejection a bypassing client would hit.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const distDeployConfig = path.join(repoRoot, ".wrangler", "deploy", "config.json");
const PORT = 4325;
const BASE_URL = `http://localhost:${PORT}`;

let previewProcess;

before(async () => {
  assert.ok(
    existsSync(distDeployConfig),
    "No build output found (.wrangler/deploy/config.json) — run `npm run build` before `npm run test:admin`.",
  );

  previewProcess = spawn(
    path.join(repoRoot, "node_modules", ".bin", "astro"),
    ["preview", "--port", String(PORT)],
    // `astro preview` (via @cloudflare/vite-plugin) forks a real `workerd`
    // child process that does NOT exit on a SIGTERM sent only to the
    // `astro` process — confirmed empirically (a leftover `workerd` kept
    // holding the port after killing just the parent). `detached: true`
    // puts the child in its own process group (pgid === its pid), so
    // killing `-pid` in `after()` below reaches the whole tree, workerd
    // included, not just the immediate child.
    { cwd: repoRoot, stdio: "pipe", detached: true },
  );

  await waitForServer(`${BASE_URL}/`, 30_000);
});

after(async () => {
  if (previewProcess && !previewProcess.killed && previewProcess.pid !== undefined) {
    // `astro preview` (via @cloudflare/vite-plugin) forks a real
    // `workerd` process. Empirically, neither a plain SIGTERM/SIGKILL to
    // just the `astro` PID, nor one to its whole process group (`-pid`,
    // relying on `detached: true`), reliably reaches that `workerd`
    // descendant — it can keep the port bound after the parent is gone.
    // Walking `ps`'s pid/ppid tree and killing every descendant directly
    // is the one approach that has proven reliable here.
    killProcessTree(previewProcess.pid);
  }

  // Belt-and-suspenders in case the tree walk above missed a process for
  // any reason (e.g. it had already been reparented): kill whatever is
  // still bound to PORT, excluding this test file's own process.
  killWhateverIsOnPort(PORT);
});

function killProcessTree(rootPid) {
  let listing = "";
  try {
    listing = execFileSync("ps", ["-eo", "pid,ppid"], { encoding: "utf-8" });
  } catch {
    return;
  }
  const childrenByParent = new Map();
  for (const line of listing.trim().split("\n").slice(1)) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (!childrenByParent.has(ppid)) childrenByParent.set(ppid, []);
    childrenByParent.get(ppid).push(pid);
  }

  const toKill = [];
  const stack = [rootPid];
  while (stack.length > 0) {
    const pid = stack.pop();
    toKill.push(pid);
    for (const child of childrenByParent.get(pid) ?? []) stack.push(child);
  }

  // Deepest descendants first (workerd before its astro/vite parent).
  for (const pid of toKill.reverse()) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

function killWhateverIsOnPort(port) {
  let pids = "";
  try {
    pids = execFileSync("lsof", ["-t", `-i:${port}`], { encoding: "utf-8" }).trim();
  } catch {
    return; // Nothing listening (or lsof unavailable) — nothing to do.
  }
  for (const pidStr of pids.split("\n").filter(Boolean)) {
    const pid = Number(pidStr);
    // Never kill ourselves or our own parent — `node --test` runs this
    // file in its own process, and an outbound fetch() this file just
    // made can transiently show up under the same `lsof -i :PORT` filter.
    if (pid === process.pid || pid === process.ppid) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Preview server did not become ready at ${url} in time: ${lastError}`);
}

test("public route is unaffected: 200, no admin security headers forced on it", async () => {
  const response = await fetch(`${BASE_URL}/`);
  assert.equal(response.status, 200);
  const cacheControl = response.headers.get("cache-control") ?? "";
  assert.ok(!cacheControl.includes("no-store"), "the public homepage must not get the admin's no-store directive");
});

test("/admin with no JWT: blocked, no admin data, correct security headers", async () => {
  const response = await fetch(`${BASE_URL}/admin`);
  assert.ok([401, 403].includes(response.status), `expected 401/403, got ${response.status}`);

  const body = await response.text();
  assert.ok(!/dashboard|stat-card|médias|services actifs/i.test(body), "no admin content must leak in a blocked response");
  assert.ok(!/sql|stack|CF_ACCESS|jwt/i.test(body), "no internal/config detail must leak in a blocked response");

  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});

test("/admin with a malformed Cf-Access-Jwt-Assertion header: still blocked, no detail leaked", async () => {
  const response = await fetch(`${BASE_URL}/admin`, {
    headers: { "Cf-Access-Jwt-Assertion": "not-a-real-jwt" },
  });
  assert.ok([401, 403].includes(response.status));
  const body = await response.text();
  assert.ok(!/sql|stack|CF_ACCESS/i.test(body));
});

test("every placeholder admin route is protected the same way, not just /admin itself", async () => {
  const routes = [
    "/admin/site",
    "/admin/work",
    "/admin/media",
    "/admin/media/1",
    // Brief 014 §37-38: the admin-only R2 preview/delivery route is a GET,
    // not a mutation — still gated by the same middleware as every other
    // /admin/** GET, never a separate check.
    "/admin/media/1/file",
    "/admin/services",
    "/admin/testimonials",
    "/admin/content",
    "/admin/seo",
    "/admin/settings",
  ];
  for (const route of routes) {
    const response = await fetch(`${BASE_URL}${route}`);
    assert.ok([401, 403].includes(response.status), `${route} should be blocked without a JWT, got ${response.status}`);
    assert.equal(response.headers.get("cache-control"), "no-store", `${route} must set no-store even when blocked`);
  }
});

test("a direct request bypassing any frontend JS still fails — no page-level escape hatch", async () => {
  // No Referer, no Origin, no cookies, no client-side context at all —
  // the closest thing to curl hitting the Worker directly (Brief 012 §13).
  const response = await fetch(`${BASE_URL}/admin`, { redirect: "manual" });
  assert.ok([401, 403].includes(response.status));
});

// Implementation Brief 013 — CMS Travail introduces the first mutation
// (POST) endpoints under /admin. src/middleware.ts's pathname check
// (`startsWith("/admin")`) already covers them structurally, but this
// proves it empirically in the same production-mode preview as the rest
// of this suite: the DEV-only bypass (src/lib/auth/guard.ts) that would
// let a mutation through without a real Cloudflare Access JWT is, same as
// for GET pages, compiled out of this build entirely.
test("a mutation route (POST /admin/work/create) with no JWT is blocked before reaching any DAL/mutation logic", async () => {
  const response = await fetch(`${BASE_URL}/admin/work/create`, {
    method: "POST",
    headers: { Origin: BASE_URL, "Content-Type": "application/x-www-form-urlencoded" },
    body: "mediaId=1&position=1&ratio=4/5&altFr=a&altEn=a",
    redirect: "manual",
  });
  assert.ok([401, 403].includes(response.status), `expected 401/403, got ${response.status}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("a same-origin POST to a mutation route still fails without a JWT — a valid Origin never substitutes for auth", async () => {
  const response = await fetch(`${BASE_URL}/admin/work/1/publish`, {
    method: "POST",
    headers: { Origin: BASE_URL },
    redirect: "manual",
  });
  assert.ok([401, 403].includes(response.status));
});

// Implementation Brief 014 §47 — every new media mutation route, same
// production-mode preview, same proof: middleware blocks all of them
// before any requireAdminMutation()/DAL/R2 logic ever runs. This is the
// HTTP-level half of the security story; requireAdminMutation() itself
// (method/Origin/identity checks) is already exhaustively unit-tested in
// tests/auth/mutation.test.ts and every media endpoint calls it the exact
// same way the work endpoints do — not re-proven per-route here.
const MEDIA_MUTATION_ROUTES = [
  { path: "/admin/media/upload/authorize", body: JSON.stringify({ filename: "a.jpg", mimeType: "image/jpeg", sizeBytes: 100 }), contentType: "application/json" },
  { path: "/admin/media/1/upload-complete", body: undefined, contentType: undefined },
  { path: "/admin/media/1/save", body: "altFr=a&altEn=a&focalX=50&focalY=50", contentType: "application/x-www-form-urlencoded" },
  { path: "/admin/media/1/delete", body: undefined, contentType: undefined },
  { path: "/admin/media/1/restore", body: undefined, contentType: undefined },
];

for (const route of MEDIA_MUTATION_ROUTES) {
  test(`media mutation route (POST ${route.path}) with no JWT is blocked before reaching any DAL/R2 logic`, async () => {
    const headers = { Origin: BASE_URL };
    if (route.contentType) headers["Content-Type"] = route.contentType;
    const response = await fetch(`${BASE_URL}${route.path}`, {
      method: "POST",
      headers,
      body: route.body,
      redirect: "manual",
    });
    assert.ok([401, 403].includes(response.status), `expected 401/403, got ${response.status}`);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
}
