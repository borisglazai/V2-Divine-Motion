/**
 * Services CMS — the full real chain a public visitor depends on: media
 * ready + rights confirmed -> create service -> publish -> publish the FR
 * language -> appears via the exact real read
 * `src/components/pages/ServicesView.astro` now performs
 * (`listPublishedServices`) -> its real image resolves through
 * `resolvePublicMediaObject` (the public route's authorization — same
 * mechanism as Travail, extended in this brief to also recognize
 * services usage, see src/lib/db/services.ts's
 * `isMediaUsedByPublicService`). Also proves the negative cases the CMS
 * "Service publié." flash used to paper over before this brief connected
 * the public page to D1: a draft, and a published-but-inactive service,
 * both stay absent from what the public page would render.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, getTestBucket, closeTestDb } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as services from "../../src/lib/db/services";
import { resolvePublicMediaObject } from "../../src/lib/public-media";

let db: D1Database;
let bucket: R2Bucket;
const UPDATED_BY = "services-view-test@divinemotion.ca";

before(async () => {
  // Distinct persistence dir — this file runs alongside
  // public-media.test.ts/work-view.test.ts in the `test:public` script,
  // all sharing tests/dal/harness.ts; see that file's header comment for
  // why sharing the default dir races.
  db = await resetTestDb(".wrangler-test-public-servicesview");
  seedTestDb();
  bucket = await getTestBucket();
});

after(async () => {
  await closeTestDb();
});

/** Exactly what src/components/pages/ServicesView.astro now does for a given locale's services array. */
async function renderPublicServices(locale: "fr" | "en") {
  return services.listPublishedServices(db, locale);
}

