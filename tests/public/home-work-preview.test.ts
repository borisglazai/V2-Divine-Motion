/**
 * Home "Travail" preview (Visual Editor Phase 4 addendum) — proves the
 * exact real chain `src/components/pages/HomeView.astro` now performs:
 * `listFeaturedOnHome(db, locale)` (src/lib/db/work.ts), capped at 6,
 * feeding the mosaic — replacing the old `homeMock.workPreview.items` +
 * `placeholderPhotos` rendering. Travail (`/admin/work`) stays the only
 * place this selection is curated: no Home-specific table, no
 * Home-specific DAL function.
 *
 * Same create -> publish -> publish-language chain as
 * tests/public/testimonials-view.test.ts, applied to work_items.
 *
 * Two kinds of assertions here, deliberately separated:
 *  - Filter tests (featured/not, unpublished, masked, order, FR/EN) read
 *    the UNCAPPED `listFeaturedOnHome` result directly — this file's tests
 *    all share one persisted db (tests/dal/harness.ts convention) and
 *    accumulate rows across the whole suite, so asserting against the
 *    always-growing full list (never the capped-to-6 slice) keeps each
 *    test valid regardless of what earlier tests already inserted.
 *  - The one "cap at 6" test applies HomeView.astro's own `.slice(0, 6)`
 *    itself, using deliberately very-low (negative) `position` values so
 *    its own batch is guaranteed to occupy the global top of the
 *    position-ascending order — decoupling it from whatever the rest of
 *    the suite has already inserted at that point.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, getTestBucket, closeTestDb } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as work from "../../src/lib/db/work";
import { resolvePublicMediaObject } from "../../src/lib/public-media";

let db: D1Database;
let bucket: R2Bucket;
const UPDATED_BY = "home-work-preview-test@divinemotion.ca";
let nextSuffix = 0;

before(async () => {
  db = await resetTestDb(".wrangler-test-public-homeworkpreview");
  seedTestDb();
  bucket = await getTestBucket();
});

after(async () => {
  await closeTestDb();
});

interface CreatePublishedWorkItemOptions {
  position: number;
  featuredOnHome?: boolean;
  isVisible?: boolean;
  publishFr?: boolean;
  publishEn?: boolean;
}

/** Creates a real ready+rights-confirmed media object, then a work item, published (row-merge only — language publication is a separate step, per ADR-011/013). */
async function createPublishedWorkItem(opts: CreatePublishedWorkItemOptions): Promise<{ id: number; mediaId: number }> {
  const suffix = nextSuffix++;
  const bytes = new TextEncoder().encode(`fake JPEG bytes for home-work-preview test #${suffix}`);
  const storageKey = `media/home-work-preview-${suffix}.jpg`;
  const createdMedia = await media.createMediaMetadata(db, { storageKey, mimeType: "image/jpeg", sizeBytes: bytes.byteLength }, UPDATED_BY);
  assert.ok(createdMedia.ok);
  if (!createdMedia.ok) throw new Error("unreachable");
  const mediaId = createdMedia.data.id;
  await bucket.put(storageKey, bytes);
  await media.markMediaUploaded(db, mediaId);
  await media.markMediaReady(db, mediaId, { width: 400, height: 300 });
  await media.updateMediaMetadata(db, mediaId, { publicationRightsConfirmed: true }, UPDATED_BY);

  const draft = await work.createWorkItem(
    db,
    {
      mediaId,
      position: opts.position,
      ratio: "3/2",
      altFr: `Alt FR ${suffix}`,
      altEn: `Alt EN ${suffix}`,
      isVisible: opts.isVisible ?? true,
      featuredOnHome: opts.featuredOnHome ?? true,
    },
    UPDATED_BY,
  );
  assert.ok(draft.ok);
  if (!draft.ok) throw new Error("unreachable");

  const published = await work.publishWorkItem(db, draft.data.draftId, UPDATED_BY);
  assert.ok(published.ok);
  if (!published.ok) throw new Error("unreachable");
  const id = published.data.publishedId;

  if (opts.publishFr ?? true) {
    const fr = await work.setWorkItemLanguageStatus(db, id, "fr", "published", UPDATED_BY);
    assert.ok(fr.ok);
  }
  if (opts.publishEn) {
    const en = await work.setWorkItemLanguageStatus(db, id, "en", "published", UPDATED_BY);
    assert.ok(en.ok);
  }

  return { id, mediaId };
}

