/**
 * Real CMS Travail data -> GalleryBlock[] — Validation Brief 014S bug B.
 *
 * `WorkGallery.astro` itself is untouched (it already only knows how to
 * render a `GalleryBlock[]`, by design — see gallery-blocks.ts's own
 * header comment: "so a future CMS can drive the same shapes without
 * touching WorkGallery.astro"). This is that adapter.
 *
 * Per ADR-014 ("Travail et Services : la présentation non éditable reste
 * dans le frontend, jamais en D1"), the composition (full/centered/large/
 * offset/duo) is a frontend decision computed from position/count/ratio —
 * never stored in D1. This is a deliberately minimal first implementation
 * of that rule: each published work item becomes its own single-image
 * block, `full` for a wide/panoramic ratio and `centered` otherwise. It
 * does NOT attempt automatic `duo` pairing or `offset`/`large` placement —
 * those need real curatorial judgment (which items pair well, where
 * asymmetry reads intentional) that this bug fix has no basis to invent.
 * That richer composition rule remains explicitly open, same as ADR-014
 * already leaves it for Services ("à concevoir en Phase 5").
 */
import type { Locale } from "@/i18n/routes";
import type { WorkItemRow } from "@/lib/db/types";
import type { GalleryBlock } from "@/lib/gallery-blocks";
import { publicMediaFileUrl } from "@/lib/public-media";

/** Ratio strings are "W/H" (e.g. "21/9", "4/5") — see migrations/0001_initial.sql. */
function ratioValue(ratio: string): number {
  const [w, h] = ratio.split("/").map(Number);
  if (!w || !h) return 1;
  return w / h;
}

const FULL_BLEED_MIN_RATIO = 1.6;

export function buildGalleryFromWorkItems(items: WorkItemRow[], locale: Locale): GalleryBlock[] {
  return items.map((item) => {
    const image = {
      src: publicMediaFileUrl(item.media_id),
      ratio: item.ratio,
      alt: locale === "fr" ? item.alt_fr : item.alt_en,
      focalX: item.focal_x,
      focalY: item.focal_y,
      caption: (locale === "fr" ? item.caption_fr : item.caption_en) ?? undefined,
    };
    return ratioValue(item.ratio) >= FULL_BLEED_MIN_RATIO ? { type: "full" as const, image } : { type: "centered" as const, image };
  });
}
