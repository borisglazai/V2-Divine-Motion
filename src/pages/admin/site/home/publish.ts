import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { publishHomeEditorAction } from "@/lib/admin/home-editor-actions";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const result = await publishHomeEditorAction(getDb(), auth.identity.email);
  return redirect(result.redirect);
};
