/**
 * Éditeur visuel Phase 2 — pure tests for `buildGalleryFromWorkItems`/
 * `buildAdminGallerySlots` (src/lib/work-gallery-adapter.ts), the adapter
 * that assigns real, ordered `WorkItemRow[]` into one of the 3 named
 * layouts (src/lib/work-gallery-layouts.ts) — no D1, no `.astro` render
 * harness needed (none exists in this repo, see
 * tests/admin/media-preview.test.ts's header).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildGalleryFromWorkItems, buildAdminGallerySlots } from "../../src/lib/work-gallery-adapter";
import type { WorkItemRow } from "../../src/lib/db/types";

function fakeWorkItem(overrides: Partial<WorkItemRow> & { id: number; media_id: number; position: number }): WorkItemRow {
  return {
    status: "published",
    draft_of_id: null,
    category: null,
    ratio: "4/5",
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

function items(count: number, startId = 1): WorkItemRow[] {
  return Array.from({ length: count }, (_, i) => fakeWorkItem({ id: startId + i, media_id: 100 + i, position: i + 1 }));
}

describe("buildGalleryFromWorkItems — public, layout-aware, cycling", () => {
  test("resolves the real public media URL, never a mock placeholder key", () => {
    const [block] = buildGalleryFromWorkItems(items(1), "fr", "editorial");
    assert.ok("image" in block);
    assert.equal(block.image.src, "/media/100/file");
    assert.equal(block.image.mediaKey, undefined);
  });

  test("Editorial's first slot is a single 'large' block", () => {
    const [block] = buildGalleryFromWorkItems(items(1), "fr", "editorial");
    assert.equal(block.type, "large");
  });

  test("a partial trailing slot (not enough items to fill it) is dropped, never shown half-empty", () => {
    // Editorial: large(1) then duo(2) — 2 items fill 'large' + leave only 1 for the duo, which needs 2.
    const blocks = buildGalleryFromWorkItems(items(2), "fr", "editorial");
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "large");
  });

  test("a duo slot fills once enough items are available", () => {
    const blocks = buildGalleryFromWorkItems(items(3), "fr", "editorial");
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].type, "large");
    assert.equal(blocks[1].type, "duo");
    const duo = blocks[1];
    assert.ok("left" in duo && "right" in duo);
    assert.equal(duo.left.src, "/media/101/file");
    assert.equal(duo.right.src, "/media/102/file");
  });

  test("Story's trio slot fills with exactly enough items (full + duo + trio)", () => {
    const blocks = buildGalleryFromWorkItems(items(6), "fr", "story");
    assert.deepEqual(blocks.map((b) => b.type), ["full", "duo", "trio"]);
    const trio = blocks[2];
    assert.ok("images" in trio);
    assert.equal(trio.images.length, 3);
  });

  test("a full cycle (6 items on Editorial) emits all 4 blocks", () => {
    const blocks = buildGalleryFromWorkItems(items(6), "fr", "editorial");
    assert.deepEqual(blocks.map((b) => b.type), ["large", "duo", "large", "duo"]);
  });

  test("cycles the layout once one cycle's worth of items is exceeded", () => {
    const blocks = buildGalleryFromWorkItems(items(12), "fr", "minimal");
    // Minimal = large, duo, large, duo per cycle (6 images) — 12 items = 2 full cycles.
    assert.deepEqual(blocks.map((b) => b.type), ["large", "duo", "large", "duo", "large", "duo", "large", "duo"]);
  });

  test("uses the alt/caption for the requested locale", () => {
    const item = fakeWorkItem({
      id: 1,
      media_id: 1,
      position: 1,
      alt_fr: "texte alternatif",
      alt_en: "alt text",
      caption_fr: "légende",
      caption_en: "caption",
    });
    const [fr] = buildGalleryFromWorkItems([item], "fr", "editorial");
    const [en] = buildGalleryFromWorkItems([item], "en", "editorial");
    assert.ok("image" in fr && "image" in en);
    assert.equal(fr.image.alt, "texte alternatif");
    assert.equal(fr.image.caption, "légende");
    assert.equal(en.image.alt, "alt text");
    assert.equal(en.image.caption, "caption");
  });

  test("passes through the real focal point", () => {
    const [block] = buildGalleryFromWorkItems([fakeWorkItem({ id: 1, media_id: 1, position: 1, focal_x: 30, focal_y: 70 })], "fr", "editorial");
    assert.ok("image" in block);
    assert.equal(block.image.focalX, 30);
    assert.equal(block.image.focalY, 70);
  });

  test("an empty list produces an empty gallery — never a crash", () => {
    assert.deepEqual(buildGalleryFromWorkItems([], "fr", "editorial"), []);
  });

  test("preserves input order (position ordering is listPublishedWorkItems's job, not the adapter's)", () => {
    const blocks = buildGalleryFromWorkItems(items(3), "fr", "editorial");
    const duo = blocks[1];
    assert.ok("left" in duo);
    assert.equal(duo.left.src, "/media/101/file");
  });
});

describe("buildAdminGallerySlots — admin, always keeps a trailing empty slot reachable", () => {
  test("zero items still produces one cycle of entirely empty slots", () => {
    const slots = buildAdminGallerySlots([], "editorial");
    assert.ok(slots.length > 0);
    for (const slot of slots) {
      for (const entry of slot.entries) {
        assert.equal(entry.item, null);
      }
    }
  });

  test("an empty entry keeps its expected shape (ratio/orientation) so the slot stays visually present", () => {
    const slots = buildAdminGallerySlots([], "editorial");
    const first = slots[0].entries[0];
    assert.equal(first.item, null);
    assert.equal(first.expectedShape.orientation, "landscape");
    assert.ok(first.expectedShape.ratioLabel.length > 0);
  });

  test("empty entries get sequential positions starting after the last real item", () => {
    const slots = buildAdminGallerySlots(items(2), "editorial");
    const allEntries = slots.flatMap((s) => s.entries);
    const occupied = allEntries.filter((e) => e.item !== null);
    const empty = allEntries.filter((e) => e.item === null);
    assert.equal(occupied.length, 2);
    assert.equal(occupied[0].position, 1);
    assert.equal(occupied[1].position, 2);
    assert.ok(empty.length > 0);
    assert.equal(empty[0].position, 3);
    assert.equal(empty[1]?.position, 4);
  });

  test("when items exactly fill N whole cycles, an extra full cycle of empty slots is appended", () => {
    const slots = buildAdminGallerySlots(items(6), "editorial"); // exactly 1 Editorial cycle
    const allEntries = slots.flatMap((s) => s.entries);
    const occupied = allEntries.filter((e) => e.item !== null);
    const empty = allEntries.filter((e) => e.item === null);
    assert.equal(occupied.length, 6);
    assert.equal(empty.length, 6); // one more full cycle, entirely empty
  });

  test("occupied entries carry the real work_item", () => {
    const slots = buildAdminGallerySlots(items(1), "editorial");
    const first = slots[0].entries[0];
    assert.ok(first.item);
    assert.equal(first.item!.media_id, 100);
  });
});
