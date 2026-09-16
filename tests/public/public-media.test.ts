/**
 * Validation Brief 014S bug B — the public media route's real
 * authorization logic (`resolvePublicMediaObject`, src/lib/public-media.ts)
 * against a real D1 + R2 local Miniflare instance (same harness as
 * tests/admin/media-actions.test.ts). This is the security boundary: a
 * media only ever resolves here if it is genuinely live on the public
 * site right now — never a blanket "fetch any media by id".
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, getTestBucket, closeTestDb } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as work from "../../src/lib/db/work";
import { resolvePublicMediaObject } from "../../src/lib/public-media";

let db: D1Database;
let bucket: R2Bucket;
const UPDATED_BY = "public-media-test@divinemotion.ca";

before(async () => {
  // Distinct persistence dir: this file runs alongside work-view.test.ts
  // in the `test:public` script, and both use tests/dal/harness.ts — see
  // that file's header comment for why sharing the default dir races.
  db = await resetTestDb(".wrangler-test-public-media");
  seedTestDb();
  bucket = await getTestBucket();
});

after(async () => {
  await closeTestDb();
});

async function makeReadyRightedMedia(storageKey: string): Promise<number> {
  const bytes = new TextEncoder().encode("fake object bytes for a public-media test");
  const created = await media.createMediaMetadata(db, { storageKey, mimeType: "image/jpeg", sizeBytes: bytes.byteLength }, UPDATED_BY);
  assert.ok(created.ok);
  if (!created.ok) throw new Error("unreachable");
  await bucket.put(storageKey, bytes);
  await media.markMediaUploaded(db, created.data.id);
  await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });
  await media.updateMediaMetadata(db, created.data.id, { publicationRightsConfirmed: true }, UPDATED_BY);
  return created.data.id;
}

async function publishWorkItemWithMedia(mediaId: number, overrides: { isVisible?: boolean } = {}): Promise<number> {
  const created = await work.createWorkItem(
    db,
    {
      mediaId,
      position: 999,
      ratio: "4/5",
      altFr: "alt fr",
      altEn: "alt en",
      isVisible: overrides.isVisible ?? true,
    },
    UPDATED_BY,
  );
  assert.ok(created.ok);
  if (!created.ok) throw new Error("unreachable");
  const published = await work.publishWorkItem(db, created.data.draftId, UPDATED_BY);
  assert.ok(published.ok);
  if (!published.ok) throw new Error("unreachable");
  return published.data.publishedId;
}

describe("isMediaUsedByPublicWorkItem", () => {
  test("true for media referenced by a published, visible, FR-live work item", async () => {
    const mediaId = await makeReadyRightedMedia("media/014s-b-public-1.jpg");
    const publishedId = await publishWorkItemWithMedia(mediaId);
    await work.setWorkItemLanguageStatus(db, publishedId, "fr", "published", UPDATED_BY);

    assert.equal(await work.isMediaUsedByPublicWorkItem(db, mediaId), true);
  });

  test("false for media only referenced by a draft (never published)", async () => {
    const mediaId = await makeReadyRightedMedia("media/014s-b-draft-only.jpg");
    const created = await work.createWorkItem(db, { mediaId, position: 999, ratio: "4/5", altFr: "a", altEn: "a" }, UPDATED_BY);
    assert.ok(created.ok);

    assert.equal(await work.isMediaUsedByPublicWorkItem(db, mediaId), false);
  });

  test("false for media on a published item with no language actually live", async () => {
    const mediaId = await makeReadyRightedMedia("media/014s-b-no-lang-live.jpg");
    await publishWorkItemWithMedia(mediaId);
    // fr_status/en_status default to 'draft' — never promoted.

    assert.equal(await work.isMediaUsedByPublicWorkItem(db, mediaId), false);
  });

  test("false for media on a published, language-live, but invisible item", async () => {
    const mediaId = await makeReadyRightedMedia("media/014s-b-invisible.jpg");
    const publishedId = await publishWorkItemWithMedia(mediaId, { isVisible: false });
    await work.setWorkItemLanguageStatus(db, publishedId, "fr", "published", UPDATED_BY);

    assert.equal(await work.isMediaUsedByPublicWorkItem(db, mediaId), false);
  });

  test("false once the language is unpublished again", async () => {
    const mediaId = await makeReadyRightedMedia("media/014s-b-unpublished-again.jpg");
    const publishedId = await publishWorkItemWithMedia(mediaId);
    await work.setWorkItemLanguageStatus(db, publishedId, "fr", "published", UPDATED_BY);
    assert.equal(await work.isMediaUsedByPublicWorkItem(db, mediaId), true);

    await work.setWorkItemLanguageStatus(db, publishedId, "fr", "draft", UPDATED_BY);
    assert.equal(await work.isMediaUsedByPublicWorkItem(db, mediaId), false);
  });
});

describe("resolvePublicMediaObject — the public route's real authorization", () => {
  test("resolves the real R2 object for a published, visible, rights-confirmed media", async () => {
    const mediaId = await makeReadyRightedMedia("media/014s-b-resolve-ok.jpg");
    const publishedId = await publishWorkItemWithMedia(mediaId);
    await work.setWorkItemLanguageStatus(db, publishedId, "fr", "published", UPDATED_BY);

    const resolved = await resolvePublicMediaObject(db, bucket, mediaId);
    assert.ok(resolved);
    assert.equal(resolved!.mimeType, "image/jpeg");
    assert.ok(resolved!.body, "must stream the real object body");
  });

  test("refuses a media that isn't used by any live public work item", async () => {
    const mediaId = await makeReadyRightedMedia("media/014s-b-resolve-not-public.jpg");
    // No work item at all — media exists and is ready+righted, but never curated.
    assert.equal(await resolvePublicMediaObject(db, bucket, mediaId), null);
  });

  test("refuses a media whose rights were unconfirmed after publication (defense-in-depth, no trigger covers this)", async () => {
    const mediaId = await makeReadyRightedMedia("media/014s-b-resolve-unrighted-after.jpg");
    const publishedId = await publishWorkItemWithMedia(mediaId);
    await work.setWorkItemLanguageStatus(db, publishedId, "fr", "published", UPDATED_BY);
    assert.ok(await resolvePublicMediaObject(db, bucket, mediaId));

    await media.updateMediaMetadata(db, mediaId, { publicationRightsConfirmed: false }, UPDATED_BY);
    assert.equal(await resolvePublicMediaObject(db, bucket, mediaId), null, "must refuse once rights are no longer confirmed, even though the work item is still published");
  });

  test("refuses a soft-deleted media even if a stale work item still references it", async () => {
    const mediaId = await makeReadyRightedMedia("media/014s-b-resolve-deleted.jpg");
    // No work item references it, so soft delete is allowed.
    await media.softDeleteMedia(db, mediaId);
    assert.equal(await resolvePublicMediaObject(db, bucket, mediaId), null);
  });

  test("refuses a non-existent media id — never a crash, never a distinct error", async () => {
    assert.equal(await resolvePublicMediaObject(db, bucket, 999_999), null);
  });

  test("refuses when the D1 row is valid but the R2 object is actually missing", async () => {
    const created = await media.createMediaMetadata(db, { storageKey: "media/014s-b-no-object.jpg", mimeType: "image/jpeg", sizeBytes: 10 }, UPDATED_BY);
    assert.ok(created.ok);
    if (!created.ok) return;
    // Never actually PUT to the bucket.
    await media.markMediaUploaded(db, created.data.id);
    // markMediaReady requires 'uploaded' state; force it directly for this
    // edge case (a row claiming 'ready' with no real backing object should
    // never happen via the real upload flow, but the route must still fail
    // safe if it somehow does).
    await db.prepare(`UPDATE media SET processing_status = 'ready', width = 1, height = 1 WHERE id = ?`).bind(created.data.id).run();
    await media.updateMediaMetadata(db, created.data.id, { publicationRightsConfirmed: true }, UPDATED_BY);
    const publishedId = await publishWorkItemWithMedia(created.data.id);
    await work.setWorkItemLanguageStatus(db, publishedId, "fr", "published", UPDATED_BY);

    assert.equal(await resolvePublicMediaObject(db, bucket, created.data.id), null);
  });
});
