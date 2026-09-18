import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { setWorkSlotVisibilityAction } from "@/lib/admin/work-slot-actions";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

function safeRedirect(formData: FormData): string {
  const raw = formData.get("redirect");
  return typeof raw === "string" && raw.startsWith("/admin/site/travail") ? raw : "/admin/site/travail";
}

/** "Retirer" / "Remettre" (Éditeur visuel Phase 3, Boris's brief §4) — is_visible only, see work-slot-actions.ts header. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const redirectTo = safeRedirect(formData);

  const workItemId = Number(formData.get("workItemId"));
  const isVisible = formData.get("isVisible") === "1";
  if (!Number.isInteger(workItemId) || workItemId <= 0) {
    return redirect(withFlash(redirectTo, "error", "Requête invalide."));
  }

  const result = await setWorkSlotVisibilityAction(getDb(), workItemId, isVisible, redirectTo, auth.identity.email);
  if ("notFound" in result) return new Response("Not found.", { status: 404 });
  return redirect(result.redirect);
};
