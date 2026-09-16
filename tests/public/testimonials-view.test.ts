/**
 * Témoignages CMS — the full real chain a public visitor depends on:
 * publish -> publish the FR language -> appears via the exact real read
 * `src/components/pages/HomeView.astro` now performs
 * (`listPublishedTestimonials`) -> its real photo (when present) resolves
 * through `resolvePublicMediaObject`, extended in this brief to also
 * recognize testimonials usage (`isMediaUsedByPublicTestimonial`). Also
 * proves the negative cases: a draft, a masked (is_visible=0), and a
 * rights-unconfirmed testimonial all stay absent from what the Home page
 * would render — plus the no-photo rendering path (photo is optional
 * here, unlike Travail/Services' required main media).
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, getTestBucket, closeTestDb } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as testimonials from "../../src/lib/db/testimonials";
import { resolvePublicMediaObject } from "../../src/lib/public-media";

let db: D1Database;
let bucket: R2Bucket;
const UPDATED_BY = "testimonials-view-test@divinemotion.ca";

before(async () => {
  // Distinct persistence dir — this file runs alongside the other
  // tests/public/*.test.ts files in the `test:public` script, all
  // sharing tests/dal/harness.ts; see that file's header comment for why
  // sharing the default dir races.
  db = await resetTestDb(".wrangler-test-public-testimonialsview");
  seedTestDb();
  bucket = await getTestBucket();
});

after(async () => {
  await closeTestDb();
});

/** Exactly what src/components/pages/HomeView.astro now does for a given locale's testimonials section. */
async function renderPublicTestimonials(locale: "fr" | "en") {
  return testimonials.listPublishedTestimonials(db, locale);
}

