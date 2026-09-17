import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { createWorkSlotItemAction } from "@/lib/admin/work-slot-actions";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

function safeRedirect(formData: FormData): string {
  const raw = formData.get("redirect");
  return typeof raw === "string" && raw.startsWith("/admin/site/travail") ? raw : "/admin/site/travail";
}

/** "slot vide → Ajouter une photo, puis créer le nouveau work_item" — see work-slot-actions.ts header: alt FR/EN are always typed here, never invented. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const redirectTo = safeRedirect(formData);

  const position = Number(formData.get("position"));
  const mediaId = Number(formData.get("mediaId"));
  const ratio = formData.get("ratio");
  const altFr = formData.get("altFr");
  const altEn = formData.get("altEn");
  const captionFr = formData.get("captionFr");
  const captionEn = formData.get("captionEn");

  if (
    !Number.isInteger(position) ||
    position <= 0 ||
    !Number.isInteger(mediaId) ||
    mediaId <= 0 ||
    typeof ratio !== "string" ||
    !ratio ||
    typeof altFr !== "string" ||
    typeof altEn !== "string"
  ) {
    return redirect(withFlash(redirectTo, "error", "Requête invalide."));
  }

  const result = await createWorkSlotItemAction(
    getDb(),
    {
      position,
      ratio,
      mediaId,
      altFr,
      altEn,
      captionFr: typeof captionFr === "string" && captionFr !== "" ? captionFr : undefined,
      captionEn: typeof captionEn === "string" && captionEn !== "" ? captionEn : undefined,
    },
    redirectTo,
    auth.identity.email,
  );
  return redirect(result.redirect);
};
