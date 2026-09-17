import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { saveServicesPageEditorAction } from "@/lib/admin/services-page-editor-actions";
import { parseServicesPageEditorForm } from "@/lib/admin/services-page-editor-validation";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

/** "Save" only ever touches the services_page_content draft — never the individual services items. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const parsed = parseServicesPageEditorForm(formData);
  if (!parsed.ok) {
    const firstError = Object.values(parsed.errors)[0] ?? "Formulaire invalide.";
    return redirect(withFlash("/admin/site/services", "error", firstError));
  }

  const result = await saveServicesPageEditorAction(getDb(), parsed.data, auth.identity.email);
  return redirect(result.redirect);
};
