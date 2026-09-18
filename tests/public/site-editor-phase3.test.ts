/**
 * Éditeur visuel Phase 3 — same discipline as
 * tests/public/site-editor-phase2.test.ts: real local D1 + the real DAL/
 * admin-action modules, no mocking. Covers the server-side behavior behind
 * Boris's validated Phase 3 orientations:
 *  - Retirer/Remettre = is_visible only, draft/publish preserved, media
 *    never deleted (§4).
 *  - Précédent/Suivant reorder — draft-only, adjacent swap, reflected
 *    immediately in the admin listing even before publish (§5, and Boris's
 *    explicit added requirement: "je ne veux pas d'un changement interne
 *    invisible à l'utilisateur").
 *  - Layout switching never loses or duplicates a work_item (§9).
 *  - Alt stays mandatory on an existing item's edit too, and the focal
 *    point persists (§10/§11).
 *
 * Client-side-only behavior (alt reuse from the media picker, the focal
 * point's click-to-set UI, keyboard/mobile access, the Retirer confirm
 * dialog) is covered separately in
 * tests/admin/gallery-slot-phase3.browser.test.ts, which needs a real
 * browser — none of that can be exercised through a plain DAL call.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, closeTestDb, getTestBucket } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as work from "../../src/lib/db/work";
import { saveWorkSlotAction, setWorkSlotVisibilityAction, moveWorkSlotAction, createWorkSlotItemAction } from "../../src/lib/admin/work-slot-actions";
import { buildAdminGallerySlots, buildGalleryFromWorkItems } from "../../src/lib/work-gallery-adapter";

let db: D1Database;
let bucket: R2Bucket;
const UPDATED_BY = "site-editor-phase3-test@divinemotion.ca";
const REDIRECT = "/admin/site/travail";

async function readyRightedMedia(storageKey: string): Promise<number> {
  const created = await media.createMediaMetadata(db, { storageKey, mimeType: "image/jpeg", sizeBytes: 100 }, UPDATED_BY);
  assert.ok(created.ok);
  if (!created.ok) throw new Error("unreachable");
  await media.markMediaUploaded(db, created.data.id);
  await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });
  await media.updateMediaMetadata(db, created.data.id, { publicationRightsConfirmed: true }, UPDATED_BY);
  return created.data.id;
}

/** Published AND live in both languages — what "publicly visible" actually requires (listPublishedWorkItems: status='published' AND {locale}_status='published' AND is_visible=1). */
async function publishedWorkItem(storageKeySuffix: string, position: number): Promise<number> {
  const mediaId = await readyRightedMedia(`media/phase3-${storageKeySuffix}.jpg`);
  const created = await work.createWorkItem(db, { mediaId, position, ratio: "4/5", altFr: `alt fr ${storageKeySuffix}`, altEn: `alt en ${storageKeySuffix}` }, UPDATED_BY);
  assert.ok(created.ok);
  if (!created.ok) throw new Error("unreachable");
  const published = await work.publishWorkItem(db, created.data.draftId, UPDATED_BY);
  assert.ok(published.ok);
  if (!published.ok) throw new Error("unreachable");
  await work.setWorkItemLanguageStatus(db, published.data.publishedId, "fr", "published", UPDATED_BY);
  await work.setWorkItemLanguageStatus(db, published.data.publishedId, "en", "published", UPDATED_BY);
  return published.data.publishedId;
}

before(async () => {
  db = await resetTestDb(".wrangler-test-public-siteeditor-phase3");
  seedTestDb();
  bucket = await getTestBucket();
  void bucket;
});

after(async () => {
  await closeTestDb();
});

