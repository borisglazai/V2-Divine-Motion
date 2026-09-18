/**
 * "Afficher sur l'accueil" — the Visual Editor Travail slot control added
 * for `work_items.featured_on_home` (a column that already existed and
 * was already the exact thing the Home Travail preview reads,
 * src/lib/db/work.ts's listFeaturedOnHome — see
 * tests/public/home-work-preview.test.ts). Before this brief there was no
 * way to SET it from the Visual Editor at all; this suite covers the new
 * checkbox's server-side chain end to end:
 * GallerySlot.astro's Modifier panel -> saveWorkSlotAction (draft only) ->
 * publishWorkSlotAction (explicit publish, same as every other slot
 * field) -> listFeaturedOnHome (what the public Home actually reads).
 *
 * Real local D1, no mocking — same discipline as
 * tests/public/site-editor-phase3.test.ts, whose `publishedWorkItem`
 * helper pattern this file mirrors (published AND live in both FR/EN,
 * since "publicly visible" needs both `status='published'` and the
 * relevant language live).
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, closeTestDb, getTestBucket } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as work from "../../src/lib/db/work";
import { saveWorkSlotAction, publishWorkSlotAction } from "../../src/lib/admin/work-slot-actions";

let db: D1Database;
let bucket: R2Bucket;
const UPDATED_BY = "home-featured-toggle-test@divinemotion.ca";
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

/** Published AND live in both FR/EN, featured_on_home=0 to start — the exact baseline GallerySlot.astro's Modifier panel edits from. */
async function publishedUnfeaturedWorkItem(storageKeySuffix: string, position: number): Promise<{ id: number; mediaId: number }> {
  const mediaId = await readyRightedMedia(`media/featured-toggle-${storageKeySuffix}.jpg`);
  const created = await work.createWorkItem(
    db,
    { mediaId, position, ratio: "4/5", altFr: `alt fr ${storageKeySuffix}`, altEn: `alt en ${storageKeySuffix}`, featuredOnHome: false },
    UPDATED_BY,
  );
  assert.ok(created.ok);
  if (!created.ok) throw new Error("unreachable");
  const published = await work.publishWorkItem(db, created.data.draftId, UPDATED_BY);
  assert.ok(published.ok);
  if (!published.ok) throw new Error("unreachable");
  await work.setWorkItemLanguageStatus(db, published.data.publishedId, "fr", "published", UPDATED_BY);
  await work.setWorkItemLanguageStatus(db, published.data.publishedId, "en", "published", UPDATED_BY);
  return { id: published.data.publishedId, mediaId };
}

before(async () => {
  db = await resetTestDb(".wrangler-test-public-homefeaturedtoggle");
  seedTestDb();
  bucket = await getTestBucket();
  void bucket;
});

after(async () => {
  await closeTestDb();
});