describe("Services CMS — publish -> real content appears publicly", () => {
  test("the full E2E chain: JPEG ready + rights confirmed -> create -> tagline/description/features FR+EN -> publish -> publish FR -> appears in the public FR list with a resolvable real image", async () => {
    const bytes = new TextEncoder().encode("fake JPEG bytes for the services E2E test");
    const created = await media.createMediaMetadata(
      db,
      { storageKey: "media/services-e2e.jpg", mimeType: "image/jpeg", sizeBytes: bytes.byteLength },
      UPDATED_BY,
    );
    assert.ok(created.ok);
    if (!created.ok) return;
    const mediaId = created.data.id;
    await bucket.put("media/services-e2e.jpg", bytes);
    await media.markMediaUploaded(db, mediaId);
    await media.markMediaReady(db, mediaId, { width: 4000, height: 3000 });
    await media.updateMediaMetadata(db, mediaId, { publicationRightsConfirmed: true }, UPDATED_BY);

    const draft = await services.createService(
      db,
      {
        slug: "services-e2e-test",
        mediaId,
        position: 999,
        ratio: "4/5",
        titleFr: "Titre FR",
        titleEn: "Title EN",
        taglineFr: "accroche FR",
        taglineEn: "hook EN",
        descriptionFr: "description FR",
        descriptionEn: "description EN",
        imageAltFr: "alt FR",
        imageAltEn: "alt EN",
        ctaLabelFr: "CTA FR",
        ctaLabelEn: "CTA EN",
        isActive: true,
      },
      [{ position: 1, textFr: "point FR", textEn: "highlight EN" }],
      UPDATED_BY,
    );
    assert.ok(draft.ok);
    if (!draft.ok) return;

    const published = await services.publishService(db, draft.data.draftId, UPDATED_BY);
    assert.ok(published.ok, "CMS publish action itself must succeed");
    if (!published.ok) return;
    const publishedId = published.data.publishedId;

    // "Service publié." only ever meant the content merge — the language
    // is still a separate, explicit step (same ADR-011/013 pattern as
    // Travail). Before that step, the public list must NOT show it yet.
    assert.equal((await renderPublicServices("fr")).some((s) => s.slug === "services-e2e-test"), false);

    const langResult = await services.setServiceLanguageStatus(db, publishedId, "fr", "published", UPDATED_BY);
    assert.ok(langResult.ok);

    const frServices = await renderPublicServices("fr");
    const service = frServices.find((s) => s.slug === "services-e2e-test");
    assert.ok(service, "the published, FR-live service must now appear in the public FR list");
    assert.equal(service!.title_fr, "Titre FR");
    assert.equal(service!.tagline_fr, "accroche FR");
    assert.equal(service!.features[0].text_fr, "point FR");

    // EN was never published — must not appear on the EN page yet.
    assert.equal((await renderPublicServices("en")).some((s) => s.slug === "services-e2e-test"), false);

    // And the real image this service points at must actually resolve
    // through the shared public media route.
    const resolved = await resolvePublicMediaObject(db, bucket, mediaId);
    assert.ok(resolved, "the public page's real image must be readable through the public media route");
    assert.equal(resolved!.mimeType, "image/jpeg");
  });

  test("a draft (never published) never appears in the public list", async () => {
    const bytes = new TextEncoder().encode("fake JPEG for draft-exclusion test");
    const created = await media.createMediaMetadata(db, { storageKey: "media/services-draft.jpg", mimeType: "image/jpeg", sizeBytes: bytes.byteLength }, UPDATED_BY);
    assert.ok(created.ok);
    if (!created.ok) return;
    await bucket.put("media/services-draft.jpg", bytes);
    await media.markMediaUploaded(db, created.data.id);
    await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });
    await media.updateMediaMetadata(db, created.data.id, { publicationRightsConfirmed: true }, UPDATED_BY);

    const draft = await services.createService(
      db,
      {
        slug: "services-draft-only",
        mediaId: created.data.id,
        position: 999,
        ratio: "4/5",
        titleFr: "a",
        titleEn: "a",
        descriptionFr: "a",
        descriptionEn: "a",
        imageAltFr: "a",
        imageAltEn: "a",
        ctaLabelFr: "a",
        ctaLabelEn: "a",
      },
      [],
      UPDATED_BY,
    );
    assert.ok(draft.ok);
    // Never published.

    const list = await renderPublicServices("fr");
    assert.equal(list.some((s) => s.slug === "services-draft-only"), false);
  });

  test("a published service with is_active=false never appears in the public list", async () => {
    const bytes = new TextEncoder().encode("fake JPEG for visibility-exclusion test");
    const created = await media.createMediaMetadata(db, { storageKey: "media/services-invisible.jpg", mimeType: "image/jpeg", sizeBytes: bytes.byteLength }, UPDATED_BY);
    assert.ok(created.ok);
    if (!created.ok) return;
    await bucket.put("media/services-invisible.jpg", bytes);
    await media.markMediaUploaded(db, created.data.id);
    await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });
    await media.updateMediaMetadata(db, created.data.id, { publicationRightsConfirmed: true }, UPDATED_BY);

    const draft = await services.createService(
      db,
      {
        slug: "services-invisible",
        mediaId: created.data.id,
        position: 999,
        ratio: "4/5",
        titleFr: "a",
        titleEn: "a",
        descriptionFr: "a",
        descriptionEn: "a",
        imageAltFr: "a",
        imageAltEn: "a",
        ctaLabelFr: "a",
        ctaLabelEn: "a",
        isActive: false,
      },
      [],
      UPDATED_BY,
    );
    assert.ok(draft.ok);
    if (!draft.ok) return;
    const published = await services.publishService(db, draft.data.draftId, UPDATED_BY);
    assert.ok(published.ok);
    if (!published.ok) return;
    await services.setServiceLanguageStatus(db, published.data.publishedId, "fr", "published", UPDATED_BY);

    const list = await renderPublicServices("fr");
    assert.equal(list.some((s) => s.slug === "services-invisible"), false);
  });

  test("publishing the language is blocked while media rights aren't confirmed — the public list correctly never sees it", async () => {
    const created = await media.createMediaMetadata(db, { storageKey: "media/services-unrighted.jpg", mimeType: "image/jpeg", sizeBytes: 100 }, UPDATED_BY);
    assert.ok(created.ok);
    if (!created.ok) return;
    await media.markMediaUploaded(db, created.data.id);
    await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });
    // Rights left unconfirmed.

    const draft = await services.createService(
      db,
      {
        slug: "services-unrighted",
        mediaId: created.data.id,
        position: 999,
        ratio: "4/5",
        titleFr: "a",
        titleEn: "a",
        descriptionFr: "a",
        descriptionEn: "a",
        imageAltFr: "a",
        imageAltEn: "a",
        ctaLabelFr: "a",
        ctaLabelEn: "a",
      },
      [],
      UPDATED_BY,
    );
    assert.ok(draft.ok);
    if (!draft.ok) return;
    const published = await services.publishService(db, draft.data.draftId, UPDATED_BY);
    assert.ok(published.ok);
    if (!published.ok) return;

    const langResult = await services.setServiceLanguageStatus(db, published.data.publishedId, "fr", "published", UPDATED_BY);
    assert.equal(langResult.ok, false);
    if (!langResult.ok) assert.equal(langResult.error.code, "PUBLICATION_RIGHTS_REQUIRED");

    const list = await renderPublicServices("fr");
    assert.equal(list.some((s) => s.slug === "services-unrighted"), false);
  });
});
