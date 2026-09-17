import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { saveWorkSlotAction } from "@/lib/admin/work-slot-actions";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

function safeRedirect(formData: FormData): string {
  const raw = formData.get("redirect");
  return typeof raw === "string" && raw.startsWith("/admin/site/travail") ? raw : "/admin/site/travail";
}

/** "slot occupé → modifier le draft du work_item existant" — media + captions only, see work-slot-actions.ts header. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const formData = await request.formData();
  const redirectTo = safeRedirect(formData);

  const id = Number(formData.get("workItemId"));
  const mediaId = Number(formData.get("mediaId"));
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(mediaId) || mediaId <= 0) {
    return redirect(withFlash(redirectTo, "error", "Requête invalide."));
  }

  const captionFr = formData.get("captionFr");
  const captionEn = formData.get("captionEn");

  const result = await saveWorkSlotAction(
    getDb(),
    id,
    {
      mediaId,
      captionFr: typeof captionFr === "string" && captionFr !== "" ? captionFr : undefined,
      captionEn: typeof captionEn === "string" && captionEn !== "" ? captionEn : undefined,
    },
    redirectTo,
    auth.identity.email,
  );
  if ("notFound" in result) return new Response("Not found.", { status: 404 });
  return redirect(result.redirect);
};
