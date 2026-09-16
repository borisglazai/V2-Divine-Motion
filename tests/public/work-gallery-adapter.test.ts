/**
 * Validation Brief 014S bug B — pure tests for `buildGalleryFromWorkItems`
 * (src/lib/work-gallery-adapter.ts), the adapter that lets the public
 * Travail page (src/components/pages/WorkView.astro) turn real, published
 * `WorkItemRow[]` into the `GalleryBlock[]` `WorkGallery.astro` already
 * knows how to render — no D1, no `.astro` render harness needed (none
 * exists in this repo, see tests/admin/media-preview.test.ts's header).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildGalleryFromWorkItems } from "../../src/lib/work-gallery-adapter";
import type { WorkItemRow } from "../../src/lib/db/types";

function fakeWorkItem(overrides: Partial<WorkItemRow> & { id: number; media_id: number; ratio: string }): WorkItemRow {
  return {
    status: "published",
    draft_of_id: null,
    category: null,
    position: 1,
    caption_fr: null,
    caption_en: null,
    alt_fr: "alt fr",
    alt_en: "alt en",
    focal_x: 50,
    focal_y: 50,
    is_visible: 1,
    featured_on_home: 0,
    fr_status: "published",
    en_status: "published",
    fr_published_at: 1,
    en_published_at: 1,
    created_at: 1,
    updated_at: 1,
    created_by: null,
    updated_by: null,
    ...overrides,
  };
}

describe("buildGalleryFromWorkItems", () => {
  test("resolves the real public media URL, never a mock placeholder key", () => {
    const [block] = buildGalleryFromWorkItems([fakeWorkItem({ id: 1, media_id: 42, ratio: "4/5" })], "fr");
    assert.ok("image" in block);
    assert.equal(block.image.src, "/media/42/file");
    assert.equal(block.image.mediaKey, undefined);
  });

  test("wide/panoramic ratio (>= 1.6) becomes a 'full' block", () => {
    const [block] = buildGalleryFromWorkItems([fakeWorkItem({ id: 1, media_id: 1, ratio: "21/9" })], "fr");
    assert.equal(block.type, "full");
  });

  test("a tall/portrait ratio becomes a 'centered' block", () => {
    const [block] = buildGalleryFromWorkItems([fakeWorkItem({ id: 1, media_id: 1, ratio: "4/5" })], "fr");
    assert.equal(block.type, "centered");
  });

  test("uses the alt/caption for the requested locale", () => {
    const item = fakeWorkItem({
      id: 1,
      media_id: 1,
      ratio: "4/5",
      alt_fr: "texte alternatif",
      alt_en: "alt text",
      caption_fr: "légende",
      caption_en: "caption",
    });
    const [fr] = buildGalleryFromWorkItems([item], "fr");
    const [en] = buildGalleryFromWorkItems([item], "en");
    assert.ok("image" in fr && "image" in en);
    assert.equal(fr.image.alt, "texte alternatif");
    assert.equal(fr.image.caption, "légende");
    assert.equal(en.image.alt, "alt text");
    assert.equal(en.image.caption, "caption");
  });

  test("passes through the real focal point", () => {
    const [block] = buildGalleryFromWorkItems([fakeWorkItem({ id: 1, media_id: 1, ratio: "4/5", focal_x: 30, focal_y: 70 })], "fr");
    assert.ok("image" in block);
    assert.equal(block.image.focalX, 30);
    assert.equal(block.image.focalY, 70);
  });

  test("an empty list produces an empty gallery — never a crash", () => {
    assert.deepEqual(buildGalleryFromWorkItems([], "fr"), []);
  });

  test("preserves input order (position ordering is listPublishedWorkItems's job, not the adapter's)", () => {
    const items = [
      fakeWorkItem({ id: 1, media_id: 10, ratio: "4/5", position: 1 }),
      fakeWorkItem({ id: 2, media_id: 20, ratio: "4/5", position: 2 }),
    ];
    const blocks = buildGalleryFromWorkItems(items, "fr");
    assert.equal(blocks.length, 2);
    assert.ok("image" in blocks[0] && "image" in blocks[1]);
    assert.equal(blocks[0].image.src, "/media/10/file");
    assert.equal(blocks[1].image.src, "/media/20/file");
  });
});
