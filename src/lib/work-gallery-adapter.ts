/**
 * Real CMS Travail data -> GalleryBlock[] — Validation Brief 014S bug B,
 * rewritten for Éditeur visuel Phase 2's named layouts
 * (src/lib/work-gallery-layouts.ts).
 *
 * `WorkGallery.astro` itself is untouched (it already only knows how to
 * render a `GalleryBlock[]`, by design). This is that adapter, now driven
 * by `work_page_content.gallery_layout` instead of a per-item ratio
 * heuristic: the admin picks ONE of 3 fixed, code-owned compositions
 * (Editorial/Story/Minimal — ADR-014's addendum), and this file assigns
 * real, ordered `work_items` into that layout's slot sequence, cycling it
 * when there are more items than one cycle consumes.
 *
 * Two entry points:
 *  - `buildGalleryFromWorkItems` — the PUBLIC read. Only ever emits fully
 *    filled blocks; any partial trailing slot (not enough items left to
 *    fill it) is silently dropped, never shown half-empty.
 *  - `buildAdminGallerySlots` — the ADMIN read (Travail editor). Same
 *    cycling, but always keeps at least one trailing EMPTY slot visible so
 *    "Ajouter une photo" is always reachable — Boris's explicit Phase 2
 *    requirement: "un slot vide reste visuellement présent avec son
 *    ratio/orientation attendue."
 */
import type { Locale } from "@/i18n/routes";
import type { WorkGalleryLayout, WorkItemRow } from "@/lib/db/types";
import type { GalleryBlock, GalleryImage } from "@/lib/gallery-blocks";
import { GALLERY_LAYOUTS, slotsImageCount, type GalleryLayoutDefinition, type GallerySlotShape, type SlotImageShape } from "@/lib/work-gallery-layouts";
import { publicMediaFileUrl } from "@/lib/public-media";

function imageFromWorkItem(item: WorkItemRow, locale: Locale): GalleryImage {
  return {
    src: publicMediaFileUrl(item.media_id),
    ratio: item.ratio,
    alt: locale === "fr" ? item.alt_fr : item.alt_en,
    focalX: item.focal_x,
    focalY: item.focal_y,
    caption: (locale === "fr" ? item.caption_fr : item.caption_en) ?? undefined,
  };
}

function slotToBlock(slot: GallerySlotShape, images: GalleryImage[]): GalleryBlock {
  switch (slot.block) {
    case "full":
      return { type: "full", image: images[0] };
    case "centered":
      return { type: "centered", image: images[0] };
    case "large":
      return { type: "large", image: images[0] };
    case "offset":
      return { type: "offset", side: slot.side, image: images[0] };
    case "duo":
      return { type: "duo", left: images[0], right: images[1], split: slot.split };
    case "trio":
      return { type: "trio", images: [images[0], images[1], images[2]] };
  }
}

function cycledSlots(layout: GalleryLayoutDefinition, cycles: number): GallerySlotShape[] {
  const out: GallerySlotShape[] = [];
  for (let i = 0; i < cycles; i++) out.push(...layout.slots);
  return out;
}

/** Public Travail page read — `listPublishedWorkItems(db, locale)` already gives real, ordered, live items; this only shapes them. */
export function buildGalleryFromWorkItems(items: WorkItemRow[], locale: Locale, layoutId: WorkGalleryLayout): GalleryBlock[] {
  if (items.length === 0) return [];
  const layout = GALLERY_LAYOUTS[layoutId];
  const cycleLen = slotsImageCount(layout);
  const cycles = Math.ceil(items.length / cycleLen);
  const slots = cycledSlots(layout, cycles);

  const blocks: GalleryBlock[] = [];
  let cursor = 0;
  for (const slot of slots) {
    const need = slot.images.length;
    if (cursor + need > items.length) break; // partial slot — never shown publicly
    const images = items.slice(cursor, cursor + need).map((item) => imageFromWorkItem(item, locale));
    blocks.push(slotToBlock(slot, images));
    cursor += need;
  }
  return blocks;
}

export interface AdminSlotEntry {
  /** The real, published work_item occupying this position, or null when the slot is empty. */
  item: WorkItemRow | null;
  /** Expected ratio/orientation for this position — shown even when `item` is null, so an empty slot keeps its shape (e.g. "16:9 — Paysage" / "Ajouter une photo"). */
  expectedShape: SlotImageShape;
  /**
   * The `work_items.position` this entry corresponds to. For an occupied
   * entry it's the item's own real position; for an empty one it's the
   * position a new item created here would get
   * (`max(existing positions) + 1`, incremented per empty entry since
   * admin empty slots are always trailing in the ordered sequence).
   */
  position: number;
}

export interface AdminGallerySlot {
  shape: GallerySlotShape;
  entries: AdminSlotEntry[];
}

/**
 * Admin Travail editor read — `listAllWorkItems`-derived, ordered by
 * position, already filtered by the caller to the items that belong on
 * this page (Phase 2 doesn't change what counts as "belongs on Travail":
 * still every work_item, admin sees drafts too via getWorkItemDraft per
 * item at render time, this function only decides slot shape/position).
 */
export function buildAdminGallerySlots(items: WorkItemRow[], layoutId: WorkGalleryLayout): AdminGallerySlot[] {
  const layout = GALLERY_LAYOUTS[layoutId];
  const cycleLen = slotsImageCount(layout);
  const itemCount = items.length;

  let cycles = Math.max(1, Math.ceil(itemCount / cycleLen));
  if (itemCount > 0 && itemCount % cycleLen === 0) {
    // Items exactly fill N whole cycles — nothing trailing empty yet, so
    // add one more full cycle purely so "Ajouter une photo" stays reachable.
    cycles += 1;
  }
  const slots = cycledSlots(layout, cycles);

  const maxPosition = items.reduce((max, item) => Math.max(max, item.position), 0);
  let nextNewPosition = maxPosition + 1;

  const result: AdminGallerySlot[] = [];
  let cursor = 0;
  for (const slot of slots) {
    const entries: AdminSlotEntry[] = slot.images.map((expectedShape) => {
      const item = cursor < items.length ? items[cursor] : null;
      const position = item ? item.position : nextNewPosition;
      if (!item) nextNewPosition += 1;
      cursor += 1;
      return { item, expectedShape, position };
    });
    result.push({ shape: slot, entries });
  }
  return result;
}
