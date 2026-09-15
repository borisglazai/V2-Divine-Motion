import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { getR2Credentials } from "@/lib/storage/env";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { authorizeMediaUploadAction } from "@/lib/admin/media-actions";

export const prerender = false;

/** JSON API (§19), never a redirect — this is what the client-side multi-upload module calls once per file before it PUTs directly to R2. */
export const POST: APIRoute = async ({ request, locals }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, code: "INVALID_REQUEST", message: "Malformed JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).filename !== "string" ||
    typeof (body as Record<string, unknown>).mimeType !== "string" ||
    typeof (body as Record<string, unknown>).sizeBytes !== "number"
  ) {
    return Response.json(
      { ok: false, code: "INVALID_REQUEST", message: "filename, mimeType and sizeBytes are required." },
      { status: 400 },
    );
  }
  const { filename, mimeType, sizeBytes } = body as { filename: string; mimeType: string; sizeBytes: number };

  const result = await authorizeMediaUploadAction(
    getDb(),
    getR2Credentials(),
    { filename, mimeType, sizeBytes },
    auth.identity.email,
  );
  return Response.json(result, { status: result.ok ? 200 : result.status });
};
