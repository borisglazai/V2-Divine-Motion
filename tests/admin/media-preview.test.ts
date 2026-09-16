/**
 * Validation Brief 014S — staging bug #2: the Work item media picker
 * showed a black broken-image box instead of the real thumbnail for every
 * media, even ones confirmed working in /admin/media.
 *
 * Root cause (found by comparing MediaPickerField.astro against the
 * working src/pages/admin/media/index.astro): the picker never used a
 * real preview URL at all. It hardcoded `src="/mock/placeholder.svg"` for
 * every card — a leftover from Implementation Brief 013, written before
 * Brief 014's R2 upload pipeline existed, and never updated once real
 * media/previews did. `/admin/media`'s own thumbnails already worked by
 * pointing `<img>` at `/admin/media/:id/file` (an admin-only, Access-gated
 * route that reads the real R2 object server-side — src/pages/admin/
 * media/[id]/file.ts) — that mechanism was simply never wired into the
 * picker component.
 *
 * `mediaFileUrl()` (src/lib/admin/media-preview.ts) is the fix:
 * MediaPickerField.astro's frontmatter now calls it instead of inlining
 * either the old hardcoded placeholder or a duplicated template string.
 * No `.astro` render harness exists in this repo's test setup (no
 * Vitest/Astro-container runner — only `node --test`), so this is tested
 * as the plain function it is; see tests/admin/work-endpoints.test.ts for
 * the integration-level proof that /admin/work/new and /admin/work/[id]
 * feed this exact function the right media ids.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mediaFileUrl } from "../../src/lib/admin/media-preview";

describe("mediaFileUrl", () => {
  test("builds the real admin R2 preview route, never the old mock placeholder", () => {
    assert.equal(mediaFileUrl(42), "/admin/media/42/file");
  });

  test("never returns a bare/empty src — every id produces a concrete path", () => {
    for (const id of [1, 2, 999, 123456]) {
      const url = mediaFileUrl(id);
      assert.ok(url.length > 0);
      assert.doesNotMatch(url, /placeholder/, "must never fall back to the mock placeholder");
      assert.match(url, /^\/admin\/media\/\d+\/file$/);
    }
  });

  test("is the exact same route src/pages/admin/media/index.astro already uses successfully", () => {
    // Pinning the literal shape so this can never silently diverge from
    // the route that's proven to work (`src/pages/admin/media/[id]/file.ts`).
    assert.equal(mediaFileUrl(7), `/admin/media/${7}/file`);
  });
});
