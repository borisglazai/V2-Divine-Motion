import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { setWorkSlotLanguageStatusAction } from "@/lib/admin/work-slot-actions";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

function safeRedirect(formData: FormData): string {
  const raw = formData.get("redirect");
  return typeof raw === "string" && raw.startsWith("/admin/site/travail") ? raw : "/admin/site/travail";
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const redirectTo = safeRedirect(formData);
  const publishedId = Number(formData.get("publishedId"));
  const locale = String(formData.get("locale") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!Number.isInteger(publishedId) || publishedId <= 0) {
    return redirect(withFlash(redirectTo, "error", "Requête invalide."));
  }

  const result = await setWorkSlotLanguageStatusAction(getDb(), publishedId, locale, status, redirectTo, auth.identity.email);
  return redirect(result.redirect);
};
