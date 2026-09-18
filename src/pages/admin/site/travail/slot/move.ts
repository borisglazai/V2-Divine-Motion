import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { moveWorkSlotAction } from "@/lib/admin/work-slot-actions";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

function safeRedirect(formData: FormData): string {
  const raw = formData.get("redirect");
  return typeof raw === "string" && raw.startsWith("/admin/site/travail") ? raw : "/admin/site/travail";
}

/** "Précédent" / "Suivant" (Éditeur visuel Phase 3, Boris's brief §5) — draft-only adjacent swap, see work-slot-actions.ts header. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const redirectTo = safeRedirect(formData);

  const workItemId = Number(formData.get("workItemId"));
  const direction = formData.get("direction");
  if (!Number.isInteger(workItemId) || workItemId <= 0 || (direction !== "prev" && direction !== "next")) {
    return redirect(withFlash(redirectTo, "error", "Requête invalide."));
  }

  const result = await moveWorkSlotAction(getDb(), workItemId, direction, redirectTo, auth.identity.email);
  return redirect(result.redirect);
};
