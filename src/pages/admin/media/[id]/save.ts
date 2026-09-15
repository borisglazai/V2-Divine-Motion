import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { updateMediaMetadataAction } from "@/lib/admin/media-actions";

export const prerender = false;

/** Alt FR/EN, focal point, publication rights (§28-32) — a regular form POST -> redirect -> GET, same pattern as work item edits. */
export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found.", { status: 404 });

  const formData = await request.formData();
  const result = await updateMediaMetadataAction(getDb(), id, formData, auth.identity.email);
  if ("notFound" in result) return new Response("Not found.", { status: 404 });
  return redirect(result.redirect);
};
