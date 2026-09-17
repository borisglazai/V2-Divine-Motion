import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { saveContactEditorAction } from "@/lib/admin/contact-editor-actions";
import { parseContactEditorForm } from "@/lib/admin/contact-editor-validation";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const parsed = parseContactEditorForm(formData);
  if (!parsed.ok) {
    const firstError = Object.values(parsed.errors)[0] ?? "Formulaire invalide.";
    return redirect(withFlash("/admin/site/contact", "error", firstError));
  }

  const result = await saveContactEditorAction(getDb(), parsed.data, auth.identity.email);
  return redirect(result.redirect);
};
