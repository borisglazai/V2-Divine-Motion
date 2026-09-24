import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { getMedia } from "@/lib/db/media";
import { updatePageSeo } from "@/lib/db/seo";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { parseSeoForm } from "@/lib/admin/seo-validation";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });
  const parsed = parseSeoForm(await request.formData());
  if (!parsed.ok) return redirect(withFlash("/admin/seo", "error", parsed.error));
  const db = getDb();
  if (parsed.data.ogMediaId) {
    const media = await getMedia(db, parsed.data.ogMediaId);
    if (!media || media.deleted_at || media.processing_status !== "ready" || !media.publication_rights_confirmed) {
      return redirect(withFlash("/admin/seo", "error", "L’image sociale doit être prête, active et avoir ses droits confirmés."));
    }
  }
  const result = await updatePageSeo(db, parsed.data.pageKey, parsed.data, auth.identity.email);
  if (!result.ok) return redirect(withFlash("/admin/seo", "error", "Impossible d’enregistrer les métadonnées SEO."));
  return redirect(withFlash("/admin/seo", "success", "Métadonnées SEO enregistrées."));
};
