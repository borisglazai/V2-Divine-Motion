/**
 * Public (unauthenticated) media resolution — Validation Brief 014S bug B.
 * Deliberately separate from `src/lib/admin/media-preview.ts` (`mediaFileUrl`,
 * `/admin/media/:id/file`): that route sits behind `src/middleware.ts`'s
 * Cloudflare Access gate and is never reachable by an anonymous visitor.
 * `/media/:id/file` (src/pages/media/[id]/file.ts) is its own route,
 * outside `/admin`, with its OWN authorization check below — R2 itself is
 * never made public, and neither is this route a blanket "fetch any media
 * by id": it only ever resolves a media that is genuinely live on the
 * public site right now.
 *
 * `resolvePublicMediaObject` takes `db`/`bucket` as explicit parameters
 * (never imports `cloudflare:workers`), same convention as every other
 * business-logic module in this repo — testable under plain `node --test`
 * against Miniflare, keeping the endpoint file itself thin.
 */
import { getMedia } from "@/lib/db/media";
import { isMediaUsedByPublicWorkItem } from "@/lib/db/work";
import { isMediaUsedByPublicService } from "@/lib/db/services";
import { isMediaUsedByPublicTestimonial } from "@/lib/db/testimonials";
import { isMediaUsedByPublicHomeContent, isMediaUsedByPublicAboutContent } from "@/lib/db/pages";
import { isMediaUsedByPublicSeo } from "@/lib/db/seo";

export function publicMediaFileUrl(mediaId: number): string {
  return `/media/${mediaId}/file`;
}

export interface ResolvedPublicMedia {
  mimeType: string;
  body: ReadableStream | null;
}

/**
 * Re-authorizes against real, current D1 state before ever reading R2:
 *
 *   1. The media row exists, is `ready`, not soft-deleted, and has
 *      publication rights confirmed right now (checked here even though
 *      the D1 rights-gate trigger already enforces this at publish time —
 *      rights can later be unconfirmed via the Médiathèque without that
 *      trigger re-firing, so this is real defense-in-depth, not a
 *      formality).
 *   2. The media is the current `media_id`/`photo_media_id` of a work
 *      item, a service, OR a testimonial that is actually live right
 *      now — the exact same conditions `listPublishedWorkItems`/
 *      `listPublishedServices`/`listPublishedTestimonials` use to decide
 *      what the public Travail/Services/Home (testimonials section)
 *      pages show at all.
 *
 * Returns `null` on any failure — the caller always maps that to a plain
 * 404, never a distinct "exists but not authorized" response that would
 * let a visitor probe which media ids exist.
 */
export async function resolvePublicMediaObject(
  db: D1Database,
  bucket: R2Bucket,
  mediaId: number,
): Promise<ResolvedPublicMedia | null> {
  const row = await getMedia(db, mediaId);
  if (!row || row.deleted_at !== null || row.processing_status !== "ready" || row.publication_rights_confirmed !== 1) {
    return null;
  }

  const isPublic =
    (await isMediaUsedByPublicWorkItem(db, mediaId)) ||
    (await isMediaUsedByPublicService(db, mediaId)) ||
    (await isMediaUsedByPublicTestimonial(db, mediaId)) ||
    (await isMediaUsedByPublicHomeContent(db, mediaId)) ||
    (await isMediaUsedByPublicAboutContent(db, mediaId)) ||
    (await isMediaUsedByPublicSeo(db, mediaId));
  if (!isPublic) return null;

  const object = await bucket.get(row.storage_key);
  if (!object) return null;

  return { mimeType: row.mime_type, body: object.body };
}
