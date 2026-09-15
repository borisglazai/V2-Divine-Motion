/**
 * Runtime D1 binding smoke test (Implementation Brief 011 §35) — proves
 * the Cloudflare `DB` binding genuinely reaches a live request handler in
 * this Astro/Cloudflare runtime, not just Wrangler CLI commands run
 * outside the app. Not a public route, not an admin route, not a
 * business endpoint: it runs one read-only query (`SELECT 1`) and
 * returns a tiny JSON status.
 *
 * Dev-only by construction: no `export const prerender = true` here, so
 * with `output: "server"` this stays an on-demand route (never baked
 * into the static build like every real page in this repo), AND it
 * 404s itself outside `import.meta.env.DEV`. Nothing links to this path
 * from any page, nav, or sitemap. (Astro ignores any `src/pages/` file
 * whose name starts with `_`/`__` entirely — excluded from routing, not
 * just hidden — so this can't use that convention and still respond; the
 * `dev-` prefix + the runtime DEV guard is what keeps it out of reach
 * outside local development.)
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";

export const GET: APIRoute = async () => {
  if (!import.meta.env.DEV) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const db = getDb();
    const row = await db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return new Response(
      JSON.stringify({ binding: "DB", reachable: true, query_result: row }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ binding: "DB", reachable: false, error: String(error) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
};
