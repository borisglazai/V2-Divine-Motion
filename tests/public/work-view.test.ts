/**
 * Validation Brief 014S bug B — the full real chain a public visitor
 * depends on: media ready + rights confirmed -> create Travail -> publish
 * -> publish the FR language -> appears via the exact read
 * `src/components/pages/WorkView.astro` now performs
 * (`listPublishedWorkItems` + `buildGalleryFromWorkItems`) -> its real
 * image resolves through `resolvePublicMediaObject` (the public route's
 * authorization). Also proves the negative cases the CMS "Élément publié"
 * flash used to paper over: a draft, and a published-but-invisible item,
 * both stay absent from what the public page would render.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, getTestBucket, closeTestDb } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as work from "../../src/lib/db/work";
import { buildGalleryFromWorkItems } from "../../src/lib/work-gallery-adapter";
import { resolvePublicMediaObject } from "../../src/lib/public-media";

let db: D1Database;
let bucket: R2Bucket;
const UPDATED_BY = "work-view-test@divinemotion.ca";

before(async () => {
  // Distinct persistence dir: this file runs alongside
  // public-media.test.ts in the `test:public` script, and both use
  // tests/dal/harness.ts — see that file's header comment for why
  // sharing the default dir races.
  db = await resetTestDb(".wrangler-test-public-workview");
  seedTestDb();
  bucket = await getTestBucket();
});

after(async () => {
  await closeTestDb();
});

/** Exactly what src/components/pages/WorkView.astro now does for a given locale. */
async function renderPublicWork(locale: "fr" | "en") {
  const items = await work.listPublishedWorkItems(db, locale);
  return buildGalleryFromWorkItems(items, locale);
}