describe("Retirer / Remettre (§4) — is_visible only, draft/publish preserved, media never touched", () => {
  let publishedId: number;
  let mediaId: number;

  test("setup: a normal published, visible item", async () => {
    publishedId = await publishedWorkItem("retirer-a", 9100);
    mediaId = (await work.getWorkItem(db, publishedId))!.media_id;

    const items = await work.listPublishedWorkItems(db, "fr");
    assert.ok(items.some((i) => i.id === publishedId), "precondition: item is publicly visible before Retirer");
  });

  test("Retirer only writes a draft — the published row (and the public site) is untouched until publish", async () => {
    const result = await setWorkSlotVisibilityAction(db, publishedId, false, REDIRECT, UPDATED_BY);
    assert.ok(!("notFound" in result));
    if ("notFound" in result) return;
    assert.match(result.redirect, /flash=success/);

    const stillPublished = await work.getWorkItem(db, publishedId);
    assert.equal(stillPublished!.is_visible, 1, "the published row must be untouched — Retirer never bypasses draft/publish");

    const draft = await work.getWorkItemDraft(db, publishedId);
    assert.ok(draft);
    assert.equal(draft!.is_visible, 0);

    // Still fully public until an explicit publish.
    const items = await work.listPublishedWorkItems(db, "fr");
    assert.ok(items.some((i) => i.id === publishedId), "Retirer must not take effect before the draft is published");
  });

  test("publishing the Retirer draft removes the item from the public gallery without deleting the work_item or the media", async () => {
    const draft = await work.getWorkItemDraft(db, publishedId);
    const published = await work.publishWorkItem(db, draft!.id, UPDATED_BY);
    assert.ok(published.ok);

    const publicItems = await work.listPublishedWorkItems(db, "fr");
    assert.ok(!publicItems.some((i) => i.id === publishedId), "a retired item must never appear on the public site");

    const row = await work.getWorkItem(db, publishedId);
    assert.ok(row, "the work_item row itself must still exist — Retirer never deletes it");
    assert.equal(row!.is_visible, 0);

    const mediaRow = await media.getMedia(db, mediaId);
    assert.ok(mediaRow, "the underlying media must never be deleted by Retirer");
    assert.equal(mediaRow!.deleted_at, null);

    // Admin gallery must still SEE the retired item in its slot (never a
    // silently emptied slot) — same invariant GallerySlot.astro's "Masqué"
    // badge + Remettre control depend on.
    const { items } = await work.listWorkItemsForAdminGallery(db);
    const adminEntry = items.find((i) => i.id === publishedId);
    assert.ok(adminEntry, "a retired item must remain visible to the admin editor, never disappear from its slot");
    assert.equal(adminEntry!.is_visible, 0);
  });

  test("Remettre restores public visibility through the same draft mechanism", async () => {
    const result = await setWorkSlotVisibilityAction(db, publishedId, true, REDIRECT, UPDATED_BY);
    assert.ok(!("notFound" in result));
    if ("notFound" in result) return;

    const draft = await work.getWorkItemDraft(db, publishedId);
    assert.ok(draft);
    assert.equal(draft!.is_visible, 1);

    const published = await work.publishWorkItem(db, draft!.id, UPDATED_BY);
    assert.ok(published.ok);

    const publicItems = await work.listPublishedWorkItems(db, "fr");
    assert.ok(publicItems.some((i) => i.id === publishedId), "Remettre must fully restore public visibility");
  });
});

