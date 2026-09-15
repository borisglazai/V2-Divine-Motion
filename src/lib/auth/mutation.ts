/**
 * Mutation security (Implementation Brief 013) — the single helper every
 * admin mutation endpoint (POST /admin/work/*) calls before touching the
 * DAL. Composes three checks so no individual endpoint has to reimplement
 * them (Brief 013 §37: "Éviter de dupliquer la sécurité dans chaque
 * endpoint"):
 *
 *   1. Method — only POST/PUT/PATCH/DELETE; a mutation must never be
 *      reachable via GET (no side effect hiding behind a plain link).
 *   2. Admin identity — `src/middleware.ts` already ran `requireAdmin()`
 *      for every `/admin/**` request (mutation routes included) before
 *      any page/endpoint code executes, so `locals.adminIdentity` is
 *      already set here. This check is defense in depth, not the
 *      primary gate — see docs/decisions/ADR-016-admin-mutation-security.md.
 *   3. Origin — see `isSameOriginRequest` below; the CSRF decision for
 *      this brief (ADR-016).
 */
import type { AdminIdentity } from "./access";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type MutationErrorCode = "METHOD_NOT_ALLOWED" | "UNAUTHENTICATED" | "ORIGIN_MISMATCH";

export type MutationAuthResult =
  | { ok: true; identity: AdminIdentity }
  | { ok: false; status: number; code: MutationErrorCode; message: string };

/**
 * Cloudflare Access's own JWT/cookie is same-origin scoped, but this
 * project does not additionally rely on that for CSRF protection — see
 * ADR-016. Instead: the `Origin` header a browser attaches to every
 * cross-origin AND same-origin fetch/form POST is compared against the
 * request's OWN url (protocol + host) — no hardcoded domain list, so
 * this works identically for localhost dev, staging and production
 * without per-environment config (Brief 013 §38). A request with no
 * `Origin` header at all is rejected too (§39 "missing Origin selon
 * policy -> rejet") — modern browsers always send `Origin` on a POST,
 * so its absence here is itself suspicious, not a legitimate case to
 * special-case around.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    return requestUrl.protocol === originUrl.protocol && requestUrl.host === originUrl.host;
  } catch {
    return false;
  }
}

export function requireAdminMutation(
  request: Request,
  locals: App.Locals,
): MutationAuthResult {
  if (!MUTATION_METHODS.has(request.method)) {
    return {
      ok: false,
      status: 405,
      code: "METHOD_NOT_ALLOWED",
      message: "This action requires POST/PUT/PATCH/DELETE.",
    };
  }

  if (!locals.adminIdentity) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Admin identity missing.",
    };
  }

  if (!isSameOriginRequest(request)) {
    return {
      ok: false,
      status: 403,
      code: "ORIGIN_MISMATCH",
      message: "Cross-origin request rejected.",
    };
  }

  return { ok: true, identity: locals.adminIdentity };
}
