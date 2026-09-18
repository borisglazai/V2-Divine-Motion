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
 * Alt text (accessibility) is never INVENTED by this module — Boris's
 * explicit instruction. `createWorkSlotItemAction` (a brand-new item,
 * filling a previously empty slot) always requires the admin to type it,
 * only ever pre-filled client-side from the picked media's own alt when
 * one exists (EditorToolbar.astro's media picker, never server-side).
 * Éditeur visuel Phase 3 (Boris's brief §2/§11) also lets the admin EDIT
 * an existing item's already-set alt from `saveWorkSlotAction` — that's
 * normal curation, not invention: the field is always pre-filled with the
 * item's current value in GallerySlot.astro, so it's never blanked or
 * defaulted, only ever the admin's own (possibly unchanged) typed text.
 */
import { getMedia } from "@/lib/db/media";
import * as work from "@/lib/db/work";
import type { WorkItemRow } from "@/lib/db/types";
import { isValidLocale } from "./validation";
import { withFlash } from "./flash";
import { adminErrorMessage } from "./errors";

async function mediaIsUsable(db: D1Database, mediaId: number): Promise<boolean> {
  const referenced = await getMedia(db, mediaId);
  return !!referenced && referenced.deleted_at === null && referenced.processing_status === "ready";
}

export interface WorkSlotFields {
  mediaId: number;
  altFr: string;
  altEn: string;
  captionFr?: string;
  captionEn?: string;
  focalX?: number;
  focalY?: number;
}

/**
 * Resolves (creating if necessary) the open draft for an existing slot's
 * work_item, exactly the branching every slot mutation on an EXISTING item
 * needs (occupied-slot save, Retirer/Remettre, Précédent/Suivant already
 * has its own bulk version in work.reorderWorkItemDrafts). `id` is
 * whatever src/lib/db/work.ts's listWorkItemsForAdminGallery handed back
 * for this slot — the published id when one exists, or the standalone
 * draft's own id for an item created earlier this phase but never yet
 * published.
 */
async function resolveDraftId(db: D1Database, row: WorkItemRow, updatedBy: string): Promise<{ draftId: number } | { error: string }> {
  if (row.status === "draft") return { draftId: row.id };
  const existing = await work.getWorkItemDraft(db, row.id);
  if (existing) return { draftId: existing.id };
  const created = await work.createWorkItemDraft(db, row.id, updatedBy);
  if (!created.ok) return { error: adminErrorMessage(created.error) };
  return { draftId: created.data.draftId };
}

/**
 * "slot occupé → créer/modifier le draft du work_item existant" (Boris).
 * Éditeur visuel Phase 3: alt FR/EN and the focal point are now editable
 * here too (Boris's brief §2/§10/§11) — always the admin's own typed/
 * clicked value, prefilled from the item's CURRENT alt/focal in
 * GallerySlot.astro, never invented or defaulted by this action itself.
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

  if (!fields.altFr.trim() || !fields.altEn.trim()) {
    return { redirect: withFlash(redirectTo, "error", "Texte alternatif FR et EN requis (accessibilité) — non inventé, à compléter.") };
  }
  if (!(await mediaIsUsable(db, fields.mediaId))) {
    return { redirect: withFlash(redirectTo, "error", "Ce média n'est pas disponible (supprimé ou non prêt).") };
  }

  const resolved = await resolveDraftId(db, row, updatedBy);
  if ("error" in resolved) return { redirect: withFlash(redirectTo, "error", resolved.error) };

  const updated = await work.updateWorkItemDraft(
    db,
    resolved.draftId,
    {
      mediaId: fields.mediaId,
      altFr: fields.altFr,
      altEn: fields.altEn,
      captionFr: fields.captionFr ?? null,
      captionEn: fields.captionEn ?? null,
      focalX: fields.focalX,
      focalY: fields.focalY,
    },
    updatedBy,
  );
  if (!updated.ok) return { redirect: withFlash(redirectTo, "error", adminErrorMessage(updated.error)) };

  return { redirect: withFlash(redirectTo, "success", "Emplacement enregistré (brouillon).") };
}

/**
 * "Retirer" / "Remettre" (Boris's brief §4) — acts ONLY on the work_item's
 * `is_visible` flag, through the exact same draft mechanism as every other
 * slot edit (never an auto-publish: an admin still has to hit "Publier cet
 * élément" to take it live, same rule as media/caption/alt/focal changes).
 * Never touches R2 or deletes the work_item row — the media stays fully
 * intact either way, and "Remettre" is always available afterwards.
 */
export async function setWorkSlotVisibilityAction(
  db: D1Database,
  id: number,
  isVisible: boolean,
  redirectTo: string,
  updatedBy: string,
): Promise<{ redirect: string } | { notFound: true }> {
  const row = await work.getWorkItem(db, id);
  if (!row) return { notFound: true };

  const resolved = await resolveDraftId(db, row, updatedBy);
  if ("error" in resolved) return { redirect: withFlash(redirectTo, "error", resolved.error) };

  const updated = await work.updateWorkItemDraft(db, resolved.draftId, { isVisible }, updatedBy);
  if (!updated.ok) return { redirect: withFlash(redirectTo, "error", adminErrorMessage(updated.error)) };

  return {
    redirect: withFlash(
      redirectTo,
      "success",
      isVisible
        ? "Élément remis (brouillon) — publiez-le pour le rendre à nouveau visible."
        : "Élément retiré (brouillon) — le média n'est pas supprimé ; publiez pour appliquer au site public.",
    ),
  };
}

export type WorkSlotMoveDirection = "prev" | "next";

/**
 * "Précédent / Suivant" (Boris's brief §5 — explicitly NOT drag-and-drop,
 * validated orientation). Only ever swaps two ADJACENT items' own
 * position values in the current admin display order (already draft-
 * position-aware — see work.listWorkItemsForAdminGallery), each through
 * its own draft — draft-only, never touches the public site until an
 * explicit Publish, same as every other slot edit.
 *
 * Deliberately NOT built on work.reorderWorkItemDrafts: that function
 * renumbers EVERY id it's given to a dense 1..N sequence, which is exactly
 * right for /admin/work's full drag-list reorder UI (the client always
 * submits the complete, freshly-rendered order) but wrong here — feeding
 * it the WHOLE reorderable catalog just to swap two neighbors would open a
 * draft for every published work_item and leave any of them left
 * unpublished stranded at its old, wildly different position value while
 * only the two actually-intended items jump to the new dense scale
 * (reorderWorkItemDrafts's own documented non-atomicity, needlessly
 * widened to the entire gallery). Swapping the two items' own current
 * position values directly keeps the blast radius to exactly the two
 * items Précédent/Suivant is about — everyone else's position, published
 * or already-drafted elsewhere, is left completely untouched.
 *
 * A brand-new, never-published item (isNewDraft) has no place in that
 * published-only sequence yet, so it's excluded from the reorder set
 * entirely — it must be published once before it can be moved.
 */
export async function moveWorkSlotAction(
  db: D1Database,
  workItemId: number,
  direction: WorkSlotMoveDirection,
  redirectTo: string,
  updatedBy: string,
): Promise<{ redirect: string }> {
  const { items, meta } = await work.listWorkItemsForAdminGallery(db);
  const reorderable = items.filter((item) => !meta.get(item.id)?.isNewDraft);
  const index = reorderable.findIndex((item) => item.id === workItemId);
  if (index === -1) {
    return { redirect: withFlash(redirectTo, "error", "Élément introuvable, ou pas encore publié — publiez-le avant de le réordonner.") };
  }

  const swapWith = direction === "prev" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= reorderable.length) {
    return { redirect: withFlash(redirectTo, "success", "Déjà à cette extrémité de la galerie.") };
  }

  // `items` is the merged, draft-aware read — its own `status` field can
  // read 'draft' for an occupied, published-backed entry (it's the DRAFT
  // row's status, carried over by the merge). Re-fetching the raw row by
  // id is what resolveDraftId actually needs: a row whose `status` truly
  // describes the row AT THAT id, exactly the same pattern
  // saveWorkSlotAction/setWorkSlotVisibilityAction already use.
  const current = reorderable[index];
  const neighbor = reorderable[swapWith];
  const [currentRow, neighborRow] = await Promise.all([work.getWorkItem(db, current.id), work.getWorkItem(db, neighbor.id)]);
  if (!currentRow || !neighborRow) {
    return { redirect: withFlash(redirectTo, "error", "Élément introuvable.") };
  }

  const resolvedCurrent = await resolveDraftId(db, currentRow, updatedBy);
  if ("error" in resolvedCurrent) return { redirect: withFlash(redirectTo, "error", resolvedCurrent.error) };
  const resolvedNeighbor = await resolveDraftId(db, neighborRow, updatedBy);
  if ("error" in resolvedNeighbor) return { redirect: withFlash(redirectTo, "error", resolvedNeighbor.error) };

  // Swap the EFFECTIVE (draft-aware) positions read from `items` — not the
  // raw rows' own position — so a second move before publishing the first
  // one keeps building on what's currently displayed, never on stale
  // published values.
  const updatedCurrent = await work.updateWorkItemDraft(db, resolvedCurrent.draftId, { position: neighbor.position }, updatedBy);
  if (!updatedCurrent.ok) return { redirect: withFlash(redirectTo, "error", adminErrorMessage(updatedCurrent.error)) };
  const updatedNeighbor = await work.updateWorkItemDraft(db, resolvedNeighbor.draftId, { position: current.position }, updatedBy);
  if (!updatedNeighbor.ok) return { redirect: withFlash(redirectTo, "error", adminErrorMessage(updatedNeighbor.error)) };

  return { redirect: withFlash(redirectTo, "success", "Ordre mis à jour (brouillon) — publiez pour appliquer au site public.") };
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
