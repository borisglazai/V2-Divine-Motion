import type { APIRoute } from "astro";
import { getDb } from "@/lib/db/client";
import { requireAdminMutation } from "@/lib/auth/mutation";
import { restoreMediaAction } from "@/lib/admin/media-actions";

export const prerender = false;

/** §34 — no hard-delete UI yet, so this is the only way back from the trash. */
export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const auth = requireAdminMutation(request, locals);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found.", { status: 404 });

  const result = await restoreMediaAction(getDb(), id);
  if ("notFound" in result) return new Response("Not found.", { status: 404 });
  return redirect(result.redirect);
};
