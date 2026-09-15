/**
 * Server-side gate in front of every `/admin` route (Brief 012 §13:
 * "Toutes les routes admin doivent être protégées côté serveur/runtime.
 * Pas seulement via JS frontend."). Runs before any admin page renders —
 * a request without a valid identity never reaches a page component, so
 * there is no page-level code path that could accidentally skip the
 * check. Public routes are untouched (the `pathname` guard below is the
 * only branch that applies to them, and it's a no-op).
 */
import { defineMiddleware } from "astro/middleware";
import { requireAdmin } from "@/lib/auth/guard";

// Applied to every /admin response, success or failure — an admin
// surface must never be cached publicly or indexed (Brief 012 §29-31).
const ADMIN_SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
};

function withAdminHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(ADMIN_SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  // Response.headers can be guarded immutable depending on how the
  // upstream Response was constructed — rebuilding rather than mutating
  // in place works regardless.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (!context.url.pathname.startsWith("/admin")) {
    return next();
  }

  const result = await requireAdmin(context.request);
  if (!result.ok) {
    // Same generic body/status shape regardless of which check failed —
    // never expose SQL, JWT claims, or config detail (Brief 012 §14).
    const status = result.code === "MISSING_JWT" ? 401 : 403;
    return withAdminHeaders(
      new Response("Not authorized.", {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    );
  }

  context.locals.adminIdentity = result.identity;
  const response = await next();
  return withAdminHeaders(response);
});
