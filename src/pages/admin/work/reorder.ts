import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { reorderWorkItemsAction } from "@/lib/admin/work-actions";

export const prerender = false;

/**
 * Draft-safe only (Brief 013 §19/§21): `reorderWorkItemDrafts` never
 * writes to published rows — see its own header comment in
 * src/lib/db/work.ts for the full reasoning (Review 011A). This endpoint
 * does not publish anything; the admin publishes each reordered item
 * explicitly afterwards (from the list, where a draft now shows
 * "Publier"). No atomic group-publish is implemented — that limitation
 * is documented, not silently worked around (Brief 013 §20-21).
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const result = await reorderWorkItemsAction(getDb(), formData, auth.identity.email);
  return redirect(result.redirect);
};
