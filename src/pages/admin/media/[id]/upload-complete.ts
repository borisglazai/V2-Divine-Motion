import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { getMediaBucket } from "@/lib/storage/env";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { completeMediaUploadAction } from "@/lib/admin/media-actions";

export const prerender = false;

/** JSON API (§20), never a redirect. `:id` is verified against a real row before anything else runs (§41 IDOR discipline — see completeMediaUploadAction). */
export const POST: APIRoute = async ({ request, params, locals }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const mediaId = Number(params.id);
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    return Response.json({ ok: false, code: "NOT_FOUND", message: "Media not found." }, { status: 404 });
  }

  const result = await completeMediaUploadAction(getDb(), getMediaBucket(), mediaId);
  return Response.json(result, { status: result.ok ? 200 : result.status });
};
