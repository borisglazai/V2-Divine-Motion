import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { setAboutEditorLanguageStatusAction } from "@/lib/admin/about-editor-actions";
import { isValidLocale, isValidPageLanguageStatus } from "@/lib/admin/about-editor-validation";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const locale = formData.get("locale");
  const status = formData.get("status");
  if (typeof locale !== "string" || !isValidLocale(locale) || typeof status !== "string" || !isValidPageLanguageStatus(status)) {
    return redirect(withFlash("/admin/site/a-propos", "error", "Requête invalide."));
  }

  const result = await setAboutEditorLanguageStatusAction(getDb(), locale, status, auth.identity.email);
  return redirect(result.redirect);
};