describe("Afficher sur l'accueil — GallerySlot Modifier panel toggle", () => {
  test("not featured (baseline): absent from the Home Travail preview", async () => {
    const { id } = await publishedUnfeaturedWorkItem("baseline", 9500);
    const list = await work.listFeaturedOnHome(db, "fr");
    assert.equal(
      list.some((item) => item.id === id),
      false,
      "featured_on_home=0 must never appear on Home",
    );
  });

  test("checking the box in the editor (draft save) updates the draft's featured_on_home", async () => {
    const { id, mediaId } = await publishedUnfeaturedWorkItem("activate", 9501);

    const before = await work.getWorkItemDraft(db, id);
    assert.equal(before, null, "no draft should exist yet");

    const current = await work.getWorkItem(db, id);
    const saved = await saveWorkSlotAction(
      db,
      id,
      { mediaId, altFr: current!.alt_fr, altEn: current!.alt_en, featuredOnHome: true },
      REDIRECT,
      UPDATED_BY,
    );
    assert.ok(!("notFound" in saved));
    if ("notFound" in saved) return;
    assert.match(saved.redirect, /flash=success/);

    const draft = await work.getWorkItemDraft(db, id);
    assert.ok(draft, "a draft must now exist");
    assert.equal(draft!.featured_on_home, 1, "the draft (not yet published) must reflect the checked box");
  });

  test("the checked state is visible immediately, and again after a simulated reload (listWorkItemsForAdminGallery, the exact read the editor page performs)", async () => {
    const { id, mediaId } = await publishedUnfeaturedWorkItem("reload", 9502);
    const current = await work.getWorkItem(db, id);
    await saveWorkSlotAction(db, id, { mediaId, altFr: current!.alt_fr, altEn: current!.alt_en, featuredOnHome: true }, REDIRECT, UPDATED_BY);

    // "Immédiatement" and "après reload" are the SAME read in this app —
    // listWorkItemsForAdminGallery is called fresh on every render of
    // /admin/site/travail, so calling it again here IS the reload.
    for (let i = 0; i < 2; i++) {
      const { items } = await work.listWorkItemsForAdminGallery(db);
      const entry = items.find((item) => item.id === id);
      assert.ok(entry, "the item must still be present in the admin listing");
      assert.equal(entry!.featured_on_home, 1, `draft-checked state must be visible on read #${i + 1}`);
    }
  });

  test("before publication: the draft toggle does not change the public Home", async () => {
    const { id, mediaId } = await publishedUnfeaturedWorkItem("prepublish", 9503);
    const current = await work.getWorkItem(db, id);
    await saveWorkSlotAction(db, id, { mediaId, altFr: current!.alt_fr, altEn: current!.alt_en, featuredOnHome: true }, REDIRECT, UPDATED_BY);

    const frList = await work.listFeaturedOnHome(db, "fr");
    const enList = await work.listFeaturedOnHome(db, "en");
    assert.equal(
      frList.some((item) => item.id === id),
      false,
      "a draft-only change must never affect the public FR Home",
    );
    assert.equal(
      enList.some((item) => item.id === id),
      false,
      "a draft-only change must never affect the public EN Home",
    );
  });

  test("after publication: the item appears on the public Home, in both FR and EN", async () => {
    const { id, mediaId } = await publishedUnfeaturedWorkItem("postpublish", 9504);
    const current = await work.getWorkItem(db, id);
    const saved = await saveWorkSlotAction(db, id, { mediaId, altFr: current!.alt_fr, altEn: current!.alt_en, featuredOnHome: true }, REDIRECT, UPDATED_BY);
    if ("notFound" in saved) throw new Error("unreachable");

    const draft = await work.getWorkItemDraft(db, id);
    assert.ok(draft);
    const published = await publishWorkSlotAction(db, draft!.id, REDIRECT, UPDATED_BY);
    assert.match(published.redirect, /flash=success/);

    const frList = await work.listFeaturedOnHome(db, "fr");
    const enList = await work.listFeaturedOnHome(db, "en");
    assert.ok(
      frList.some((item) => item.id === id),
      "after publishing, the item must appear on the public FR Home",
    );
    assert.ok(
      enList.some((item) => item.id === id),
      "after publishing, the item must appear on the public EN Home — the selection itself is not locale-specific",
    );
  });

  test("unchecking + publishing removes the item from the public Home", async () => {
    const { id, mediaId } = await publishedUnfeaturedWorkItem("unfeature", 9505);
    const current = await work.getWorkItem(db, id);

    // First feature it and publish, confirming the starting state.
    const firstSave = await saveWorkSlotAction(db, id, { mediaId, altFr: current!.alt_fr, altEn: current!.alt_en, featuredOnHome: true }, REDIRECT, UPDATED_BY);
    if ("notFound" in firstSave) throw new Error("unreachable");
    const firstDraft = await work.getWorkItemDraft(db, id);
    await publishWorkSlotAction(db, firstDraft!.id, REDIRECT, UPDATED_BY);
    assert.ok((await work.listFeaturedOnHome(db, "fr")).some((item) => item.id === id), "sanity: must be featured before the un-toggle");

    // Now uncheck and publish again.
    const secondSave = await saveWorkSlotAction(db, id, { mediaId, altFr: current!.alt_fr, altEn: current!.alt_en, featuredOnHome: false }, REDIRECT, UPDATED_BY);
    if ("notFound" in secondSave) throw new Error("unreachable");
    const secondDraft = await work.getWorkItemDraft(db, id);
    assert.ok(secondDraft);
    assert.equal(secondDraft!.featured_on_home, 0);
    await publishWorkSlotAction(db, secondDraft!.id, REDIRECT, UPDATED_BY);

    assert.equal(
      (await work.listFeaturedOnHome(db, "fr")).some((item) => item.id === id),
      false,
      "after un-checking and publishing, the item must be removed from the public Home",
    );
  });
});
