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
    };
