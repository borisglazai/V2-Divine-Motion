import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { saveWorkPageEditorAction } from "@/lib/admin/work-page-editor-actions";
import { parseWorkPageEditorForm } from "@/lib/admin/work-page-editor-validation";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

/** "Save" only ever touches the work_page_content draft (title/intro/CTA/gallery_layout) — never work_items, see work-slot-actions.ts for those. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const parsed = parseWorkPageEditorForm(formData);
  if (!parsed.ok) {
    const firstError = Object.values(parsed.errors)[0] ?? "Formulaire invalide.";
    return redirect(withFlash("/admin/site/travail", "error", firstError));
  }

  const result = await saveWorkPageEditorAction(getDb(), parsed.data, auth.identity.email);
  return redirect(result.redirect);
};
