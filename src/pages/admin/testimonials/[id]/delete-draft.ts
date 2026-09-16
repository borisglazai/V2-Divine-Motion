import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { deleteTestimonialDraftAction } from "@/lib/admin/testimonials-actions";

export const prerender = false;

/** :id is the DRAFT id — never touches a published row (deleteTestimonialDraft's own WHERE clause enforces this too). */
export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const draftId = Number(params.id);
  if (!Number.isInteger(draftId) || draftId <= 0) return new Response("Not found.", { status: 404 });

  const result = await deleteTestimonialDraftAction(getDb(), draftId);
  return redirect(result.redirect);
};
