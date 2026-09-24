import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { updateSiteSettings } from "@/lib/db/settings";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { parseSettingsForm } from "@/lib/admin/settings-validation";
import { withFlash } from "@/lib/admin/flash";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });
  const parsed = parseSettingsForm(await request.formData());
  if (!parsed.ok) return redirect(withFlash("/admin/settings", "error", parsed.error));
  const result = await updateSiteSettings(getDb(), parsed.data, auth.identity.email);
  if (!result.ok) return redirect(withFlash("/admin/settings", "error", "Impossible d’enregistrer les paramètres."));
  return redirect(withFlash("/admin/settings", "success", "Paramètres enregistrés."));
};
