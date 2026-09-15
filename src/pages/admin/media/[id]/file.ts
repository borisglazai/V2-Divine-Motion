import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { getMediaBucket } from "@/lib/storage/env";
import { getMedia } from "@/lib/db/media";

export const prerender = false;

/**
 * Admin-only preview/delivery route (§37-38) — reads the real R2 object
 * server-side and streams it back. Deliberately NOT the final public media
 * pipeline (no transforms, no CDN caching strategy, no public route): this
 * is low-traffic, admin-only, and already sits behind `src/middleware.ts`'s
 * `requireAdmin()` gate (every `/admin/**` GET is protected there — no
 * separate check needed here, same reasoning as every other admin page).
 * `:id` is checked against a real row first (§41 IDOR discipline).
 */
export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found.", { status: 404 });

  const row = await getMedia(getDb(), id);
  if (!row) return new Response("Not found.", { status: 404 });

  const object = await getMediaBucket().get(row.storage_key);
  if (!object) return new Response("Not found.", { status: 404 });

  return new Response(object.body, {
    status: 200,
    headers: { "Content-Type": row.mime_type },
  });
};
