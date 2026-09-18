import type { PlaceholderPhotoKey } from "@/lib/placeholder-photos";

export interface GalleryImage {
  /**
   * Exactly one of `mediaKey`/`src` is set. `mediaKey` resolves through
   * `placeholderPhotos` (mock pages, unchanged). `src` is a direct URL —
   * real CMS-sourced media (Validation Brief 014S bug B:
   * `src/lib/work-gallery-adapter.ts` sets this via
   * `publicMediaFileUrl()`, never `placeholderPhotos`).
   */
  mediaKey?: PlaceholderPhotoKey;
  src?: string;
  ratio: string;
  alt: string;
  focalX?: number;
  focalY?: number;
  /**
   * Extremely discreet metadata (e.g. "MARIAGE — MONTRÉAL"), shown only
   * when set — absent by default (Implementation Brief 003, section 14).
   * No current item sets this; the field exists for later curation.
   */
  caption?: string;
}

/**
 * A closed set of composition blocks, not a page-builder layout engine
 * (section 11/26): the page is still a fixed sequence controlled by the
 * frontend, just expressed as data so a future CMS can drive the same
 * shapes without touching WorkGallery.astro.
 */
export type GalleryBlock =
  | { type: "full"; image: GalleryImage }
  | { type: "centered"; image: GalleryImage }
  | { type: "large"; image: GalleryImage }
  | { type: "offset"; side: "left" | "right"; image: GalleryImage }
  | {
      type: "duo";
      left: GalleryImage;
      right: GalleryImage;
      split?: "even" | "left-heavy" | "right-heavy";
    }
  | {
      /**
       * Visual Editor Phase 2 — a close row of 3 images, added for the
       * "Story" gallery layout (src/lib/work-gallery-layouts.ts). Same
       * rule as every other block here: a fixed shape the frontend owns,
       * never a free arrangement — one more primitive in the closed set,
       * not a step toward a page builder.
       */
      type: "trio";
      images: [GalleryImage, GalleryImage, GalleryImage];
    };

/**
 * Visual Editor Phase 4 (Boris's audit §5, validated with guardrails) —
 * the SHAPE half of `GalleryBlock`, with the image payload stripped out.
 * This is what `GalleryBlockFrame.astro` actually needs to reproduce the
 * public composition's exact geometry (margins/widths/flex-splits per
 * breakpoint — see WorkGallery.astro's CSS, moved there unchanged) for
 * BOTH the public gallery (WorkGallery.astro, passing a real `GalleryBlock`
 * — its extra image fields are simply ignored by structural typing) and
 * the admin editor (TravailGalleryEditor.astro, mapping its own
 * `GallerySlotShape` — src/lib/work-gallery-layouts.ts — onto this same
 * shape vocabulary, `block` renamed to `type`). Never the other way
 * around: this file (public-facing, no admin concept) is the one shape
 * vocabulary both sides map onto, not something owned by the admin layer.
 */
export type GalleryBlockShape =
  | { type: "full" }
  | { type: "centered" }
  | { type: "large" }
  | { type: "offset"; side: "left" | "right" }
  | { type: "duo"; split?: "even" | "left-heavy" | "right-heavy" }
  | { type: "trio" };
