import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { setTestimonialLanguageStatusAction } from "@/lib/admin/testimonials-actions";

export const prerender = false;

/** :id is the PUBLISHED id — fr_status/en_status only ever live on the published row. */
export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const publishedId = Number(params.id);
  if (!Number.isInteger(publishedId) || publishedId <= 0) return new Response("Not found.", { status: 404 });

  const formData = await request.formData();
  const result = await setTestimonialLanguageStatusAction(getDb(), publishedId, formData, auth.identity.email);
  return redirect(result.redirect);
};