describe("Home Travail preview — real work_items, not homeMock", () => {
  test("a featured_on_home=1, published, visible item appears in the FR preview", async () => {
    const { id } = await createPublishedWorkItem({ position: 9001, featuredOnHome: true });
    const list = await work.listFeaturedOnHome(db, "fr");
    assert.ok(
      list.some((item) => item.id === id),
      "featured_on_home=1 must appear",
    );
  });

  test("featured_on_home=0 never appears in the preview", async () => {
    const { id } = await createPublishedWorkItem({ position: 9002, featuredOnHome: false });
    const list = await work.listFeaturedOnHome(db, "fr");
    assert.equal(
      list.some((item) => item.id === id),
      false,
      "featured_on_home=0 must never appear",
    );
  });

  test("an item never published (fr) never appears in the FR preview", async () => {
    const { id } = await createPublishedWorkItem({ position: 9003, featuredOnHome: true, publishFr: false });
    const list = await work.listFeaturedOnHome(db, "fr");
    assert.equal(
      list.some((item) => item.id === id),
      false,
      "unpublished-in-fr item must never appear on the FR preview",
    );
  });

  test("a masked item (is_visible=0) never appears, even if featured_on_home=1 and published", async () => {
    const { id } = await createPublishedWorkItem({ position: 9004, featuredOnHome: true, isVisible: false });
    const list = await work.listFeaturedOnHome(db, "fr");
    assert.equal(
      list.some((item) => item.id === id),
      false,
      "masked item must never appear",
    );
  });

  test("items are ordered by position, ascending", async () => {
    const late = await createPublishedWorkItem({ position: 9201, featuredOnHome: true });
    const early = await createPublishedWorkItem({ position: 9200, featuredOnHome: true });
    const list = await work.listFeaturedOnHome(db, "fr");
    const earlyIndex = list.findIndex((item) => item.id === early.id);
    const lateIndex = list.findIndex((item) => item.id === late.id);
    assert.ok(earlyIndex !== -1 && lateIndex !== -1);
    assert.ok(earlyIndex < lateIndex, "the lower-position item must come first");
  });

  test("the preview's media resolves through the real public media route (ready, rights confirmed, publicly authorized)", async () => {
    const { mediaId } = await createPublishedWorkItem({ position: 9300, featuredOnHome: true });
    const resolved = await resolvePublicMediaObject(db, bucket, mediaId);
    assert.ok(resolved, "featured work item's media must be publicly resolvable, same as any Travail media");
    assert.equal(resolved!.mimeType, "image/jpeg");
  });

  test("EN preview stays empty for an item only published in FR", async () => {
    const { id } = await createPublishedWorkItem({ position: 9400, featuredOnHome: true, publishFr: true, publishEn: false });
    const enList = await work.listFeaturedOnHome(db, "en");
    assert.equal(
      enList.some((item) => item.id === id),
      false,
    );
  });

  test("HomeView.astro's own cap: at most 6 items are ever rendered, even when more than 6 are featured, and they're the 6 lowest by position", async () => {
    // Very-low (negative) positions guarantee this batch sorts before
    // every other row already in this shared test db (seed data is
    // positions 1-6; every other test in this file uses positions >=
    // 9000) — this test's own top-6 window is exactly its own items,
    // regardless of what already ran before it.
    const created: number[] = [];
    for (let i = 0; i < 9; i++) {
      const { id } = await createPublishedWorkItem({ position: -200 + i, featuredOnHome: true });
      created.push(id);
    }
    const capped = (await work.listFeaturedOnHome(db, "fr")).slice(0, 6);
    assert.equal(capped.length, 6, "the preview must show exactly 6 when 6+ are available");
    assert.deepEqual(
      capped.map((item) => item.id),
      created.slice(0, 6),
      "the 6 shown must be the 6 lowest-position featured items",
    );
  });
});