describe("Témoignages CMS — publish -> real content appears publicly", () => {
  test("a text-only testimonial (no photo): full chain create -> publish -> publish FR -> appears in the public FR list", async () => {
    const draft = await testimonials.createTestimonial(
      db,
      {
        authorName: "Camille",
        quoteFr: "Une équipe formidable, des photos magnifiques.",
        quoteEn: "A wonderful team, beautiful photos.",
        roleContextFr: "Mariage à Québec",
        roleContextEn: "Wedding in Quebec City",
        position: 999,
        isVisible: true,
      },
      UPDATED_BY,
    );
    assert.ok(draft.ok);
    if (!draft.ok) return;

    const published = await testimonials.publishTestimonial(db, draft.data.draftId, UPDATED_BY);
    assert.ok(published.ok, "CMS publish action itself must succeed");
    if (!published.ok) return;
    const publishedId = published.data.publishedId;

    // Content merge alone must not make it public yet — language
    // publication is a separate, explicit step (same ADR-011/013 pattern
    // as Travail/Services).
    assert.equal((await renderPublicTestimonials("fr")).some((t) => t.author_name === "Camille"), false);

    const langResult = await testimonials.setTestimonialLanguageStatus(db, publishedId, "fr", "published", UPDATED_BY);
    assert.ok(langResult.ok);

    const frList = await renderPublicTestimonials("fr");
    const item = frList.find((t) => t.author_name === "Camille");
    assert.ok(item, "the published, FR-live testimonial must now appear in the public FR list");
    assert.equal(item!.quote_fr, "Une équipe formidable, des photos magnifiques.");
    assert.equal(item!.photo_media_id, null, "no-photo rendering path — never a fabricated media id");

    // EN was never published — must not appear on the EN page yet.
    assert.equal((await renderPublicTestimonials("en")).some((t) => t.author_name === "Camille"), false);
  });

  test("a testimonial with a real photo: the image resolves through the public media route", async () => {
    const bytes = new TextEncoder().encode("fake JPEG bytes for the testimonials E2E test");
    const createdMedia = await media.createMediaMetadata(
      db,
      { storageKey: "media/testimonials-e2e.jpg", mimeType: "image/jpeg", sizeBytes: bytes.byteLength },
      UPDATED_BY,
    );
    assert.ok(createdMedia.ok);
    if (!createdMedia.ok) return;
    const mediaId = createdMedia.data.id;
    await bucket.put("media/testimonials-e2e.jpg", bytes);
    await media.markMediaUploaded(db, mediaId);
    await media.markMediaReady(db, mediaId, { width: 400, height: 400 });
    await media.updateMediaMetadata(db, mediaId, { publicationRightsConfirmed: true }, UPDATED_BY);

    const draft = await testimonials.createTestimonial(
      db,
      {
        authorName: "Julien",
        quoteFr: "Un travail impeccable.",
        quoteEn: "Impeccable work.",
        photoMediaId: mediaId,
        position: 999,
      },
      UPDATED_BY,
    );
    assert.ok(draft.ok);
    if (!draft.ok) return;
    const published = await testimonials.publishTestimonial(db, draft.data.draftId, UPDATED_BY);
    assert.ok(published.ok);
    if (!published.ok) return;
    await testimonials.setTestimonialLanguageStatus(db, published.data.publishedId, "fr", "published", UPDATED_BY);

    const frList = await renderPublicTestimonials("fr");
    const item = frList.find((t) => t.author_name === "Julien");
    assert.ok(item);
    assert.equal(item!.photo_media_id, mediaId);

    const resolved = await resolvePublicMediaObject(db, bucket, mediaId);
    assert.ok(resolved, "the public page's real photo must be readable through the public media route");
    assert.equal(resolved!.mimeType, "image/jpeg");
  });

  test("a draft (never published) never appears in the public list", async () => {
    const draft = await testimonials.createTestimonial(
      db,
      { authorName: "Draft Only", quoteFr: "a", quoteEn: "a", position: 999 },
      UPDATED_BY,
    );
    assert.ok(draft.ok);
    // Never published.

    const list = await renderPublicTestimonials("fr");
    assert.equal(list.some((t) => t.author_name === "Draft Only"), false);
  });

  test("a published testimonial with is_visible=false never appears in the public list", async () => {
    const draft = await testimonials.createTestimonial(
      db,
      { authorName: "Masked", quoteFr: "a", quoteEn: "a", position: 999, isVisible: false },
      UPDATED_BY,
    );
    assert.ok(draft.ok);
    if (!draft.ok) return;
    const published = await testimonials.publishTestimonial(db, draft.data.draftId, UPDATED_BY);
    assert.ok(published.ok);
    if (!published.ok) return;
    await testimonials.setTestimonialLanguageStatus(db, published.data.publishedId, "fr", "published", UPDATED_BY);

    const list = await renderPublicTestimonials("fr");
    assert.equal(list.some((t) => t.author_name === "Masked"), false);
  });

  test("publishing the language is blocked while the photo's rights aren't confirmed — the public list correctly never sees it", async () => {
    const createdMedia = await media.createMediaMetadata(db, { storageKey: "media/testimonials-unrighted.jpg", mimeType: "image/jpeg", sizeBytes: 100 }, UPDATED_BY);
    assert.ok(createdMedia.ok);
    if (!createdMedia.ok) return;
    await media.markMediaUploaded(db, createdMedia.data.id);
    await media.markMediaReady(db, createdMedia.data.id, { width: 100, height: 100 });
    // Rights left unconfirmed.

    const draft = await testimonials.createTestimonial(
      db,
      { authorName: "Unrighted Photo", quoteFr: "a", quoteEn: "a", photoMediaId: createdMedia.data.id, position: 999 },
      UPDATED_BY,
    );
    assert.ok(draft.ok);
    if (!draft.ok) return;
    const published = await testimonials.publishTestimonial(db, draft.data.draftId, UPDATED_BY);
    assert.ok(published.ok);
    if (!published.ok) return;

    const langResult = await testimonials.setTestimonialLanguageStatus(db, published.data.publishedId, "fr", "published", UPDATED_BY);
    assert.equal(langResult.ok, false);
    if (!langResult.ok) assert.equal(langResult.error.code, "PUBLICATION_RIGHTS_REQUIRED");

    const list = await renderPublicTestimonials("fr");
    assert.equal(list.some((t) => t.author_name === "Unrighted Photo"), false);
  });
});
