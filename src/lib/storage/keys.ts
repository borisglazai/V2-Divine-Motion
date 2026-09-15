/**
 * R2 storage key generation (Implementation Brief 014 §9) — server-side
 * only, never derived from the client's filename or the D1 `id`
 * (auto-increment ids should never leak storage layout, same reasoning
 * `migrations/0001_initial.sql`'s own comment on `media.storage_key`
 * already gives — Brief 011). Format: `media/{uuid}/original.{ext}`.
 *
 * A ULID was suggested in the brief as an example; this uses
 * `crypto.randomUUID()` instead — natively available in both the Workers
 * runtime and Node (no dependency), and equally collision-resistant for
 * this purpose (a random, unguessable path segment, not something ever
 * sorted or parsed for its embedded timestamp).
 */

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function extensionForMimeType(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType] ?? null;
}

/** Returns null if the MIME type isn't one this module knows how to key (caller should have already validated it). */
export function generateMediaStorageKey(mimeType: string): string | null {
  const ext = extensionForMimeType(mimeType);
  if (!ext) return null;
  return `media/${crypto.randomUUID()}/original.${ext}`;
}
