import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { getMediaBucket } from "@/lib/storage/env";
import { resolvePublicMediaObject } from "@/lib/public-media";

export const prerender = false;

/**
 * Public (unauthenticated) media delivery — Validation Brief 014S bug B.
 * NOT behind Cloudflare Access (src/middleware.ts only gates `/admin/**`;
 * this route deliberately lives outside that path so real site visitors
 * can load it) — but never a public R2 bucket either. Authorization logic
 * lives in `resolvePublicMediaObject` (src/lib/public-media.ts, testable
 * against Miniflare D1+R2); this file stays thin, same convention as
 * every other endpoint in this repo.
 *
 * MVP delivery only (ADR-005 still leaves the transformation/CDN pipeline
 * open): reads the real R2 object and streams it back as-is, same as the
 * admin preview route — no resizing, no format negotiation, no caching
 * policy decision made here.
 */
export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found.", { status: 404 });

  const resolved = await resolvePublicMediaObject(getDb(), getMediaBucket(), id);
  if (!resolved) return new Response("Not found.", { status: 404 });

  return new Response(resolved.body, {
    status: 200,
    headers: { "Content-Type": resolved.mimeType },
  });
};