describe("Validation Brief 014S bug B — publish -> real content appears publicly", () => {
  test("the full E2E chain: JPEG ready + rights confirmed -> create -> alt/caption FR+EN -> publish -> publish FR -> appears in the public FR gallery with a resolvable real image", async () => {
    const bytes = new TextEncoder().encode("fake JPEG bytes for the E2E work-view test");
    const created = await media.createMediaMetadata(
      db,
      { storageKey: "media/014s-b-e2e.jpg", mimeType: "image/jpeg", sizeBytes: bytes.byteLength },
      UPDATED_BY,
    );
    assert.ok(created.ok);
    if (!created.ok) return;
    const mediaId = created.data.id;
    await bucket.put("media/014s-b-e2e.jpg", bytes);
    await media.markMediaUploaded(db, mediaId);
    await media.markMediaReady(db, mediaId, { width: 4000, height: 3000 });
    await media.updateMediaMetadata(db, mediaId, { publicationRightsConfirmed: true }, UPDATED_BY);

    const draft = await work.createWorkItem(
      db,
      {
        mediaId,
        position: 999,
        ratio: "4/5",
        captionFr: "légende FR",
        captionEn: "caption EN",
        altFr: "alt FR",
        altEn: "alt EN",
        isVisible: true,
      },
      UPDATED_BY,
    );
    assert.ok(draft.ok);
    if (!draft.ok) return;

    const published = await work.publishWorkItem(db, draft.data.draftId, UPDATED_BY);
    assert.ok(published.ok, "CMS publish action itself must succeed");
    if (!published.ok) return;
    const publishedId = published.data.publishedId;

    // "Élément publié." in the CMS only ever meant the content merge —
    // the language is still a separate, explicit step (ADR-011/013).
    // Before that step, the public gallery must NOT show it yet.
    assert.equal((await renderPublicWork("fr")).some((b) => "image" in b && b.image.src === `/media/${mediaId}/file`), false);

    const langResult = await work.setWorkItemLanguageStatus(db, publishedId, "fr", "published", UPDATED_BY);
    assert.ok(langResult.ok);

    const frGallery = await renderPublicWork("fr");
    const block = frGallery.find((b) => "image" in b && b.image.src === `/media/${mediaId}/file`);
    assert.ok(block, "the published, FR-live item must now appear in the public FR gallery");
    assert.ok("image" in block!);
    assert.equal(block!.image.alt, "alt FR");
    assert.equal(block!.image.caption, "légende FR");

    // EN was never published — must not appear on the EN page yet.
    assert.equal((await renderPublicWork("en")).some((b) => "image" in b && b.image.src === `/media/${mediaId}/file`), false);

    // And the real image this block points at must actually resolve.
    const resolved = await resolvePublicMediaObject(db, bucket, mediaId);
    assert.ok(resolved, "the public page's real image must be readable through the public media route");
    assert.equal(resolved!.mimeType, "image/jpeg");
  });

  test("a draft (never published) never appears in the public gallery", async () => {
    const bytes = new TextEncoder().encode("fake JPEG for draft-exclusion test");
    const created = await media.createMediaMetadata(db, { storageKey: "media/014s-b-draft.jpg", mimeType: "image/jpeg", sizeBytes: bytes.byteLength }, UPDATED_BY);
    assert.ok(created.ok);
    if (!created.ok) return;
    await bucket.put("media/014s-b-draft.jpg", bytes);
    await media.markMediaUploaded(db, created.data.id);
    await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });
    await media.updateMediaMetadata(db, created.data.id, { publicationRightsConfirmed: true }, UPDATED_BY);

    const draft = await work.createWorkItem(db, { mediaId: created.data.id, position: 999, ratio: "4/5", altFr: "a", altEn: "a" }, UPDATED_BY);
    assert.ok(draft.ok);
    // Never published.

    const gallery = await renderPublicWork("fr");
    assert.equal(gallery.some((b) => "image" in b && b.image.src === `/media/${created.data.id}/file`), false);
  });

  test("a published item with is_visible=false never appears in the public gallery", async () => {
    const bytes = new TextEncoder().encode("fake JPEG for visibility-exclusion test");
    const created = await media.createMediaMetadata(db, { storageKey: "media/014s-b-invisible.jpg", mimeType: "image/jpeg", sizeBytes: bytes.byteLength }, UPDATED_BY);
    assert.ok(created.ok);
    if (!created.ok) return;
    await bucket.put("media/014s-b-invisible.jpg", bytes);
    await media.markMediaUploaded(db, created.data.id);
    await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });
    await media.updateMediaMetadata(db, created.data.id, { publicationRightsConfirmed: true }, UPDATED_BY);

    const draft = await work.createWorkItem(db, { mediaId: created.data.id, position: 999, ratio: "4/5", altFr: "a", altEn: "a", isVisible: false }, UPDATED_BY);
    assert.ok(draft.ok);
    if (!draft.ok) return;
    const published = await work.publishWorkItem(db, draft.data.draftId, UPDATED_BY);
    assert.ok(published.ok);
    if (!published.ok) return;
    await work.setWorkItemLanguageStatus(db, published.data.publishedId, "fr", "published", UPDATED_BY);

    const gallery = await renderPublicWork("fr");
    assert.equal(gallery.some((b) => "image" in b && b.image.src === `/media/${created.data.id}/file`), false);
  });

  test("publishing the language is blocked while media rights aren't confirmed — the public page correctly never sees it", async () => {
    const created = await media.createMediaMetadata(db, { storageKey: "media/014s-b-unrighted.jpg", mimeType: "image/jpeg", sizeBytes: 100 }, UPDATED_BY);
    assert.ok(created.ok);
    if (!created.ok) return;
    await media.markMediaUploaded(db, created.data.id);
    await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });
    // Rights left unconfirmed.

    const draft = await work.createWorkItem(db, { mediaId: created.data.id, position: 999, ratio: "4/5", altFr: "a", altEn: "a" }, UPDATED_BY);
    assert.ok(draft.ok);
    if (!draft.ok) return;
    const published = await work.publishWorkItem(db, draft.data.draftId, UPDATED_BY);
    assert.ok(published.ok);
    if (!published.ok) return;

    const langResult = await work.setWorkItemLanguageStatus(db, published.data.publishedId, "fr", "published", UPDATED_BY);
    assert.equal(langResult.ok, false);
    if (!langResult.ok) assert.equal(langResult.error.code, "PUBLICATION_RIGHTS_REQUIRED");

    const gallery = await renderPublicWork("fr");
    assert.equal(gallery.some((b) => "image" in b && b.image.src === `/media/${created.data.id}/file`), false);
  });
});
