import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { publishAboutEditorAction } from "@/lib/admin/about-editor-actions";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const result = await publishAboutEditorAction(getDb(), auth.identity.email);
  return redirect(result.redirect);
};
