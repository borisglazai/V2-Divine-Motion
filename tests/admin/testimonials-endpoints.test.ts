/**
 * Témoignages CMS mutation logic tests — same shape as
 * tests/admin/work-endpoints.test.ts / services-endpoints.test.ts.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, closeTestDb } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as testimonials from "../../src/lib/db/testimonials";
import {
  createTestimonialAction,
  saveTestimonialAction,
  publishTestimonialAction,
  deleteTestimonialDraftAction,
  setTestimonialLanguageStatusAction,
  reorderTestimonialsAction,
} from "../../src/lib/admin/testimonials-actions";

let db: D1Database;
const UPDATED_BY = "testimonials-cms-test-admin@divinemotion.ca";

before(async () => {
  db = await resetTestDb(".wrangler-test-testimonials-endpoints");
  seedTestDb();
});

after(async () => {
  await closeTestDb();
});

function testimonialForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    authorName: "Original Name",
    quoteFr: "Texte FR",
    quoteEn: "Text EN",
    position: "1",
    isVisible: "on",
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) fd.set(key, value);
  return fd;
}

describe("Témoignages CMS — full create -> save -> publish cycle (no photo)", () => {
  let draftId: number;

  test("create draft with no photo (mediaId absent from the form)", async () => {
    const result = await createTestimonialAction(db, testimonialForm(), UPDATED_BY);
    assert.match(result.redirect, /^\/admin\/testimonials\/\d+\?flash=success/);
    draftId = Number(result.redirect.match(/\/admin\/testimonials\/(\d+)/)![1]);

    const row = await testimonials.getTestimonial(db, draftId);
    assert.equal(row!.status, "draft");
    assert.equal(row!.draft_of_id, null, "brand-new testimonial, never published before");
    assert.equal(row!.photo_media_id, null, "no photo selected -> null, never a fabricated id");
    assert.equal(row!.author_name, "Original Name");
  });

  test("save draft updates only the draft", async () => {
    const result = await saveTestimonialAction(db, draftId, testimonialForm({ authorName: "Updated Name" }), UPDATED_BY);
    if ("notFound" in result) throw new Error("unexpected 404");
    assert.match(result.redirect, /flash=success/);
    const row = await testimonials.getTestimonial(db, draftId);
    assert.equal(row!.author_name, "Updated Name");
  });

  test("publish promotes the brand-new draft in place — text-only testimonial, no rights gate applies", async () => {
    const result = await publishTestimonialAction(db, draftId, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    const row = await testimonials.getTestimonial(db, draftId);
    assert.equal(row!.status, "published");
    assert.equal(row!.author_name, "Updated Name");
  });
});

describe("Témoignages CMS — a real photo attaches and resolves correctly", () => {
  test("create rejects a media that isn't ready (never disabled, never silently used)", async () => {
    const createdMedia = await media.createMediaMetadata(db, { storageKey: "media/cms-testi-not-ready.jpg", mimeType: "image/jpeg", sizeBytes: 1 });
    assert.ok(createdMedia.ok);
    if (!createdMedia.ok) return;
    const result = await createTestimonialAction(db, testimonialForm({ mediaId: String(createdMedia.data.id) }), UPDATED_BY);
    assert.match(result.redirect, /error_mediaId/);
  });

  test("create + save with a real ready photo", async () => {
    const createdMedia = await media.createMediaMetadata(db, { storageKey: "media/cms-testi-ready.jpg", mimeType: "image/jpeg", sizeBytes: 1000 });
    assert.ok(createdMedia.ok);
    if (!createdMedia.ok) return;
    await media.markMediaUploaded(db, createdMedia.data.id);
    await media.markMediaReady(db, createdMedia.data.id, { width: 100, height: 100 });

    const result = await createTestimonialAction(db, testimonialForm({ mediaId: String(createdMedia.data.id) }), UPDATED_BY);
    assert.match(result.redirect, /flash=success/);
    const draftId = Number(result.redirect.match(/\/admin\/testimonials\/(\d+)/)![1]);
    const row = await testimonials.getTestimonial(db, draftId);
    assert.equal(row!.photo_media_id, createdMedia.data.id);
  });
});

describe("Témoignages CMS — editing an already-published testimonial auto-creates a draft, public row stays untouched", () => {
  let publishedId: number;
  let originalName: string;

  test("setup: a published seed testimonial", async () => {
    const all = await testimonials.listAllTestimonials(db);
    const published = all.filter((r) => r.status === "published")[0];
    publishedId = published.id;
    originalName = published.author_name;
  });

  test("save auto-creates a draft and leaves the published row untouched", async () => {
    const result = await saveTestimonialAction(db, publishedId, testimonialForm({ authorName: "ISOLATION TEST NAME" }), UPDATED_BY);
    if ("notFound" in result) throw new Error("unexpected 404");
    assert.match(result.redirect, /flash=success/);

    const publicRow = await testimonials.getTestimonial(db, publishedId);
    assert.equal(publicRow!.author_name, originalName, "the published row must be untouched by a save");

    const draft = await testimonials.getTestimonialDraft(db, publishedId);
    assert.ok(draft, "a draft must have been created");
    assert.equal(draft!.author_name, "ISOLATION TEST NAME");
  });
});

describe("Témoignages CMS — delete draft", () => {
  test("delete-draft removes only the draft, never a published row", async () => {
    const created = await testimonials.createTestimonial(
      db,
      { authorName: "to delete", quoteFr: "a", quoteEn: "a", position: 50 },
      UPDATED_BY,
    );
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const draftId = created.data.draftId;

    const result = await deleteTestimonialDraftAction(db, draftId);
    assert.match(result.redirect, /flash=success/);
    assert.equal(await testimonials.getTestimonial(db, draftId), null);
  });
});

describe("Témoignages CMS — FR/EN independence + publication rights via the language-status action", () => {
  let itemId: number;
  let unrightedMediaId: number;

  test("setup: a published testimonial with a photo whose rights aren't confirmed", async () => {
    const createdMedia = await media.createMediaMetadata(db, {
      storageKey: "media/cms-testi-unrighted.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    assert.equal(createdMedia.ok, true);
    if (!createdMedia.ok) return;
    unrightedMediaId = createdMedia.data.id;
    await media.markMediaUploaded(db, unrightedMediaId);
    await media.markMediaReady(db, unrightedMediaId, { width: 100, height: 100 });

    const created = await testimonials.createTestimonial(
      db,
      { authorName: "Rights Test", quoteFr: "a", quoteEn: "a", photoMediaId: unrightedMediaId, position: 51 },
      UPDATED_BY,
    );
    assert.equal(created.ok, true);
    if (!created.ok) return;
    itemId = created.data.draftId;
    await testimonials.publishTestimonial(db, itemId);
  });

  test("publication rights required: FR publish is blocked with a clear message, not raw SQL", async () => {
    const fd = new FormData();
    fd.set("locale", "fr");
    fd.set("status", "published");
    const result = await setTestimonialLanguageStatusAction(db, itemId, fd, UPDATED_BY);
    assert.match(result.redirect, /flash=error/);
    const message = new URL(result.redirect, "http://placeholder.local").searchParams.get("flash_message");
    assert.match(message ?? "", /Publication impossible/);

    const row = await testimonials.getTestimonial(db, itemId);
    assert.equal(row!.fr_status, "draft", "must not have been published");
  });

  test("confirming rights unblocks FR publish; EN stays independent", async () => {
    await media.updateMediaMetadata(db, unrightedMediaId, { publicationRightsConfirmed: true }, UPDATED_BY);

    const frForm = new FormData();
    frForm.set("locale", "fr");
    frForm.set("status", "published");
    const frResult = await setTestimonialLanguageStatusAction(db, itemId, frForm, UPDATED_BY);
    assert.match(frResult.redirect, /flash=success/);

    const row = await testimonials.getTestimonial(db, itemId);
    assert.equal(row!.fr_status, "published");
    assert.equal(row!.en_status, "draft", "EN must remain untouched by the FR-only action");
  });

  test("swapping the photo on an already-live row back to an unrighted one is blocked at publish time (media-change guard)", async () => {
    const anotherUnrighted = await media.createMediaMetadata(db, {
      storageKey: "media/cms-testi-unrighted-2.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    assert.ok(anotherUnrighted.ok);
    if (!anotherUnrighted.ok) return;
    await media.markMediaUploaded(db, anotherUnrighted.data.id);
    await media.markMediaReady(db, anotherUnrighted.data.id, { width: 100, height: 100 });

    const draftResult = await testimonials.createTestimonialDraft(db, itemId, UPDATED_BY);
    assert.ok(draftResult.ok);
    if (!draftResult.ok) return;
    await testimonials.updateTestimonialDraft(db, draftResult.data.draftId, { photoMediaId: anotherUnrighted.data.id }, UPDATED_BY);

    const publishResult = await publishTestimonialAction(db, draftResult.data.draftId, UPDATED_BY);
    assert.match(publishResult.redirect, /flash=error/);
    const message = new URL(publishResult.redirect, "http://placeholder.local").searchParams.get("flash_message");
    assert.match(message ?? "", /Publication impossible/);

    const row = await testimonials.getTestimonial(db, itemId);
    assert.equal(row!.photo_media_id, unrightedMediaId, "the live row's photo must be untouched by the blocked publish");
  });
});

describe("Témoignages CMS — draft-safe reordering", () => {
  test("reorder writes only to draft shadows, never directly to published rows", async () => {
    const all = await testimonials.listAllTestimonials(db);
    const published = all.filter((r) => r.status === "published");
    assert.ok(published.length >= 1, "seed must provide at least 1 published testimonial to reorder");

    const originalPositions = new Map(published.map((r) => [r.id, r.position]));
    const reversedIds = published.map((r) => r.id).reverse();

    const fd = new FormData();
    fd.set("orderedIds", JSON.stringify(reversedIds));
    const result = await reorderTestimonialsAction(db, fd, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    for (const id of reversedIds) {
      const publicRow = await testimonials.getTestimonial(db, id);
      assert.equal(publicRow!.position, originalPositions.get(id), "the published row's position must be untouched — reorder is draft-only");
      const draft = await testimonials.getTestimonialDraft(db, id);
      assert.ok(draft, `expected a draft shadow for testimonial #${id}`);
    }
  });
});
