import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { saveAboutEditorAction } from "@/lib/admin/about-editor-actions";
import { parseAboutEditorForm } from "@/lib/admin/about-editor-validation";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const parsed = parseAboutEditorForm(formData);
  if (!parsed.ok) {
    const firstError = Object.values(parsed.errors)[0] ?? "Formulaire invalide.";
    return redirect(withFlash("/admin/site/a-propos", "error", firstError));
  }

  const result = await saveAboutEditorAction(getDb(), parsed.data, parsed.storyParagraphEdits, parsed.approachItemEdits, auth.identity.email);
  return redirect(result.redirect);
};
