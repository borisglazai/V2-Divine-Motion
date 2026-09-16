/**
 * The one place that spells out the admin media preview URL (Validation
 * Brief 014S bug #2 fix) — `MediaPickerField.astro`'s frontmatter imports
 * this instead of inlining the path itself, so the exact string it renders
 * into `<img src>` is a plain, testable function rather than only visible
 * inside `.astro` template syntax (which nothing in this repo's test setup
 * can import directly — no Vitest/Astro-container test runner is
 * configured, only `node --test`).
 *
 * Same route `/admin/media/index.astro` already uses for its own working
 * thumbnails (`src/pages/admin/media/[id]/file.ts`) — an admin-only,
 * Access-gated server read of the real R2 object, never a public bucket
 * URL.
 */
export function mediaFileUrl(mediaId: number): string {
  return `/admin/media/${mediaId}/file`;
}
