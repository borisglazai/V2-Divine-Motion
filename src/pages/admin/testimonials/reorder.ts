import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { reorderTestimonialsAction } from "@/lib/admin/testimonials-actions";

export const prerender = false;

/** Draft-safe only — see src/lib/db/testimonials.ts's reorderTestimonialDrafts header comment (same pattern as Travail/Services). */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const result = await reorderTestimonialsAction(getDb(), formData, auth.identity.email);
  return redirect(result.redirect);
};
