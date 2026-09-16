import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { saveTestimonialAction } from "@/lib/admin/testimonials-actions";

export const prerender = false;

/** "Save" only ever touches a draft — see saveTestimonialAction. */
export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const idParam = Number(params.id);
  if (!Number.isInteger(idParam) || idParam <= 0) return new Response("Not found.", { status: 404 });

  const formData = await request.formData();
  const result = await saveTestimonialAction(getDb(), idParam, formData, auth.identity.email);
  if ("notFound" in result) return new Response("Not found.", { status: 404 });
  return redirect(result.redirect);
};
