import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { saveHomeEditorAction } from "@/lib/admin/home-editor-actions";
import { parseHomeEditorForm } from "@/lib/admin/home-editor-validation";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

/** "Save" only ever touches the home_content draft — see saveHomeEditorAction. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const parsed = parseHomeEditorForm(formData);
  if (!parsed.ok) {
    const firstError = Object.values(parsed.errors)[0] ?? "Formulaire invalide.";
    return redirect(withFlash("/admin/site", "error", firstError));
  }

  const result = await saveHomeEditorAction(getDb(), parsed.data, auth.identity.email);
  return redirect(result.redirect);
};