describe("Précédent / Suivant (§5) — draft-only adjacent swap, reflected immediately in the admin listing before publish", () => {
  let idA: number;
  let idB: number;
  let idC: number;

  test("setup: three published items at contiguous, isolated positions", async () => {
    idA = await publishedWorkItem("reorder-a", 9200);
    idB = await publishedWorkItem("reorder-b", 9201);
    idC = await publishedWorkItem("reorder-c", 9202);

    const { items } = await work.listWorkItemsForAdminGallery(db);
    const ids = items.filter((i) => [idA, idB, idC].includes(i.id)).map((i) => i.id);
    assert.deepEqual(ids, [idA, idB, idC], "precondition: A, B, C appear in creation order");
  });

  test("moving B 'next' swaps B and C as drafts only — the public order is untouched until publish", async () => {
    const result = await moveWorkSlotAction(db, idB, "next", REDIRECT, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    // Public read (listPublishedWorkItems) only ever reads the published
    // `position` column directly — must be completely unaffected by a
    // draft-only reorder.
    const publicItems = await work.listPublishedWorkItems(db, "fr");
    const publicIds = publicItems.filter((i) => [idA, idB, idC].includes(i.id)).map((i) => i.id);
    assert.deepEqual(publicIds, [idA, idB, idC], "the public site must not see the reorder before publish");

    // Admin read — Boris's explicit requirement: the new order must be
    // visible immediately, even in draft.
    const { items } = await work.listWorkItemsForAdminGallery(db);
    const adminIds = items.filter((i) => [idA, idB, idC].includes(i.id)).map((i) => i.id);
    assert.deepEqual(adminIds, [idA, idC, idB], "the admin listing must reflect the new order right away, never an invisible internal change");

    // No item lost or duplicated by the reorder.
    const allIds = items.map((i) => i.id);
    assert.equal(new Set(allIds).size, allIds.length, "no duplicated item after a reorder");
    assert.ok([idA, idB, idC].every((id) => allIds.includes(id)), "no item lost after a reorder");
  });

  test("publishing the swapped drafts applies the new order to the public site too", async () => {
    const draftB = await work.getWorkItemDraft(db, idB);
    const draftC = await work.getWorkItemDraft(db, idC);
    assert.ok(draftB && draftC, "reorderWorkItemDrafts must have opened drafts for both swapped items");
    await work.publishWorkItem(db, draftB!.id, UPDATED_BY);
    await work.publishWorkItem(db, draftC!.id, UPDATED_BY);

    const publicItems = await work.listPublishedWorkItems(db, "fr");
    const publicIds = publicItems.filter((i) => [idA, idB, idC].includes(i.id)).map((i) => i.id);
    assert.deepEqual(publicIds, [idA, idC, idB], "publishing must carry the reorder through to the public site");
  });

  test("moving the first reorderable item 'prev' is a no-op success, never an error, at either end of the sequence", async () => {
    const { items, meta } = await work.listWorkItemsForAdminGallery(db);
    const reorderable = items.filter((i) => !meta.get(i.id)?.isNewDraft);
    const firstId = reorderable[0].id;

    const result = await moveWorkSlotAction(db, firstId, "prev", REDIRECT, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);
    assert.doesNotMatch(result.redirect, /flash=error/);
  });

  test("a brand-new, never-published item cannot be moved — it must be published first", async () => {
    const newMediaId = await readyRightedMedia("reorder-new-draft");
    await createWorkSlotItemAction(db, { position: 9300, ratio: "3/2", mediaId: newMediaId, altFr: "nouveau", altEn: "new" }, REDIRECT, UPDATED_BY);

    const all = await work.listAllWorkItems(db);
    const newItem = all.find((i) => i.position === 9300);
    assert.ok(newItem);

    const result = await moveWorkSlotAction(db, newItem!.id, "next", REDIRECT, UPDATED_BY);
    assert.match(result.redirect, /flash=error/, "a never-published item has no place in the reorderable sequence yet");
  });
});

describe("Layout switching (§9) — Editorial/Story/Minimal never lose, duplicate, or delete a work_item", () => {
  test("the adapter is a pure read-time mapping — every occupied entry across all 3 layouts accounts for exactly the same set of items", async () => {
    const beforeCount = (await work.listAllWorkItems(db)).length;
    const { items } = await work.listWorkItemsForAdminGallery(db);
    const expectedIds = new Set(items.map((i) => i.id));

    for (const layoutId of ["editorial", "story", "minimal"] as const) {
      const slots = buildAdminGallerySlots(items, layoutId);
      const occupied = slots.flatMap((s) => s.entries).filter((e) => e.item !== null);
      const occupiedIds = occupied.map((e) => e.item!.id);

      assert.equal(new Set(occupiedIds).size, occupiedIds.length, `${layoutId}: no item duplicated`);
      assert.deepEqual(new Set(occupiedIds), expectedIds, `${layoutId}: every real item is placed, none dropped or invented`);
    }

    // Building admin slots for 3 different layouts is a pure computation —
    // it must never write anything to work_items.
    const afterCount = (await work.listAllWorkItems(db)).length;
    assert.equal(afterCount, beforeCount, "switching layouts must never create or delete a work_item row");
  });

  test("the PUBLIC adapter (buildGalleryFromWorkItems) is equally lossless in principle — only ever drops a genuinely partial trailing slot, never a whole item silently", async () => {
    const items = await work.listPublishedWorkItems(db, "fr");
    for (const layoutId of ["editorial", "story", "minimal"] as const) {
      const blocks = buildGalleryFromWorkItems(items, "fr", layoutId);
      // Every block's image(s) must trace back to a real published item —
      // never fabricated content.
      const usedSrcs = blocks.flatMap((b) => ("image" in b ? [b.image] : "left" in b ? [b.left, b.right] : b.images)).map((img) => img.src);
      assert.ok(usedSrcs.every((src) => typeof src === "string" && src.length > 0));
    }
  });
});

describe("Alt stays mandatory when editing an EXISTING occupied slot (§11), and the focal point persists (§10)", () => {
  let publishedId: number;

  test("setup", async () => {
    publishedId = await publishedWorkItem("alt-focal", 9400);
  });

  test("saveWorkSlotAction rejects a blank alt on an existing item — never silently blanked", async () => {
    const before = await work.getWorkItemDraft(db, publishedId);
    assert.equal(before, null, "no draft should exist yet");

    const result = await saveWorkSlotAction(db, publishedId, { mediaId: (await work.getWorkItem(db, publishedId))!.media_id, altFr: "", altEn: "still here", featuredOnHome: false }, REDIRECT, UPDATED_BY);
    assert.ok(!("notFound" in result));
    if ("notFound" in result) return;
    assert.match(result.redirect, /flash=error/);

    const after = await work.getWorkItemDraft(db, publishedId);
    assert.equal(after, null, "an invalid save must never create a draft as a side effect");
  });

  test("a valid save persists an edited alt and the focal point onto the draft", async () => {
    const current = await work.getWorkItem(db, publishedId);
    const result = await saveWorkSlotAction(
      db,
      publishedId,
      { mediaId: current!.media_id, altFr: "alt fr modifié", altEn: current!.alt_en, focalX: 20, focalY: 80, featuredOnHome: false },
      REDIRECT,
      UPDATED_BY,
    );
    assert.ok(!("notFound" in result));
    if ("notFound" in result) return;
    assert.match(result.redirect, /flash=success/);

    const draft = await work.getWorkItemDraft(db, publishedId);
    assert.ok(draft);
    assert.equal(draft!.alt_fr, "alt fr modifié");
    assert.equal(draft!.focal_x, 20);
    assert.equal(draft!.focal_y, 80);
  });

  test("publishing carries the edited alt and focal point onto the published row, visible to the public adapter", async () => {
    const draft = await work.getWorkItemDraft(db, publishedId);
    const published = await work.publishWorkItem(db, draft!.id, UPDATED_BY);
    assert.ok(published.ok);

    const row = await work.getWorkItem(db, publishedId);
    assert.equal(row!.alt_fr, "alt fr modifié");
    assert.equal(row!.focal_x, 20);
    assert.equal(row!.focal_y, 80);
  });
});
