import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { setServicesPageEditorLanguageStatusAction } from "@/lib/admin/services-page-editor-actions";
import { isValidLocale, isValidPageLanguageStatus } from "@/lib/admin/services-page-editor-validation";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const locale = formData.get("locale");
  const status = formData.get("status");
  if (typeof locale !== "string" || !isValidLocale(locale) || typeof status !== "string" || !isValidPageLanguageStatus(status)) {
    return redirect(withFlash("/admin/site/services", "error", "Requête invalide."));
  }

  const result = await setServicesPageEditorLanguageStatusAction(getDb(), locale, status, auth.identity.email);
  return redirect(result.redirect);
};
