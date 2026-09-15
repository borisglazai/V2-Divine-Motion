/**
 * CMS Travail mutation logic (Implementation Brief 013), factored out of
 * the thin `src/pages/admin/work/**\/*.ts` endpoint files specifically so
 * it takes `db: D1Database` as an explicit parameter — same convention as
 * every function in `src/lib/db/`, and for the same reason: the only file
 * allowed to reach for the real Cloudflare binding is
 * `src/lib/db/client.ts` (`import { env } from "cloudflare:workers"`,
 * which only resolves inside an actual Workers/Miniflare runtime). Endpoint
 * `.ts` files import `getDb()` from there and are therefore only testable
 * through a real Worker (see tests/admin/routes.test.mjs); this module
 * imports neither, so `tests/admin/work-endpoints.test.ts` can call the
 * real business logic directly under plain `node --test`.
 *
 * Each action returns the redirect target as a plain string (or a
 * `{ notFound: true }` sentinel) — the endpoint wrapper is the only place
 * that calls Astro's `redirect()`/returns a 404 `Response`.
 */
import { getMedia } from "@/lib/db/media";
import * as work from "@/lib/db/work";
import { isValidLanguageStatus, isValidLocale, parseWorkItemForm } from "./validation";
import { buildFormRedirect } from "./formRedirect";
import { withFlash } from "./flash";
import { adminErrorMessage } from "./errors";

export type ActionResult = { redirect: string } | { notFound: true };

async function mediaIsUsable(db: D1Database, mediaId: number): Promise<boolean> {
  const referenced = await getMedia(db, mediaId);
  return !!referenced && referenced.deleted_at === null && referenced.processing_status === "ready";
}

export async function createWorkItemAction(
  db: D1Database,
  formData: FormData,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const parsed = parseWorkItemForm(formData);
  if (!parsed.ok) return { redirect: buildFormRedirect("/admin/work/new", parsed.errors, formData) };

  if (!(await mediaIsUsable(db, parsed.data.mediaId))) {
    return {
      redirect: buildFormRedirect(
        "/admin/work/new",
        { mediaId: "Ce média n'est pas disponible (supprimé ou non prêt)." },
        formData,
      ),
    };
  }

  const result = await work.createWorkItem(db, parsed.data, updatedBy);
  if (!result.ok) {
    return { redirect: buildFormRedirect("/admin/work/new", { form: adminErrorMessage(result.error) }, formData) };
  }

  return { redirect: withFlash(`/admin/work/${result.data.draftId}`, "success", "Brouillon créé.") };
}

export async function saveWorkItemAction(
  db: D1Database,
  idParam: number,
  formData: FormData,
  updatedBy: string,
): Promise<ActionResult> {
  const row = await work.getWorkItem(db, idParam);
  if (!row) return { notFound: true };

  const parsed = parseWorkItemForm(formData);
  if (!parsed.ok) return { redirect: buildFormRedirect(`/admin/work/${idParam}`, parsed.errors, formData) };

  if (!(await mediaIsUsable(db, parsed.data.mediaId))) {
    return {
      redirect: buildFormRedirect(
        `/admin/work/${idParam}`,
        { mediaId: "Ce média n'est pas disponible (supprimé ou non prêt)." },
        formData,
      ),
    };
  }

  let draftId: number;
  if (row.status === "draft") {
    draftId = row.id;
  } else {
    const existing = await work.getWorkItemDraft(db, row.id);
    if (existing) {
      draftId = existing.id;
    } else {
      const created = await work.createWorkItemDraft(db, row.id, updatedBy);
      if (!created.ok) {
        return { redirect: buildFormRedirect(`/admin/work/${idParam}`, { form: adminErrorMessage(created.error) }, formData) };
      }
      draftId = created.data.draftId;
    }
  }

  const updated = await work.updateWorkItemDraft(db, draftId, parsed.data, updatedBy);
  if (!updated.ok) {
    return { redirect: buildFormRedirect(`/admin/work/${idParam}`, { form: adminErrorMessage(updated.error) }, formData) };
  }

  return { redirect: withFlash(`/admin/work/${idParam}`, "success", "Brouillon enregistré.") };
}

export async function publishWorkItemAction(
  db: D1Database,
  draftId: number,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const result = await work.publishWorkItem(db, draftId, updatedBy);
  if (!result.ok) {
    return { redirect: withFlash(`/admin/work/${draftId}`, "error", adminErrorMessage(result.error)) };
  }
  return { redirect: withFlash(`/admin/work/${result.data.publishedId}`, "success", "Élément publié.") };
}

export async function deleteWorkItemDraftAction(db: D1Database, draftId: number): Promise<{ redirect: string }> {
  const row = await work.getWorkItem(db, draftId);
  const publishedId = row?.draft_of_id ?? null;

  const result = await work.deleteWorkItemDraft(db, draftId);
  if (!result.ok) {
    return { redirect: withFlash("/admin/work", "error", adminErrorMessage(result.error)) };
  }

  const destination = publishedId ? `/admin/work/${publishedId}` : "/admin/work";
  return { redirect: withFlash(destination, "success", "Brouillon supprimé.") };
}

export async function setWorkItemLanguageStatusAction(
  db: D1Database,
  publishedId: number,
  formData: FormData,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const locale = String(formData.get("locale") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!isValidLocale(locale) || !isValidLanguageStatus(status)) {
    return { redirect: withFlash(`/admin/work/${publishedId}`, "error", "Requête invalide.") };
  }

  const result = await work.setWorkItemLanguageStatus(db, publishedId, locale, status, updatedBy);
  if (!result.ok) {
    return { redirect: withFlash(`/admin/work/${publishedId}`, "error", adminErrorMessage(result.error)) };
  }

  return { redirect: withFlash(`/admin/work/${publishedId}`, "success", `Statut ${locale.toUpperCase()} mis à jour.`) };
}

export async function reorderWorkItemsAction(
  db: D1Database,
  formData: FormData,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const raw = formData.get("orderedIds");
  let orderedIds: number[];
  try {
    const parsed: unknown = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "number" && Number.isInteger(v))) {
      throw new Error("not an array of integers");
    }
    orderedIds = parsed;
  } catch {
    return { redirect: withFlash("/admin/work", "error", "Ordre invalide.") };
  }

  const result = await work.reorderWorkItemDrafts(db, orderedIds, updatedBy);
  if (!result.ok) {
    return { redirect: withFlash("/admin/work", "error", adminErrorMessage(result.error)) };
  }

  return {
    redirect: withFlash(
      "/admin/work",
      "success",
      "Nouvel ordre enregistré en brouillon — publiez chaque élément déplacé pour le rendre visible publiquement.",
    ),
  };
}
