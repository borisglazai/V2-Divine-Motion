/**
 * Services CMS mutation logic — same shape as src/lib/admin/work-actions.ts
 * (Implementation Brief 013), for the same reason: takes `db: D1Database`
 * explicitly so tests/admin/services-endpoints.test.ts can call the real
 * business logic directly under plain `node --test`, without a Worker.
 */
import { getMedia } from "@/lib/db/media";
import * as services from "@/lib/db/services";
import { SERVICE_FORM_FIELDS, isValidLanguageStatus, isValidLocale, parseServiceFeatures, parseServiceForm } from "./services-validation";
import { buildFormRedirect } from "./formRedirect";
import { withFlash } from "./flash";
import { adminErrorMessage } from "./errors";

export type ActionResult = { redirect: string } | { notFound: true };

async function mediaIsUsable(db: D1Database, mediaId: number): Promise<boolean> {
  const referenced = await getMedia(db, mediaId);
  return !!referenced && referenced.deleted_at === null && referenced.processing_status === "ready";
}

export async function createServiceAction(
  db: D1Database,
  formData: FormData,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const parsed = parseServiceForm(formData);
  if (!parsed.ok) return { redirect: buildFormRedirect("/admin/services/new", parsed.errors, formData, SERVICE_FORM_FIELDS) };

  if (!(await mediaIsUsable(db, parsed.data.mediaId))) {
    return {
      redirect: buildFormRedirect(
        "/admin/services/new",
        { mediaId: "Ce média n'est pas disponible (supprimé ou non prêt)." },
        formData,
        SERVICE_FORM_FIELDS,
      ),
    };
  }

  const features = parseServiceFeatures(formData);
  const result = await services.createService(db, parsed.data, features, updatedBy);
  if (!result.ok) {
    return { redirect: buildFormRedirect("/admin/services/new", { form: adminErrorMessage(result.error) }, formData, SERVICE_FORM_FIELDS) };
  }

  return { redirect: withFlash(`/admin/services/${result.data.draftId}`, "success", "Brouillon créé.") };
}

export async function saveServiceAction(
  db: D1Database,
  idParam: number,
  formData: FormData,
  updatedBy: string,
): Promise<ActionResult> {
  const row = await services.getService(db, idParam);
  if (!row) return { notFound: true };

  const parsed = parseServiceForm(formData);
  if (!parsed.ok) return { redirect: buildFormRedirect(`/admin/services/${idParam}`, parsed.errors, formData, SERVICE_FORM_FIELDS) };

  if (!(await mediaIsUsable(db, parsed.data.mediaId))) {
    return {
      redirect: buildFormRedirect(
        `/admin/services/${idParam}`,
        { mediaId: "Ce média n'est pas disponible (supprimé ou non prêt)." },
        formData,
        SERVICE_FORM_FIELDS,
      ),
    };
  }

  let draftId: number;
  if (row.status === "draft") {
    draftId = row.id;
  } else {
    const existing = await services.getServiceDraft(db, row.id);
    if (existing) {
      draftId = existing.id;
    } else {
      const created = await services.createServiceDraft(db, row.id, updatedBy);
      if (!created.ok) {
        return { redirect: buildFormRedirect(`/admin/services/${idParam}`, { form: adminErrorMessage(created.error) }, formData, SERVICE_FORM_FIELDS) };
      }
      draftId = created.data.draftId;
    }
  }

  const updated = await services.updateServiceDraft(db, draftId, parsed.data, updatedBy);
  if (!updated.ok) {
    return { redirect: buildFormRedirect(`/admin/services/${idParam}`, { form: adminErrorMessage(updated.error) }, formData, SERVICE_FORM_FIELDS) };
  }

  const features = parseServiceFeatures(formData);
  await services.updateServiceDraftFeatures(db, draftId, features);

  return { redirect: withFlash(`/admin/services/${idParam}`, "success", "Brouillon enregistré.") };
}

export async function publishServiceAction(
  db: D1Database,
  draftId: number,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const result = await services.publishService(db, draftId, updatedBy);
  if (!result.ok) {
    return { redirect: withFlash(`/admin/services/${draftId}`, "error", adminErrorMessage(result.error)) };
  }
  return { redirect: withFlash(`/admin/services/${result.data.publishedId}`, "success", "Service publié.") };
}

export async function deleteServiceDraftAction(db: D1Database, draftId: number): Promise<{ redirect: string }> {
  const row = await services.getService(db, draftId);
  const publishedId = row?.draft_of_id ?? null;

  const result = await services.deleteServiceDraft(db, draftId);
  if (!result.ok) {
    return { redirect: withFlash("/admin/services", "error", adminErrorMessage(result.error)) };
  }

  const destination = publishedId ? `/admin/services/${publishedId}` : "/admin/services";
  return { redirect: withFlash(destination, "success", "Brouillon supprimé.") };
}

export async function setServiceLanguageStatusAction(
  db: D1Database,
  publishedId: number,
  formData: FormData,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const locale = String(formData.get("locale") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!isValidLocale(locale) || !isValidLanguageStatus(status)) {
    return { redirect: withFlash(`/admin/services/${publishedId}`, "error", "Requête invalide.") };
  }

  const result = await services.setServiceLanguageStatus(db, publishedId, locale, status, updatedBy);
  if (!result.ok) {
    return { redirect: withFlash(`/admin/services/${publishedId}`, "error", adminErrorMessage(result.error)) };
  }

  return { redirect: withFlash(`/admin/services/${publishedId}`, "success", `Statut ${locale.toUpperCase()} mis à jour.`) };
}

export async function reorderServicesAction(
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
    return { redirect: withFlash("/admin/services", "error", "Ordre invalide.") };
  }

  const result = await services.reorderServiceDrafts(db, orderedIds, updatedBy);
  if (!result.ok) {
    return { redirect: withFlash("/admin/services", "error", adminErrorMessage(result.error)) };
  }

  return {
    redirect: withFlash(
      "/admin/services",
      "success",
      "Nouvel ordre enregistré en brouillon — publiez chaque élément déplacé pour le rendre visible publiquement.",
    ),
  };
}
