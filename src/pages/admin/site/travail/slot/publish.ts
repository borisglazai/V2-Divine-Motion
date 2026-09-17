import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { publishWorkSlotAction } from "@/lib/admin/work-slot-actions";
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
  const draftId = Number(formData.get("draftId"));
  if (!Number.isInteger(draftId) || draftId <= 0) {
    return redirect(withFlash(redirectTo, "error", "Requête invalide."));
  }

  const result = await publishWorkSlotAction(getDb(), draftId, redirectTo, auth.identity.email);
  return redirect(result.redirect);
};
