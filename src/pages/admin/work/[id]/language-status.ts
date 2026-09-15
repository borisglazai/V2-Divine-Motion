import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { setWorkItemLanguageStatusAction } from "@/lib/admin/work-actions";

export const prerender = false;

/**
 * :id is the PUBLISHED id — fr_status/en_status only ever live on the
 * published row (Brief 013 §17: publishing a draft's content and
 * publishing a language are two distinct actions; this endpoint is
 * exclusively the second one, never routed through a draft).
 */
export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const publishedId = Number(params.id);
  if (!Number.isInteger(publishedId) || publishedId <= 0) return new Response("Not found.", { status: 404 });

  const formData = await request.formData();
  const result = await setWorkItemLanguageStatusAction(getDb(), publishedId, formData, auth.identity.email);
  return redirect(result.redirect);
};
