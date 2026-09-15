/**
 * `requireAdmin` — the single admin authorization entrypoint used by
 * `src/middleware.ts`. Composes the pure JWT verification (`access.ts`)
 * with the real Cloudflare Access config (`env.ts`), plus the ONLY local
 * development bypass in this codebase (Brief 012 §15-16).
 *
 * The bypass is gated on `import.meta.env.DEV`, not `process.env` or any
 * runtime-checkable flag: Vite inlines `import.meta.env.DEV` as the
 * literal `false` at build time for every `astro build` (confirmed
 * precedent — the same mechanism already gates
 * `src/pages/dev-d1-smoke-test.json.ts`, see
 * docs/TECHNICAL_ARCHITECTURE.md). There is no environment variable, request
 * header, or config value that can flip this bypass on in a built Worker —
 * the `if (import.meta.env.DEV)` branch and `DEV_MOCK_IDENTITY` are not
 * merely unreachable in production, they are compiled out of the bundle
 * entirely. `tests/admin/routes.test.mjs` proves this empirically against
 * a real `astro build && astro preview` (production mode), not just by
 * reading this comment.
 */
import type { AdminIdentity, AuthResult } from "./access";
import { verifyAccessRequest } from "./access";
import { getAccessConfig } from "./env";

const DEV_MOCK_IDENTITY: AdminIdentity = { email: "dev-admin@localhost", subject: "local-dev" };

export async function requireAdmin(request: Request): Promise<AuthResult> {
  if (import.meta.env.DEV) {
    return { ok: true, identity: DEV_MOCK_IDENTITY };
  }

  const config = getAccessConfig();
  if (!config) return { ok: false, code: "CONFIG_MISSING" };
  return verifyAccessRequest(request, config);
}
