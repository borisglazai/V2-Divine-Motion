/**
 * Témoignages CMS mutation logic — same shape as
 * src/lib/admin/work-actions.ts / services-actions.ts.
 */
import { getMedia } from "@/lib/db/media";
import * as testimonials from "@/lib/db/testimonials";
import { TESTIMONIAL_FORM_FIELDS, isValidLanguageStatus, isValidLocale, parseTestimonialForm } from "./testimonials-validation";
import { buildFormRedirect } from "./formRedirect";
import { withFlash } from "./flash";
import { adminErrorMessage } from "./errors";

export type ActionResult = { redirect: string } | { notFound: true };

/** Unlike Travail/Services, a testimonial's photo is optional — this only checks usability when one was actually selected. */
async function photoIsUsable(db: D1Database, photoMediaId: number | null): Promise<boolean> {
  if (photoMediaId === null) return true;
  const referenced = await getMedia(db, photoMediaId);
  return !!referenced && referenced.deleted_at === null && referenced.processing_status === "ready";
}

export async function createTestimonialAction(
  db: D1Database,
  formData: FormData,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const parsed = parseTestimonialForm(formData);
  if (!parsed.ok) return { redirect: buildFormRedirect("/admin/testimonials/new", parsed.errors, formData, TESTIMONIAL_FORM_FIELDS) };

  if (!(await photoIsUsable(db, parsed.data.photoMediaId))) {
    return {
      redirect: buildFormRedirect(
        "/admin/testimonials/new",
        { mediaId: "Ce média n'est pas disponible (supprimé ou non prêt)." },
        formData,
        TESTIMONIAL_FORM_FIELDS,
      ),
    };
  }

  const result = await testimonials.createTestimonial(
    db,
    {
      authorName: parsed.data.authorName,
      quoteFr: parsed.data.quoteFr,
      quoteEn: parsed.data.quoteEn,
      roleContextFr: parsed.data.roleContextFr,
      roleContextEn: parsed.data.roleContextEn,
      photoMediaId: parsed.data.photoMediaId,
      position: parsed.data.position,
      isVisible: parsed.data.isVisible,
    },
    updatedBy,
  );
  if (!result.ok) {
    return { redirect: buildFormRedirect("/admin/testimonials/new", { form: adminErrorMessage(result.error) }, formData, TESTIMONIAL_FORM_FIELDS) };
  }

  return { redirect: withFlash(`/admin/testimonials/${result.data.draftId}`, "success", "Brouillon créé.") };
}

export async function saveTestimonialAction(
  db: D1Database,
  idParam: number,
  formData: FormData,
  updatedBy: string,
): Promise<ActionResult> {
  const row = await testimonials.getTestimonial(db, idParam);
  if (!row) return { notFound: true };

  const parsed = parseTestimonialForm(formData);
  if (!parsed.ok) return { redirect: buildFormRedirect(`/admin/testimonials/${idParam}`, parsed.errors, formData, TESTIMONIAL_FORM_FIELDS) };

  if (!(await photoIsUsable(db, parsed.data.photoMediaId))) {
    return {
      redirect: buildFormRedirect(
        `/admin/testimonials/${idParam}`,
        { mediaId: "Ce média n'est pas disponible (supprimé ou non prêt)." },
        formData,
        TESTIMONIAL_FORM_FIELDS,
      ),
    };
  }

  let draftId: number;
  if (row.status === "draft") {
    draftId = row.id;
  } else {
    const existing = await testimonials.getTestimonialDraft(db, row.id);
    if (existing) {
      draftId = existing.id;
    } else {
      const created = await testimonials.createTestimonialDraft(db, row.id, updatedBy);
      if (!created.ok) {
        return { redirect: buildFormRedirect(`/admin/testimonials/${idParam}`, { form: adminErrorMessage(created.error) }, formData, TESTIMONIAL_FORM_FIELDS) };
      }
      draftId = created.data.draftId;
    }
  }

  const updated = await testimonials.updateTestimonialDraft(
    db,
    draftId,
    {
      authorName: parsed.data.authorName,
      quoteFr: parsed.data.quoteFr,
      quoteEn: parsed.data.quoteEn,
      roleContextFr: parsed.data.roleContextFr,
      roleContextEn: parsed.data.roleContextEn,
      photoMediaId: parsed.data.photoMediaId,
      position: parsed.data.position,
      isVisible: parsed.data.isVisible,
    },
    updatedBy,
  );
  if (!updated.ok) {
    return { redirect: buildFormRedirect(`/admin/testimonials/${idParam}`, { form: adminErrorMessage(updated.error) }, formData, TESTIMONIAL_FORM_FIELDS) };
  }

  return { redirect: withFlash(`/admin/testimonials/${idParam}`, "success", "Brouillon enregistré.") };
}

export async function publishTestimonialAction(
  db: D1Database,
  draftId: number,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const result = await testimonials.publishTestimonial(db, draftId, updatedBy);
  if (!result.ok) {
    return { redirect: withFlash(`/admin/testimonials/${draftId}`, "error", adminErrorMessage(result.error)) };
  }
  return { redirect: withFlash(`/admin/testimonials/${result.data.publishedId}`, "success", "Témoignage publié.") };
}

export async function deleteTestimonialDraftAction(db: D1Database, draftId: number): Promise<{ redirect: string }> {
  const row = await testimonials.getTestimonial(db, draftId);
  const publishedId = row?.draft_of_id ?? null;

  const result = await testimonials.deleteTestimonialDraft(db, draftId);
  if (!result.ok) {
    return { redirect: withFlash("/admin/testimonials", "error", adminErrorMessage(result.error)) };
  }

  const destination = publishedId ? `/admin/testimonials/${publishedId}` : "/admin/testimonials";
  return { redirect: withFlash(destination, "success", "Brouillon supprimé.") };
}

export async function setTestimonialLanguageStatusAction(
  db: D1Database,
  publishedId: number,
  formData: FormData,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const locale = String(formData.get("locale") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!isValidLocale(locale) || !isValidLanguageStatus(status)) {
    return { redirect: withFlash(`/admin/testimonials/${publishedId}`, "error", "Requête invalide.") };
  }

  const result = await testimonials.setTestimonialLanguageStatus(db, publishedId, locale, status, updatedBy);
  if (!result.ok) {
    return { redirect: withFlash(`/admin/testimonials/${publishedId}`, "error", adminErrorMessage(result.error)) };
  }

  return { redirect: withFlash(`/admin/testimonials/${publishedId}`, "success", `Statut ${locale.toUpperCase()} mis à jour.`) };
}

export async function reorderTestimonialsAction(
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
    return { redirect: withFlash("/admin/testimonials", "error", "Ordre invalide.") };
  }

  const result = await testimonials.reorderTestimonialDrafts(db, orderedIds, updatedBy);
  if (!result.ok) {
    return { redirect: withFlash("/admin/testimonials", "error", adminErrorMessage(result.error)) };
  }

  return {
    redirect: withFlash(
      "/admin/testimonials",
      "success",
      "Nouvel ordre enregistré en brouillon — publiez chaque élément déplacé pour le rendre visible publiquement.",
    ),
  };
}
