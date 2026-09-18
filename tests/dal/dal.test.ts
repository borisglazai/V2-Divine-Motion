/**
 * DAL test suite (Implementation Brief 011) — exercises the real
 * repository functions in src/lib/db/ against a real local D1 (see
 * tests/dal/harness.ts). Seeded with seeds/local.sql once, then each
 * describe block works against that shared, realistic starting state
 * (rather than re-seeding per test) — acceptable because tests use
 * distinct rows/ids and read-then-assert, not because ordering is
 * assumed between describe blocks.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, closeTestDb } from "./harness";

import * as admin from "../../src/lib/db/admin";
import * as media from "../../src/lib/db/media";
import * as work from "../../src/lib/db/work";
import * as services from "../../src/lib/db/services";
import * as testimonials from "../../src/lib/db/testimonials";
import * as pages from "../../src/lib/db/pages";
import * as settings from "../../src/lib/db/settings";
import * as seo from "../../src/lib/db/seo";
import { listSnapshots } from "../../src/lib/db/snapshots";

let db: D1Database;

before(async () => {
  db = await resetTestDb(".wrangler-test-dal");
  seedTestDb();
});

after(async () => {
  await closeTestDb();
});

async function findMediaId(storageKey: string): Promise<number> {
  const row = await db.prepare("SELECT id FROM media WHERE storage_key = ?").bind(storageKey).first<{ id: number }>();
  return row!.id;
}
async function findServiceId(slug: string): Promise<number> {
  const row = await db.prepare("SELECT id FROM services WHERE slug = ? AND status = 'published'").bind(slug).first<{ id: number }>();
  return row!.id;
}

describe("published reads", () => {
  test("listPublishedServices returns the 3 seeded services with features, FR", async () => {
    const rows = await services.listPublishedServices(db, "fr");
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.slug), ["weddings", "portraits", "events"]);
    assert.ok(rows[0].features.length >= 1);
    assert.equal(rows[0].title_fr, "Mariages");
  });

  test("listPublishedWorkItems returns only visible+published items, ordered by position", async () => {
    const rows = await work.listPublishedWorkItems(db, "fr");
    assert.ok(rows.length >= 5);
    const positions = rows.map((r) => r.position);
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  });

  test("listPublishedTestimonials returns the 2 seeded testimonials", async () => {
    const rows = await testimonials.listPublishedTestimonials(db, "en");
    assert.equal(rows.length, 2);
  });

  test("homeContent.getPublished returns the seeded singleton row", async () => {
    const row = await pages.homeContent.getPublished(db);
    assert.ok(row);
    assert.equal(row!.hero_headline_fr, "Des images qui restent en mouvement.");
  });

  test("getSiteSettings returns the seeded row", async () => {
    const row = await settings.getSiteSettings(db);
    assert.equal(row!.contact_email, "bonjour@divinemotion.ca");
  });

  test("getPageSeo returns per-page FR/EN metadata", async () => {
    const row = await seo.getPageSeo(db, "home");
    assert.equal(row!.title_fr, "Accueil");
    assert.equal(row!.title_en, "Home");
  });
});

describe("work_items: draft isolation, create, update, publish", () => {
  let publishedId: number;

  test("setup: a published work_item exists", async () => {
    const rows = await work.listAllWorkItems(db);
    const published = rows.find((r) => r.status === "published")!;
    publishedId = published.id;
    assert.ok(publishedId);
  });

  test("createWorkItemDraft copies the published row into a new draft shadow", async () => {
    const result = await work.createWorkItemDraft(db, publishedId);
    assert.equal(result.ok, true);
  });

  test("DRAFT_ALREADY_EXISTS: a second draft for the same published row is rejected", async () => {
    const result = await work.createWorkItemDraft(db, publishedId);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "DRAFT_ALREADY_EXISTS");
  });

  test("public isolation: editing the draft's caption never changes the published read", async () => {
    const draftBefore = await db
      .prepare("SELECT id FROM work_items WHERE draft_of_id = ?")
      .bind(publishedId)
      .first<{ id: number }>();
    const draftId = draftBefore!.id;

    const publicBefore = await work.getWorkItem(db, publishedId);
    const originalCaption = publicBefore!.caption_fr;

    await work.updateWorkItemDraft(db, draftId, { captionFr: "ISOLATION TEST CAPTION" });

    const publicAfterEdit = await work.getWorkItem(db, publishedId);
    assert.equal(publicAfterEdit!.caption_fr, originalCaption, "published row must be untouched by a draft edit");

    const draft = await work.getWorkItem(db, draftId);
    assert.equal(draft!.caption_fr, "ISOLATION TEST CAPTION");

    const publishResult = await work.publishWorkItem(db, draftId);
    assert.equal(publishResult.ok, true);

    const publicAfterPublish = await work.getWorkItem(db, publishedId);
    assert.equal(publicAfterPublish!.caption_fr, "ISOLATION TEST CAPTION", "published row must reflect the draft after an explicit publish");

    const draftGone = await work.getWorkItem(db, draftId);
    assert.equal(draftGone, null, "draft row is deleted after publish");
  });

  test("a snapshot of the pre-publish state was created", async () => {
    const snaps = await listSnapshots(db, "work_item", String(publishedId));
    assert.ok(snaps.length >= 1);
    const payload = JSON.parse((snaps[0] as { snapshot_json: string }).snapshot_json);
    assert.equal(payload.id, publishedId);
    assert.notEqual(payload.caption_fr, "ISOLATION TEST CAPTION", "snapshot captures the PRE-publish value");
  });

  test("NO_DRAFT: publishing a non-existent draft id fails cleanly", async () => {
    const result = await work.publishWorkItem(db, 999999);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "NO_DRAFT");
  });

  test("createWorkItem (brand new) then publish promotes it in place, no snapshot", async () => {
    const mediaId = await findMediaId("media/seed-a.jpg");
    const created = await work.createWorkItem(db, {
      mediaId,
      position: 99,
      ratio: "1/1",
      altFr: "nouveau",
      altEn: "new",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const draftId = created.data.draftId;

    const beforeSnaps = await listSnapshots(db, "work_item", String(draftId));
    const publishResult = await work.publishWorkItem(db, draftId);
    assert.equal(publishResult.ok, true);
    if (!publishResult.ok) return;
    assert.equal(publishResult.data.publishedId, draftId, "a brand-new item keeps its own id (promoted in place)");

    const afterSnaps = await listSnapshots(db, "work_item", String(draftId));
    assert.equal(afterSnaps.length, beforeSnaps.length, "no snapshot for a first-ever publish (nothing to roll back to)");

    const row = await work.getWorkItem(db, draftId);
    assert.equal(row!.status, "published");
  });
});

describe("work_items: FR/EN independence and publication rights", () => {
  let itemId: number;
  let unrightedMediaId: number;

  test("setup: work_item on a media without confirmed rights", async () => {
    const result = await media.createMediaMetadata(db, {
      storageKey: "media/dal-unrighted.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    unrightedMediaId = result.data.id;

    const created = await work.createWorkItem(db, {
      mediaId: unrightedMediaId,
      position: 1,
      ratio: "4/5",
      altFr: "a",
      altEn: "a",
    });
    assert.equal(created.ok, true);
    if (created.ok) {
      itemId = created.data.draftId;
      await work.publishWorkItem(db, itemId); // promote to published (rights not required for content publish, only for language status)
    }
  });

  test("PUBLICATION_RIGHTS_REQUIRED: app-level error before any SQL trigger fires", async () => {
    const result = await work.setWorkItemLanguageStatus(db, itemId, "fr", "published");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "PUBLICATION_RIGHTS_REQUIRED");
  });

  test("confirming rights unblocks FR publish, EN stays draft independently", async () => {
    await media.updateMediaMetadata(db, unrightedMediaId, { publicationRightsConfirmed: true });

    const frResult = await work.setWorkItemLanguageStatus(db, itemId, "fr", "published");
    assert.equal(frResult.ok, true);

    const row = await work.getWorkItem(db, itemId);
    assert.equal(row!.fr_status, "published");
    assert.equal(row!.en_status, "draft", "EN must remain untouched by the FR-only action");
  });

  test("publishing EN afterwards does not un-publish FR", async () => {
    const enResult = await work.setWorkItemLanguageStatus(db, itemId, "en", "published");
    assert.equal(enResult.ok, true);
    const row = await work.getWorkItem(db, itemId);
    assert.equal(row!.fr_status, "published");
    assert.equal(row!.en_status, "published");
  });
});

// CMS Work Patch 013A — the gap: `publishWorkItem` used to copy a draft's
// `media_id` onto an already-live published row unconditionally. The
// BEFORE UPDATE OF fr_status/en_status triggers never fire for that merge
// (it doesn't touch those columns), so an unrighted media could become
// publicly visible without ever tripping a language-status transition.
// See src/lib/db/work.ts's publishWorkItem header and
// docs/DATA_ARCHITECTURE.md "Publication rights — media replacement on an
// already-live row".
describe("work_items: publish blocked when replacing media on an already-live row (CMS Work Patch 013A)", () => {
  let publishedId: number;
  let unrightedMediaId: number;
  let draftId: number;

  test("setup: a published work_item with FR live, then a draft that swaps its media for an unrighted one", async () => {
    const rightedMediaId = await findMediaId("media/seed-a.jpg");
    const created = await work.createWorkItem(db, {
      mediaId: rightedMediaId,
      position: 60,
      ratio: "4/5",
      altFr: "a",
      altEn: "a",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    publishedId = created.data.draftId;
    const publishResult = await work.publishWorkItem(db, publishedId);
    assert.equal(publishResult.ok, true);

    const frResult = await work.setWorkItemLanguageStatus(db, publishedId, "fr", "published");
    assert.equal(frResult.ok, true);

    const unrighted = await media.createMediaMetadata(db, {
      storageKey: "media/dal-013a-unrighted.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    assert.equal(unrighted.ok, true);
    if (!unrighted.ok) return;
    unrightedMediaId = unrighted.data.id;

    const draftResult = await work.createWorkItemDraft(db, publishedId);
    assert.equal(draftResult.ok, true);
    if (!draftResult.ok) return;
    draftId = draftResult.data.draftId;

    const updateResult = await work.updateWorkItemDraft(db, draftId, { mediaId: unrightedMediaId });
    assert.equal(updateResult.ok, true);
  });

  test("publishWorkItem is refused with PUBLICATION_RIGHTS_REQUIRED before any SQL write; published row unchanged; draft kept", async () => {
    const before = await work.getWorkItem(db, publishedId);
    const result = await work.publishWorkItem(db, draftId);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "PUBLICATION_RIGHTS_REQUIRED");

    const after = await work.getWorkItem(db, publishedId);
    assert.equal(after!.media_id, before!.media_id, "the published row's media must be unchanged by a refused publish");

    const draftStillThere = await work.getWorkItemDraft(db, publishedId);
    assert.ok(draftStillThere, "the draft must be kept, not silently discarded");
    assert.equal(draftStillThere!.media_id, unrightedMediaId);
  });

  test("after confirming rights, the same draft publishes successfully", async () => {
    await media.updateMediaMetadata(db, unrightedMediaId, { publicationRightsConfirmed: true });
    const result = await work.publishWorkItem(db, draftId);
    assert.equal(result.ok, true);

    const after = await work.getWorkItem(db, publishedId);
    assert.equal(after!.media_id, unrightedMediaId);
  });

  test("regression: a draft replacing a published row where NO language is live may still publish unrighted media", async () => {
    const rightedMediaId = await findMediaId("media/seed-b.jpg");
    const created = await work.createWorkItem(db, {
      mediaId: rightedMediaId,
      position: 61,
      ratio: "4/5",
      altFr: "a",
      altEn: "a",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const noLiveId = created.data.draftId;
    const promoteResult = await work.publishWorkItem(db, noLiveId);
    assert.equal(promoteResult.ok, true);
    // fr_status/en_status default to 'draft' — neither language is live.

    const unrighted = await media.createMediaMetadata(db, {
      storageKey: "media/dal-013a-no-live-unrighted.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    assert.equal(unrighted.ok, true);
    if (!unrighted.ok) return;

    const draftResult = await work.createWorkItemDraft(db, noLiveId);
    assert.equal(draftResult.ok, true);
    if (!draftResult.ok) return;
    await work.updateWorkItemDraft(db, draftResult.data.draftId, { mediaId: unrighted.data.id });

    const publishResult = await work.publishWorkItem(db, draftResult.data.draftId);
    assert.equal(publishResult.ok, true, "no language is live, so this merge doesn't require confirmed rights (Brief 013A §2)");
  });
});

describe("work_items: reorder (draft-safe, Review 011A)", () => {
  let ids: number[]; // 3 published items, "A/B/C" in their current public order

  test("setup: 3 published work_items with a known public order", async () => {
    const all = await work.listAllWorkItems(db);
    const published = all.filter((r) => r.status === "published").slice(0, 3);
    assert.equal(published.length, 3);
    ids = published.map((r) => r.id);
  });

  test("reorderWorkItemDrafts only writes drafts: public order A/B/C stays put until explicit publish, then reflects the new order", async () => {
    const beforePositions = (await Promise.all(ids.map((id) => work.getWorkItem(db, id)))).map((r) => r!.position);

    // 1. public order is A/B/C (captured above as beforePositions on ids A,B,C)
    // 2. reorder the drafts, reversed (C, B, A)
    const reversed = [...ids].reverse();
    const result = await work.reorderWorkItemDrafts(db, reversed);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    // 3. public/published reads are still A/B/C — reorder must never touch published rows
    const afterReorder = (await Promise.all(ids.map((id) => work.getWorkItem(db, id)))).map((r) => r!.position);
    assert.deepEqual(afterReorder, beforePositions, "reordering drafts must never change what the public reads");

    for (const { publishedId, draftId } of result.data) {
      const draft = await work.getWorkItem(db, draftId);
      assert.equal(draft!.status, "draft");
      assert.equal(draft!.position, reversed.indexOf(publishedId) + 1, "the new order is only visible on the draft shadow row");
    }

    // 4. after an explicit publish per item, the new order is visible publicly
    for (const { draftId } of result.data) {
      const pub = await work.publishWorkItem(db, draftId);
      assert.equal(pub.ok, true);
    }
    const afterPublish = (await Promise.all(reversed.map((id) => work.getWorkItem(db, id)))).map((r) => r!.position);
    assert.deepEqual(afterPublish, [1, 2, 3], "after explicit publish, the reversed order is visible");
  });

  test("reordering an item with no open draft auto-creates one, without publishing anything", async () => {
    const [publishedId] = ids; // by now has no draft (published by the previous test)
    const publicBefore = await work.getWorkItem(db, publishedId);

    const result = await work.reorderWorkItemDrafts(db, [publishedId]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.length, 1);
    const draft = await work.getWorkItem(db, result.data[0].draftId);
    assert.equal(draft!.status, "draft");
    assert.equal(draft!.draft_of_id, publishedId, "a new draft shadow row must have been created for this published item");

    const publicAfter = await work.getWorkItem(db, publishedId);
    assert.equal(publicAfter!.position, publicBefore!.position, "auto-creating a draft to reorder must not touch the published row");
  });

  test("reorder with an unknown id fails without creating or modifying any draft", async () => {
    const all = await work.listAllWorkItems(db);
    const published = all.filter((r) => r.status === "published" && !ids.includes(r.id))[0];
    const before = published.position;

    const result = await work.reorderWorkItemDrafts(db, [published.id, 999999]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "NOT_FOUND");

    const after = await work.getWorkItem(db, published.id);
    assert.equal(after!.position, before, "a bad id in the list must not create/modify any draft, even for the valid ids");

    const draft = await db
      .prepare("SELECT id FROM work_items WHERE draft_of_id = ?")
      .bind(published.id)
      .first<{ id: number }>();
    assert.equal(draft, null, "no draft must have been created for the valid id when the batch is rejected");
  });
});

describe("services: children isolation (service_features)", () => {
  let publishedId: number;
  let draftId: number;

  test("setup + create draft", async () => {
    publishedId = await findServiceId("events");
    const result = await services.createServiceDraft(db, publishedId);
    assert.equal(result.ok, true);
    if (result.ok) draftId = result.data.draftId;
  });

  test("public features unchanged while editing the draft's features", async () => {
    const publicBefore = await services.getService(db, publishedId);
    const originalCount = publicBefore!.features.length;

    await services.updateServiceDraftFeatures(db, draftId, [
      { position: 1, textFr: "Nouvelle 1", textEn: "New 1" },
      { position: 2, textFr: "Nouvelle 2", textEn: "New 2" },
    ]);

    const publicAfterEdit = await services.getService(db, publishedId);
    assert.equal(publicAfterEdit!.features.length, originalCount, "public features must be untouched before publish");

    const draft = await services.getService(db, draftId);
    assert.equal(draft!.features.length, 2);
    assert.equal(draft!.features[0].text_fr, "Nouvelle 1");
  });

  test("publish replaces the published row's features with the draft's", async () => {
    const result = await services.publishService(db, draftId);
    assert.equal(result.ok, true);

    const publicAfter = await services.getService(db, publishedId);
    assert.equal(publicAfter!.features.length, 2);
    assert.equal(publicAfter!.features[0].text_fr, "Nouvelle 1");
  });
});

describe("about_content: two child tables isolated together", () => {
  let draftId: number;
  let publishedId: number;

  test("create draft and edit both story paragraphs and approach items", async () => {
    const published = await pages.aboutContent.getPublished(db);
    publishedId = published!.id;
    const result = await pages.aboutContent.createDraft(db);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    draftId = result.data.draftId;

    await pages.updateAboutDraftStoryParagraphs(db, draftId, [
      { position: 1, textFr: "Paragraphe modifié.", textEn: "Edited paragraph." },
    ]);
    await pages.updateAboutDraftApproachItems(db, draftId, [
      { position: 1, wordFr: "Nouveau", wordEn: "New", textFr: "t", textEn: "t" },
    ]);
  });

  test("public children unaffected before publish", async () => {
    const publicParagraphs = await pages.aboutContent.getStoryParagraphs(db, publishedId);
    assert.notEqual(publicParagraphs[0].text_fr, "Paragraphe modifié.");
    const publicItems = await pages.aboutContent.getApproachItems(db, publishedId);
    assert.ok(publicItems.length >= 3, "original 3 approach items still there");
  });

  test("publish replaces both child sets atomically", async () => {
    const result = await pages.aboutContent.publish(db, draftId);
    assert.equal(result.ok, true);

    const paragraphs = await pages.aboutContent.getStoryParagraphs(db, publishedId);
    assert.equal(paragraphs.length, 1);
    assert.equal(paragraphs[0].text_fr, "Paragraphe modifié.");

    const items = await pages.aboutContent.getApproachItems(db, publishedId);
    assert.equal(items.length, 1);
    assert.equal(items[0].word_fr, "Nouveau");
  });
});

describe("snapshots: pruning keeps only the last 5 per entity", () => {
  test("6 publishes leave exactly 5 snapshots", async () => {
    const publishedId = await findServiceId("portraits");
    for (let i = 0; i < 6; i++) {
      const draft = await services.createServiceDraft(db, publishedId);
      assert.equal(draft.ok, true);
      if (!draft.ok) continue;
      await services.updateServiceDraft(db, draft.data.draftId, { position: 2 });
      const publishResult = await services.publishService(db, draft.data.draftId);
      assert.equal(publishResult.ok, true);
    }
    const snaps = await listSnapshots(db, "service", String(publishedId));
    assert.equal(snaps.length, 5, "pruning must cap at 5, even after 6 publishes");
  });
});

describe("testimonials: soft delete, publish, rights gate", () => {
  test("soft delete then restore", async () => {
    const created = await testimonials.createTestimonial(db, {
      authorName: "DAL Test Author",
      quoteFr: "q",
      quoteEn: "q",
      position: 99,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const publishResult = await testimonials.publishTestimonial(db, created.data.draftId);
    assert.equal(publishResult.ok, true);
    if (!publishResult.ok) return;
    const id = publishResult.data.publishedId;

    const del = await testimonials.softDeleteTestimonial(db, id);
    assert.equal(del.ok, true);
    const afterDelete = await testimonials.getTestimonial(db, id);
    assert.notEqual(afterDelete!.deleted_at, null);

    const restore = await testimonials.restoreTestimonial(db, id);
    assert.equal(restore.ok, true);
    const afterRestore = await testimonials.getTestimonial(db, id);
    assert.equal(afterRestore!.deleted_at, null);
  });

  test("a testimonial with an unrighted photo is blocked from FR publish", async () => {
    const mediaResult = await media.createMediaMetadata(db, {
      storageKey: "media/dal-testi-photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 500,
    });
    assert.equal(mediaResult.ok, true);
    if (!mediaResult.ok) return;

    const created = await testimonials.createTestimonial(db, {
      authorName: "With Photo",
      quoteFr: "q",
      quoteEn: "q",
      photoMediaId: mediaResult.data.id,
      position: 100,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const publishResult = await testimonials.publishTestimonial(db, created.data.draftId);
    assert.equal(publishResult.ok, true);
    if (!publishResult.ok) return;

    const langResult = await testimonials.setTestimonialLanguageStatus(db, publishResult.data.publishedId, "fr", "published");
    assert.equal(langResult.ok, false);
    if (!langResult.ok) assert.equal(langResult.error.code, "PUBLICATION_RIGHTS_REQUIRED");
  });
});

describe("media: usage check and soft delete", () => {
  test("getMediaUsage reflects real references", async () => {
    const mediaId = await findMediaId("media/seed-a.jpg");
    const usage = await media.getMediaUsage(db, mediaId);
    const total = usage.reduce((sum, u) => sum + u.count, 0);
    assert.ok(total > 0, "seed-a.jpg is referenced by work_items/home_content in the seed");
  });

  test("an unused media can be soft-deleted and restored", async () => {
    const created = await media.createMediaMetadata(db, {
      storageKey: "media/dal-unused.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const del = await media.softDeleteMedia(db, created.data.id);
    assert.equal(del.ok, true);
    const restore = await media.restoreMedia(db, created.data.id);
    assert.equal(restore.ok, true);
  });

  test("Review 011A: a referenced media is refused with MEDIA_IN_USE, deleted_at unchanged", async () => {
    const mediaId = await findMediaId("media/seed-a.jpg");
    const before = await media.getMedia(db, mediaId);
    assert.equal(before!.deleted_at, null);

    const del = await media.softDeleteMedia(db, mediaId);
    assert.equal(del.ok, false);
    if (!del.ok) assert.equal(del.error.code, "MEDIA_IN_USE");

    const after = await media.getMedia(db, mediaId);
    assert.equal(after!.deleted_at, null, "a refused delete must not modify any data");
  });

  test("Review 011A: once every reference is removed, soft delete succeeds; restore still works", async () => {
    const createdMedia = await media.createMediaMetadata(db, {
      storageKey: "media/dal-referenced-then-freed.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
    });
    assert.equal(createdMedia.ok, true);
    if (!createdMedia.ok) return;
    const mediaId = createdMedia.data.id;

    const createdItem = await work.createWorkItem(db, {
      mediaId,
      position: 1,
      ratio: "1/1",
      altFr: "réf",
      altEn: "ref",
    });
    assert.equal(createdItem.ok, true);
    if (!createdItem.ok) return;

    // still referenced (by the unpublished draft work_item) -> blocked
    const blocked = await media.softDeleteMedia(db, mediaId);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.error.code, "MEDIA_IN_USE");

    // remove the only reference
    const deletedDraft = await work.deleteWorkItemDraft(db, createdItem.data.draftId);
    assert.equal(deletedDraft.ok, true);

    const usage = await media.getMediaUsage(db, mediaId);
    assert.ok(usage.every((u) => u.count === 0), "no reference should remain");

    const del = await media.softDeleteMedia(db, mediaId);
    assert.equal(del.ok, true, "once unreferenced, soft delete succeeds");

    const restore = await media.restoreMedia(db, mediaId);
    assert.equal(restore.ok, true, "restore continues to work after a previously-blocked delete now succeeds");
  });
});

describe("settings and SEO", () => {
  test("updateSiteSettings changes only the given fields", async () => {
    const before = await settings.getSiteSettings(db);
    const result = await settings.updateSiteSettings(db, { brandName: "Divine Motion Test" });
    assert.equal(result.ok, true);
    const after = await settings.getSiteSettings(db);
    assert.equal(after!.brand_name, "Divine Motion Test");
    assert.equal(after!.contact_email, before!.contact_email, "untouched fields stay the same");
  });

  test("updatePageSeo updates one page's FR/EN metadata independently", async () => {
    const result = await seo.updatePageSeo(db, "about", { titleFr: "Titre modifié" });
    assert.equal(result.ok, true);
    const row = await seo.getPageSeo(db, "about");
    assert.equal(row!.title_fr, "Titre modifié");
    const homeRow = await seo.getPageSeo(db, "home");
    assert.notEqual(homeRow!.title_fr, "Titre modifié", "other pages must be untouched");
  });
});

// Implementation Brief 012 — the Dashboard's one dedicated DAL read.
// Placed last deliberately: it cross-checks against the D1 state as it
// stands after every prior describe block has run, rather than assuming
// any particular seed count.
describe("admin dashboard summary (Brief 012)", () => {
  const DRAFT_SHADOW_TABLES = [
    "work_items",
    "services",
    "testimonials",
    "home_content",
    "work_page_content",
    "services_page_content",
    "about_content",
    "contact_content",
  ];

  async function countWhere(sql: string): Promise<number> {
    const row = await db.prepare(sql).first<{ count: number }>();
    return row!.count;
  }

  test("every field matches an independent raw-SQL count — proves the summary reads real D1, not a mock", async () => {
    const summary = await admin.getAdminDashboardSummary(db);

    assert.equal(summary.mediaCount, await countWhere(`SELECT COUNT(*) AS count FROM media WHERE deleted_at IS NULL`));
    assert.equal(
      summary.workItemCount,
      await countWhere(`SELECT COUNT(*) AS count FROM work_items WHERE status = 'published'`),
    );
    assert.equal(
      summary.activeServiceCount,
      await countWhere(`SELECT COUNT(*) AS count FROM services WHERE status = 'published' AND is_active = 1`),
    );
    assert.equal(
      summary.testimonialCount,
      await countWhere(`SELECT COUNT(*) AS count FROM testimonials WHERE status = 'published' AND deleted_at IS NULL`),
    );

    let expectedDrafts = 0;
    for (const table of DRAFT_SHADOW_TABLES) {
      expectedDrafts += await countWhere(`SELECT COUNT(*) AS count FROM ${table} WHERE status = 'draft'`);
    }
    assert.equal(summary.pendingDraftCount, expectedDrafts);
  });

  test("the count changes when the underlying data changes — proves a live read, not a cached/static value", async () => {
    const before = await admin.getAdminDashboardSummary(db);

    const created = await media.createMediaMetadata(db, {
      storageKey: "media/dal-dashboard-proof.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
    });
    assert.equal(created.ok, true);

    const after = await admin.getAdminDashboardSummary(db);
    assert.equal(after.mediaCount, before.mediaCount + 1);
  });
});
