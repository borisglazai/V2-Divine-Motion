/**
 * Éditeur visuel Phase 2 — the 3 named portfolio compositions (Boris's
 * brief: "template-driven editorial gallery builder", not a page
 * builder). Each layout is a FIXED sequence of slot shapes, built from
 * the same closed set of primitives WorkGallery.astro already renders
 * (full/centered/large/offset/duo/trio — see src/lib/gallery-blocks.ts).
 *
 * This file only describes SHAPE (which block, how many images, what
 * ratio/orientation each expects) — never real content. The admin's only
 * choice is WHICH of these 3 to use (`work_page_content.gallery_layout`,
 * migrations/0006); the shapes themselves are exactly as fixed and
 * code-owned as the per-image full/centered/duo assignment was before
 * this phase — see docs/decisions/ADR-014's addendum for the full
 * reasoning.
 *
 * `src/lib/work-gallery-adapter.ts` is what actually assigns real
 * `work_items` (ordered by position) into these slots, cycling the
 * sequence when there are more items than one cycle needs.
 */
import type { WorkGalleryLayout } from "./db/types";

export interface SlotImageShape {
  /** "W/H" — same convention as work_items.ratio (migrations/0001_initial.sql). */
  ratio: string;
  /** Human-readable, shown in the admin editor — e.g. "16:9 — Paysage". */
  ratioLabel: string;
  orientation: "landscape" | "portrait" | "square";
}

export type GallerySlotShape =
  | { block: "full"; images: [SlotImageShape] }
  | { block: "centered"; images: [SlotImageShape] }
  | { block: "large"; images: [SlotImageShape] }
  | { block: "offset"; side: "left" | "right"; images: [SlotImageShape] }
  | { block: "duo"; split: "even" | "left-heavy" | "right-heavy"; images: [SlotImageShape, SlotImageShape] }
  | { block: "trio"; images: [SlotImageShape, SlotImageShape, SlotImageShape] };

export interface GalleryLayoutDefinition {
  id: WorkGalleryLayout;
  label: string;
  description: string;
  slots: GallerySlotShape[];
}

const LANDSCAPE_WIDE: SlotImageShape = { ratio: "3/2", ratioLabel: "3:2 — Paysage", orientation: "landscape" };
const PANORAMIC: SlotImageShape = { ratio: "21/9", ratioLabel: "21:9 — Panoramique", orientation: "landscape" };
const PORTRAIT: SlotImageShape = { ratio: "4/5", ratioLabel: "4:5 — Portrait", orientation: "portrait" };

export const GALLERY_LAYOUTS: Record<WorkGalleryLayout, GalleryLayoutDefinition> = {
  editorial: {
    id: "editorial",
    label: "Editorial",
    description: "Grande image, deux portraits, grande image, duo asymétrique.",
    slots: [
      { block: "large", images: [LANDSCAPE_WIDE] },
      { block: "duo", split: "even", images: [PORTRAIT, PORTRAIT] },
      { block: "large", images: [LANDSCAPE_WIDE] },
      { block: "duo", split: "left-heavy", images: [LANDSCAPE_WIDE, PORTRAIT] },
    ],
  },
  story: {
    id: "story",
    label: "Story",
    description: "Hero large, portrait + paysage, trio, grande finale.",
    slots: [
      { block: "full", images: [PANORAMIC] },
      { block: "duo", split: "left-heavy", images: [PORTRAIT, LANDSCAPE_WIDE] },
      { block: "trio", images: [PORTRAIT, PORTRAIT, PORTRAIT] },
      { block: "full", images: [PANORAMIC] },
    ],
  },
  minimal: {
    id: "minimal",
    label: "Minimal",
    description: "Grande image, duo, grande image, duo.",
    slots: [
      { block: "large", images: [LANDSCAPE_WIDE] },
      { block: "duo", split: "even", images: [PORTRAIT, PORTRAIT] },
      { block: "large", images: [LANDSCAPE_WIDE] },
      { block: "duo", split: "even", images: [PORTRAIT, PORTRAIT] },
    ],
  },
};

/** Total images one full cycle of a layout consumes — e.g. Editorial = 6, Story = 7. */
export function slotsImageCount(layout: GalleryLayoutDefinition): number {
  return layout.slots.reduce((sum, slot) => sum + slot.images.length, 0);
}
