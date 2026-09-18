/**
 * Home "Services" preview (Visual Editor Phase 4 addendum) — proves the
 * exact real chain `src/components/pages/HomeView.astro` now performs:
 * `listPublishedServices(db, locale)` (src/lib/db/services.ts), capped at
 * 3, feeding the 3 editorial cards — replacing the old
 * `homeMock.servicesPreview.items` + `placeholderPhotos` rendering.
 * Services (`/admin/services`) stays the only place these cards are
 * curated. `services.media_id` is `NOT NULL` in the schema (migration
 * 0001) — every published service already has a real, required media, so
 * there is no "no media" branch to test here (unlike Témoignages' optional
 * photo).
 *
 * Same create -> publish -> publish-language chain as
 * tests/public/testimonials-view.test.ts / home-work-preview.test.ts,
 * applied to services. Filter tests read the uncapped
 * `listPublishedServices` result directly (this file's tests share one
 * persisted db and accumulate rows — see home-work-preview.test.ts's
 * header for why); the "cap at 3" test applies HomeView.astro's own
 * `.slice(0, 3)` itself, using deliberately very-low `position` values so
 * its own batch occupies the global top of the position-ascending order.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, getTestBucket, closeTestDb } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as services from "../../src/lib/db/services";
import { resolvePublicMediaObject } from "../../src/lib/public-media";

let db: D1Database;
let bucket: R2Bucket;
const UPDATED_BY = "home-services-preview-test@divinemotion.ca";
let nextSuffix = 0;

before(async () => {
  db = await resetTestDb(".wrangler-test-public-homeservicespreview");
  seedTestDb();
  bucket = await getTestBucket();
});

after(async () => {
  await closeTestDb();
});

interface CreatePublishedServiceOptions {
  position: number;
  publishFr?: boolean;
  publishEn?: boolean;
  isActive?: boolean;
}

/** Creates a real ready+rights-confirmed media object, then a service, published (row-merge only — language publication is a separate step). */
async function createPublishedService(opts: CreatePublishedServiceOptions): Promise<{ id: number; mediaId: number }> {
  const suffix = nextSuffix++;
  const bytes = new TextEncoder().encode(`fake JPEG bytes for home-services-preview test #${suffix}`);
  const storageKey = `media/home-services-preview-${suffix}.jpg`;
  const createdMedia = await media.createMediaMetadata(db, { storageKey, mimeType: "image/jpeg", sizeBytes: bytes.byteLength }, UPDATED_BY);
  assert.ok(createdMedia.ok);
  if (!createdMedia.ok) throw new Error("unreachable");
  const mediaId = createdMedia.data.id;
  await bucket.put(storageKey, bytes);
  await media.markMediaUploaded(db, mediaId);
  await media.markMediaReady(db, mediaId, { width: 400, height: 500 });
  await media.updateMediaMetadata(db, mediaId, { publicationRightsConfirmed: true }, UPDATED_BY);

  const draft = await services.createService(
    db,
    {
      slug: `home-preview-test-${suffix}`,
      titleFr: `Titre FR ${suffix}`,
      titleEn: `Title EN ${suffix}`,
      descriptionFr: `Description FR ${suffix}`,
      descriptionEn: `Description EN ${suffix}`,
      mediaId,
      ratio: "4/5",
      imageAltFr: `Alt FR ${suffix}`,
      imageAltEn: `Alt EN ${suffix}`,
      ctaLabelFr: "En savoir plus",
      ctaLabelEn: "Learn more",
      position: opts.position,
      isActive: opts.isActive ?? true,
    },
    [],
    UPDATED_BY,
  );
  assert.ok(draft.ok);
  if (!draft.ok) throw new Error("unreachable");

  const published = await services.publishService(db, draft.data.draftId, UPDATED_BY);
  assert.ok(published.ok);
  if (!published.ok) throw new Error("unreachable");
  const id = published.data.publishedId;

  if (opts.publishFr ?? true) {
    const fr = await services.setServiceLanguageStatus(db, id, "fr", "published", UPDATED_BY);
    assert.ok(fr.ok);
  }
  if (opts.publishEn) {
    const en = await services.setServiceLanguageStatus(db, id, "en", "published", UPDATED_BY);
    assert.ok(en.ok);
  }

  return { id, mediaId };
}

describe("Home Services preview — real services, not homeMock", () => {
  test("a published, active service appears in the FR preview with its real title/description", async () => {
    const suffix = nextSuffix;
    const { id } = await createPublishedService({ position: 8001 });
    const list = await services.listPublishedServices(db, "fr");
    const item = list.find((s) => s.id === id);
    assert.ok(item, "a published, active service must appear");
    assert.equal(item!.title_fr, `Titre FR ${suffix}`);
    assert.equal(item!.description_fr, `Description FR ${suffix}`);
  });

  test("a service never published (fr) never appears in the FR preview", async () => {
    const { id } = await createPublishedService({ position: 8002, publishFr: false });
    const list = await services.listPublishedServices(db, "fr");
    assert.equal(
      list.some((s) => s.id === id),
      false,
    );
  });

  test("an inactive service (is_active=0) never appears, even if published", async () => {
    const { id } = await createPublishedService({ position: 8003, isActive: false });
    const list = await services.listPublishedServices(db, "fr");
    assert.equal(
      list.some((s) => s.id === id),
      false,
    );
  });

  test("services are ordered by position, ascending", async () => {
    const late = await createPublishedService({ position: 8201 });
    const early = await createPublishedService({ position: 8200 });
    const list = await services.listPublishedServices(db, "fr");
    const earlyIndex = list.findIndex((s) => s.id === early.id);
    const lateIndex = list.findIndex((s) => s.id === late.id);
    assert.ok(earlyIndex !== -1 && lateIndex !== -1);
    assert.ok(earlyIndex < lateIndex, "the lower-position service must come first");
  });

  test("the service's media (required, NOT NULL) resolves through the real public media route", async () => {
    const { mediaId } = await createPublishedService({ position: 8300 });
    const resolved = await resolvePublicMediaObject(db, bucket, mediaId);
    assert.ok(resolved, "a published service's media must be publicly resolvable");
    assert.equal(resolved!.mimeType, "image/jpeg");
  });

  test("EN preview stays empty for a service only published in FR", async () => {
    const { id } = await createPublishedService({ position: 8400, publishFr: true, publishEn: false });
    const enList = await services.listPublishedServices(db, "en");
    assert.equal(
      enList.some((s) => s.id === id),
      false,
    );
  });

  test("HomeView.astro's own cap: at most 3 services are ever rendered, and they're the 3 lowest by position", async () => {
    // Very-low (negative) positions guarantee this batch sorts before
    // every other row already in this shared test db (seed data starts
    // at position 1; every other test in this file uses positions >=
    // 8000).
    const created: number[] = [];
    for (let i = 0; i < 5; i++) {
      const { id } = await createPublishedService({ position: -200 + i });
      created.push(id);
    }
    const capped = (await services.listPublishedServices(db, "fr")).slice(0, 3);
    assert.equal(capped.length, 3, "the preview must show exactly 3 when 3+ are available");
    assert.deepEqual(
      capped.map((s) => s.id),
      created.slice(0, 3),
      "the 3 shown must be the 3 lowest-position published services",
    );
  });
});
