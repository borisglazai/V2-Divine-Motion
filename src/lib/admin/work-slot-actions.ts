/**
 * Éditeur visuel Phase 2 — per-slot mutation logic for the in-place
 * Travail gallery editor (src/components/admin/GallerySlot.astro).
 * Deliberately NOT a reuse of work-actions.ts's saveWorkItemAction: that
 * one validates and writes the FULL work_items field set (category,
 * ratio, focal point, visibility, featured) through WorkItemForm.astro —
 * appropriate for /admin/work's structured CMS, too heavy for an inline
 * slot whose only job is "swap the image, tweak the caption" (Boris's
 * brief: "pas de redirection forcée vers /admin/work pour des opérations
 * simples ; /admin/work reste disponible comme CMS structuré avancé" —
 * advanced fields stay there). Same DAL (src/lib/db/work.ts) underneath,
 * same draft/publish rules, just a narrower field set and a redirect back
 * to the Travail editor instead of to /admin/work/:id.
 *
 * Alt text (accessibility) is the one field this module NEVER writes for
 * an EXISTING item — Boris's explicit instruction: never invent alt text.
 * `saveWorkSlotAction` only ever touches media/captions on an existing
 * item. `createWorkSlotItemAction` (a brand-new item, filling a
 * previously empty slot) is the one place alt FR/EN is set — always typed
 * by the admin in that same action, never defaulted or copied from
 * elsewhere (createWorkItem's own hard `altFr`/`altEn` requirement is the
 * backstop).
 */
import { getMedia } from "@/lib/db/media";
import * as work from "@/lib/db/work";
import { isValidLocale } from "./validation";
import { withFlash } from "./flash";
import { adminErrorMessage } from "./errors";

async function mediaIsUsable(db: D1Database, mediaId: number): Promise<boolean> {
  const referenced = await getMedia(db, mediaId);
  return !!referenced && referenced.deleted_at === null && referenced.processing_status === "ready";
}

export interface WorkSlotFields {
  mediaId: number;
  captionFr?: string;
  captionEn?: string;
}

/**
 * "slot occupé → créer/modifier le draft du work_item existant" (Boris).
 * `id` is whatever src/lib/db/work.ts's listWorkItemsForAdminGallery
 * handed back for this slot — the published id when one exists, or the
 * standalone draft's own id for an item created earlier this phase but
 * never yet published. Same branching saveWorkItemAction already uses for
 * that same ambiguity.
 */
export async function saveWorkSlotAction(
  db: D1Database,
  id: number,
  fields: WorkSlotFields,
  redirectTo: string,
  updatedBy: string,
): Promise<{ redirect: string } | { notFound: true }> {
  const row = await work.getWorkItem(db, id);
  if (!row) return { notFound: true };

  if (!(await mediaIsUsable(db, fields.mediaId))) {
    return { redirect: withFlash(redirectTo, "error", "Ce média n'est pas disponible (supprimé ou non prêt).") };
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
      if (!created.ok) return { redirect: withFlash(redirectTo, "error", adminErrorMessage(created.error)) };
      draftId = created.data.draftId;
    }
  }

  const updated = await work.updateWorkItemDraft(
    db,
    draftId,
    { mediaId: fields.mediaId, captionFr: fields.captionFr ?? null, captionEn: fields.captionEn ?? null },
    updatedBy,
  );
  if (!updated.ok) return { redirect: withFlash(redirectTo, "error", adminErrorMessage(updated.error)) };

  return { redirect: withFlash(redirectTo, "success", "Emplacement enregistré (brouillon).") };
}

export async function publishWorkSlotAction(db: D1Database, draftId: number, redirectTo: string, updatedBy: string): Promise<{ redirect: string }> {
  const result = await work.publishWorkItem(db, draftId, updatedBy);
  if (!result.ok) return { redirect: withFlash(redirectTo, "error", adminErrorMessage(result.error)) };
  return { redirect: withFlash(redirectTo, "success", "Élément publié.") };
}

export async function setWorkSlotLanguageStatusAction(
  db: D1Database,
  publishedId: number,
  locale: string,
  status: string,
  redirectTo: string,
  updatedBy: string,
): Promise<{ redirect: string }> {
  if (!isValidLocale(locale) || (status !== "draft" && status !== "published")) {
    return { redirect: withFlash(redirectTo, "error", "Requête invalide.") };
  }
  const result = await work.setWorkItemLanguageStatus(db, publishedId, locale, status, updatedBy);
  if (!result.ok) return { redirect: withFlash(redirectTo, "error", adminErrorMessage(result.error)) };
  return { redirect: withFlash(redirectTo, "success", `Statut ${locale.toUpperCase()} mis à jour.`) };
}

export interface NewWorkSlotFields {
  position: number;
  ratio: string;
  mediaId: number;
  altFr: string;
  altEn: string;
  captionFr?: string;
  captionEn?: string;
}

/**
 * "slot vide → permettre 'Ajouter une photo', puis créer le nouveau
 * work_item correspondant à cette position" (Boris). `position` comes
 * straight from the empty AdminSlotEntry the caller rendered
 * (src/lib/work-gallery-adapter.ts's buildAdminGallerySlots) — always
 * `max(existing positions) + 1` at the time that slot list was built, so
 * this never needs to recompute it itself.
 */
export async function createWorkSlotItemAction(
  db: D1Database,
  fields: NewWorkSlotFields,
  redirectTo: string,
  updatedBy: string,
): Promise<{ redirect: string }> {
  if (!fields.altFr.trim() || !fields.altEn.trim()) {
    return { redirect: withFlash(redirectTo, "error", "Texte alternatif FR et EN requis (accessibilité) — non inventé, à compléter.") };
  }
  if (!(await mediaIsUsable(db, fields.mediaId))) {
    return { redirect: withFlash(redirectTo, "error", "Ce média n'est pas disponible (supprimé ou non prêt).") };
  }

  const result = await work.createWorkItem(
    db,
    {
      mediaId: fields.mediaId,
      position: fields.position,
      ratio: fields.ratio,
      altFr: fields.altFr,
      altEn: fields.altEn,
      captionFr: fields.captionFr ?? null,
      captionEn: fields.captionEn ?? null,
      isVisible: true,
    },
    updatedBy,
  );
  if (!result.ok) return { redirect: withFlash(redirectTo, "error", adminErrorMessage(result.error)) };

  return { redirect: withFlash(redirectTo, "success", "Photo ajoutée (brouillon) — publiez-la pour la rendre visible.") };
}
