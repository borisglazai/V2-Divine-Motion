/**
 * Services CMS mutation logic tests — same shape as
 * tests/admin/work-endpoints.test.ts: calls the real action functions in
 * src/lib/admin/services-actions.ts directly (the exact functions the
 * Astro endpoints in src/pages/admin/services/**\/*.ts delegate to)
 * against a real local D1 via the Brief 011 Miniflare harness.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, closeTestDb } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as services from "../../src/lib/db/services";
import {
  createServiceAction,
  saveServiceAction,
  publishServiceAction,
  deleteServiceDraftAction,
  setServiceLanguageStatusAction,
  reorderServicesAction,
} from "../../src/lib/admin/services-actions";

let db: D1Database;
const UPDATED_BY = "services-cms-test-admin@divinemotion.ca";

before(async () => {
  db = await resetTestDb();
  seedTestDb();
});

after(async () => {
  await closeTestDb();
});

async function findMediaId(storageKey: string): Promise<number> {
  const row = await db.prepare("SELECT id FROM media WHERE storage_key = ?").bind(storageKey).first<{ id: number }>();
  return row!.id;
}

function serviceForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    slug: "cms-test-service",
    mediaId: "1",
    position: "1",
    ratio: "4/5",
    titleFr: "Service test",
    titleEn: "Test service",
    taglineFr: "Une courte accroche",
    taglineEn: "A short hook",
    descriptionFr: "Description",
    descriptionEn: "Description",
    imageAltFr: "alt fr",
    imageAltEn: "alt en",
    ctaLabelFr: "Contactez-nous",
    ctaLabelEn: "Contact us",
    isActive: "on",
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) fd.set(key, value);
  return fd;
}

describe("Services CMS — full create -> save -> publish cycle", () => {
  let draftId: number;

  test("create draft", async () => {
    const mediaId = await findMediaId("media/seed-a.jpg");
    const result = await createServiceAction(db, serviceForm({ mediaId: String(mediaId), titleFr: "Original FR" }), UPDATED_BY);
    assert.match(result.redirect, /^\/admin\/services\/\d+\?flash=success/);
    draftId = Number(result.redirect.match(/\/admin\/services\/(\d+)/)![1]);

    const row = await services.getService(db, draftId);
    assert.equal(row!.status, "draft");
    assert.equal(row!.draft_of_id, null, "brand-new service, never published before");
    assert.equal(row!.title_fr, "Original FR");
    assert.equal(row!.tagline_fr, "Une courte accroche");
  });

  test("create rejects a media that isn't ready (never disabled, never silently used)", async () => {
    const createdMedia = await media.createMediaMetadata(db, { storageKey: "media/cms-svc-not-ready.jpg", mimeType: "image/jpeg", sizeBytes: 1 });
    assert.ok(createdMedia.ok);
    if (!createdMedia.ok) return;
    const result = await createServiceAction(db, serviceForm({ mediaId: String(createdMedia.data.id) }), UPDATED_BY);
    assert.match(result.redirect, /error_mediaId/);
  });

  test("save draft updates only the draft, features included", async () => {
    const fd = serviceForm({ titleFr: "Updated FR" });
    fd.append("featureTextFr", "Point 1");
    fd.append("featureTextEn", "Highlight 1");
    const result = await saveServiceAction(db, draftId, fd, UPDATED_BY);
    if ("notFound" in result) throw new Error("unexpected 404");
    assert.match(result.redirect, /flash=success/);

    const row = await services.getService(db, draftId);
    assert.equal(row!.title_fr, "Updated FR");
    assert.equal(row!.features.length, 1);
    assert.equal(row!.features[0].text_fr, "Point 1");
  });

  test("publish promotes the brand-new draft in place — no rights required (nothing live yet)", async () => {
    const result = await publishServiceAction(db, draftId, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    const row = await services.getService(db, draftId);
    assert.equal(row!.status, "published");
    assert.equal(row!.title_fr, "Updated FR");
    assert.equal(row!.features.length, 1);
  });
});

describe("Services CMS — editing an already-published service auto-creates a draft, public row stays untouched", () => {
  let publishedId: number;
  let originalTitle: string;

  test("setup: a published seed service", async () => {
    const all = await services.listAllServices(db);
    const published = all.filter((r) => r.status === "published")[0];
    publishedId = published.id;
    originalTitle = published.title_fr;
  });

  test("save auto-creates a draft and leaves the published row untouched", async () => {
    const mediaId = await findMediaId("media/seed-a.jpg");
    const result = await saveServiceAction(db, publishedId, serviceForm({ mediaId: String(mediaId), titleFr: "ISOLATION TEST TITLE" }), UPDATED_BY);
    if ("notFound" in result) throw new Error("unexpected 404");
    assert.match(result.redirect, /flash=success/);

    const publicRow = await services.getService(db, publishedId);
    assert.equal(publicRow!.title_fr, originalTitle, "the published row must be untouched by a save");

    const draft = await services.getServiceDraft(db, publishedId);
    assert.ok(draft, "a draft must have been created");
    assert.equal(draft!.title_fr, "ISOLATION TEST TITLE");
  });
});

describe("Services CMS — delete draft", () => {
  test("delete-draft removes only the draft, never a published row", async () => {
    const mediaId = await findMediaId("media/seed-b.jpg");
    const created = await services.createService(
      db,
      {
        slug: "to-delete",
        mediaId,
        position: 50,
        ratio: "1/1",
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
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const draftId = created.data.draftId;

    const result = await deleteServiceDraftAction(db, draftId);
    assert.match(result.redirect, /flash=success/);
    assert.equal(await services.getService(db, draftId), null);
  });
});

describe("Services CMS — FR/EN independence + publication rights via the language-status action", () => {
  let itemId: number;
  let unrightedMediaId: number;

  test("setup: a published service on a media without confirmed rights", async () => {
    const createdMedia = await media.createMediaMetadata(db, {
      storageKey: "media/cms-svc-unrighted.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    assert.equal(createdMedia.ok, true);
    if (!createdMedia.ok) return;
    unrightedMediaId = createdMedia.data.id;

    const created = await services.createService(
      db,
      {
        slug: "cms-svc-rights-test",
        mediaId: unrightedMediaId,
        position: 51,
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
    assert.equal(created.ok, true);
    if (!created.ok) return;
    itemId = created.data.draftId;
    await services.publishService(db, itemId);
  });

  test("publication rights required: FR publish is blocked with a clear message, not raw SQL", async () => {
    const fd = new FormData();
    fd.set("locale", "fr");
    fd.set("status", "published");
    const result = await setServiceLanguageStatusAction(db, itemId, fd, UPDATED_BY);
    assert.match(result.redirect, /flash=error/);
    const message = new URL(result.redirect, "http://placeholder.local").searchParams.get("flash_message");
    assert.match(message ?? "", /Publication impossible/);

    const row = await services.getService(db, itemId);
    assert.equal(row!.fr_status, "draft", "must not have been published");
  });

  test("confirming rights unblocks FR publish; EN stays independent", async () => {
    await media.updateMediaMetadata(db, unrightedMediaId, { publicationRightsConfirmed: true });

    const frForm = new FormData();
    frForm.set("locale", "fr");
    frForm.set("status", "published");
    const frResult = await setServiceLanguageStatusAction(db, itemId, frForm, UPDATED_BY);
    assert.match(frResult.redirect, /flash=success/);

    const row = await services.getService(db, itemId);
    assert.equal(row!.fr_status, "published");
    assert.equal(row!.en_status, "draft", "EN must remain untouched by the FR-only action");
  });

  test("swapping the media on an already-live row back to an unrighted one is blocked at publish time (media-change guard)", async () => {
    const anotherUnrighted = await media.createMediaMetadata(db, {
      storageKey: "media/cms-svc-unrighted-2.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    assert.ok(anotherUnrighted.ok);
    if (!anotherUnrighted.ok) return;

    const draftResult = await services.createServiceDraft(db, itemId, UPDATED_BY);
    assert.ok(draftResult.ok);
    if (!draftResult.ok) return;
    await services.updateServiceDraft(db, draftResult.data.draftId, { mediaId: anotherUnrighted.data.id }, UPDATED_BY);

    const publishResult = await publishServiceAction(db, draftResult.data.draftId, UPDATED_BY);
    assert.match(publishResult.redirect, /flash=error/);
    const message = new URL(publishResult.redirect, "http://placeholder.local").searchParams.get("flash_message");
    assert.match(message ?? "", /Publication impossible/);

    const row = await services.getService(db, itemId);
    assert.equal(row!.media_id, unrightedMediaId, "the live row's media must be untouched by the blocked publish");
  });
});

describe("Services CMS — draft-safe reordering", () => {
  test("reorder writes only to draft shadows, never directly to published rows", async () => {
    const all = await services.listAllServices(db);
    const published = all.filter((r) => r.status === "published");
    assert.ok(published.length >= 2, "seed must provide at least 2 published services to reorder");

    const originalPositions = new Map(published.map((r) => [r.id, r.position]));
    const reversedIds = published.map((r) => r.id).reverse();

    const fd = new FormData();
    fd.set("orderedIds", JSON.stringify(reversedIds));
    const result = await reorderServicesAction(db, fd, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    for (const id of reversedIds) {
      const publicRow = await services.getService(db, id);
      assert.equal(publicRow!.position, originalPositions.get(id), "the published row's position must be untouched — reorder is draft-only");
      const draft = await services.getServiceDraft(db, id);
      assert.ok(draft, `expected a draft shadow for service #${id}`);
    }
  });
});
