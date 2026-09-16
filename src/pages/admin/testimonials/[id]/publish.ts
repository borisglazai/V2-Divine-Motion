import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { publishTestimonialAction } from "@/lib/admin/testimonials-actions";

export const prerender = false;

/** :id here is the DRAFT id (see src/pages/admin/testimonials/index.astro and [id].astro). */
export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const draftId = Number(params.id);
  if (!Number.isInteger(draftId) || draftId <= 0) return new Response("Not found.", { status: 404 });

  const result = await publishTestimonialAction(getDb(), draftId, auth.identity.email);
  return redirect(result.redirect);
};
