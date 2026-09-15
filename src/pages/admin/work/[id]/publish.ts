import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { publishWorkItemAction } from "@/lib/admin/work-actions";

export const prerender = false;

/**
 * :id here is the DRAFT id (see src/pages/admin/work/index.astro and
 * [id].astro, which only ever point this form at a draft's own id).
 * `publishWorkItem` (src/lib/db/work.ts -> publishDraft) does everything
 * in one atomic batch — snapshot, merge onto the published row, delete
 * the draft (Brief 013 §16).
 */
export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const draftId = Number(params.id);
  if (!Number.isInteger(draftId) || draftId <= 0) return new Response("Not found.", { status: 404 });

  const result = await publishWorkItemAction(getDb(), draftId, auth.identity.email);
  return redirect(result.redirect);
};
