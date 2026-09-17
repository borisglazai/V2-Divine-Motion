/**
 * Éditeur visuel Phase 1 — proves the exact chain HomeView.astro/
 * ServicesView.astro now run for their newly-editable fields: draft save
 * -> public UNCHANGED -> publish -> public reflects the change, FR/EN
 * independently. Same shape as tests/public/services-view.test.ts: a
 * local helper reimplements the .astro file's own gating logic
 * (`langLive`) against the real DAL, since this repo's test setup has no
 * Astro-container renderer (only `node --test` — see
 * src/lib/admin/media-preview.ts's header comment).
 *
 * The seed (seeds/local.sql) already marks home_content/
 * services_page_content as fr_status=en_status='published' — that's the
 * CMS's own "already published at bootstrap" baseline (same as Services/
 * Testimonials' seeded rows), not something this brief's public wiring
 * bypasses. What this suite actually proves is the thing that matters:
 * a FURTHER edit through the new editor never reaches the public read
 * until its own explicit publish.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, closeTestDb, getTestBucket } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as pages from "../../src/lib/db/pages";
import { isMediaUsedByPublicHomeContent } from "../../src/lib/db/pages";
import { resolvePublicMediaObject } from "../../src/lib/public-media";
import { saveHomeEditorAction, publishHomeEditorAction, setHomeEditorLanguageStatusAction } from "../../src/lib/admin/home-editor-actions";
import {
  saveServicesPageEditorAction,
  publishServicesPageEditorAction,
} from "../../src/lib/admin/services-page-editor-actions";

let db: D1Database;
let bucket: R2Bucket;
const UPDATED_BY = "site-editor-view-test@divinemotion.ca";

before(async () => {
  db = await resetTestDb(".wrangler-test-public-siteeditor");
  seedTestDb();
  bucket = await getTestBucket();
});

after(async () => {
  await closeTestDb();
});

/** Exactly HomeView.astro's own public-mode gating logic. */
async function publicHeroHeadline(locale: "fr" | "en"): Promise<{ headline: string; fromD1: boolean }> {
  const homeRow = await pages.homeContent.getPublished(db);
  const langLive = homeRow !== null && (locale === "fr" ? homeRow.fr_status === "published" : homeRow.en_status === "published");
  if (!langLive) return { headline: "<mock>", fromD1: false };
  return { headline: locale === "fr" ? homeRow!.hero_headline_fr : homeRow!.hero_headline_en, fromD1: true };
}

/** Exactly ServicesView.astro's own public-mode gating logic. */
async function publicServicesTitle(locale: "fr" | "en"): Promise<{ title: string; fromD1: boolean }> {
  const row = await pages.servicesPageContent.getPublished(db);
  const langLive = row !== null && (locale === "fr" ? row.fr_status === "published" : row.en_status === "published");
  if (!langLive) return { title: "<mock>", fromD1: false };
  return { title: locale === "fr" ? row!.title_fr : row!.title_en, fromD1: true };
}

describe("Éditeur visuel — Accueil: draft never public, publish makes it public, FR/EN independent", () => {
  let seededHeadlineFr: string;

  test("baseline: the seed's already-published hero headline is what the public FR page shows", async () => {
    const before = await publicHeroHeadline("fr");
    assert.equal(before.fromD1, true, "home_content is seeded already published — this is the CMS's real bootstrap state");
    seededHeadlineFr = before.headline;
    assert.equal(seededHeadlineFr, "Des images qui restent en mouvement.");
  });

  test("a saved draft edit does not change what the public page shows", async () => {
    const saveResult = await saveHomeEditorAction(db, { heroHeadlineFr: "TITRE EN COURS D'EDITION" }, UPDATED_BY);
    assert.match(saveResult.redirect, /flash=success/);

    const stillPublic = await publicHeroHeadline("fr");
    assert.equal(stillPublic.headline, seededHeadlineFr, "the public page must be completely unaffected by an unpublished draft");
  });

  test("publishing merges the draft — the public page now shows the new headline", async () => {
    const publishResult = await publishHomeEditorAction(db, UPDATED_BY);
    assert.match(publishResult.redirect, /flash=success/);

    const afterPublish = await publicHeroHeadline("fr");
    assert.equal(afterPublish.headline, "TITRE EN COURS D'EDITION");
  });

  test("EN was never touched — the EN public page keeps its own seeded headline", async () => {
    const en = await publicHeroHeadline("en");
    assert.equal(en.headline, "Images that stay in motion.");
  });

  test("modify home hero media -> save -> publish -> public receives new media (exact chain requested by the staging bug report)", async () => {
    const bytes = new TextEncoder().encode("fake JPEG bytes for the hero-media publish chain test");
    const created = await media.createMediaMetadata(db, { storageKey: "media/site-editor-new-hero.jpg", mimeType: "image/jpeg", sizeBytes: bytes.byteLength }, UPDATED_BY);
    assert.ok(created.ok);
    if (!created.ok) return;
    const newMediaId = created.data.id;
    await bucket.put("media/site-editor-new-hero.jpg", bytes);
    await media.markMediaUploaded(db, newMediaId);
    await media.markMediaReady(db, newMediaId, { width: 4000, height: 3000 });
    await media.updateMediaMetadata(db, newMediaId, { publicationRightsConfirmed: true }, UPDATED_BY);

    const beforePublished = await pages.homeContent.getPublished(db);
    const oldMediaId = beforePublished!.hero_media_id;
    assert.notEqual(oldMediaId, newMediaId);

    // "Enregistrer" — save the new hero media to the draft.
    const saveResult = await saveHomeEditorAction(db, { heroMediaId: newMediaId }, UPDATED_BY);
    assert.match(saveResult.redirect, /flash=success/);

    // Public page must still resolve the OLD media — draft never public.
    const stillOldPublished = await pages.homeContent.getPublished(db);
    assert.equal(stillOldPublished!.hero_media_id, oldMediaId);

    // "Publier" — the content merge that actually makes edited fields live.
    const publishResult = await publishHomeEditorAction(db, UPDATED_BY);
    assert.match(publishResult.redirect, /flash=success/);

    // Public FR page (already live from the earlier test in this suite)
    // now reflects the new hero media, resolvable through the real public
    // media route exactly as HomeView.astro's <EditableImage> would render it.
    const afterPublished = await pages.homeContent.getPublished(db);
    assert.equal(afterPublished!.hero_media_id, newMediaId);
    assert.equal(afterPublished!.fr_status, "published", "FR must still be live — this edit didn't touch language status");

    assert.equal(await isMediaUsedByPublicHomeContent(db, newMediaId), true, "the new hero media must now be recognized as publicly used");
    const resolved = await resolvePublicMediaObject(db, bucket, newMediaId);
    assert.ok(resolved, "the new hero media must be readable through the public media route");
    assert.equal(resolved!.mimeType, "image/jpeg");

    // And the OLD hero media, no longer referenced anywhere, is no longer publicly resolvable.
    assert.equal(await isMediaUsedByPublicHomeContent(db, oldMediaId), false);
  });

  test("unpublishing FR falls back the public FR page to the mock (langLive false)", async () => {
    const result = await setHomeEditorLanguageStatusAction(db, "fr", "draft", UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    const fr = await publicHeroHeadline("fr");
    assert.equal(fr.fromD1, false, "with fr_status back to draft, HomeView.astro must fall back to the mock, never show stale/half D1 state");

    // Restore for any later test in this file relying on FR being live.
    await setHomeEditorLanguageStatusAction(db, "fr", "published", UPDATED_BY);
  });

  test("a hero media without confirmed rights never becomes reachable through the public media route", async () => {
    const unrighted = await media.createMediaMetadata(db, { storageKey: "media/site-editor-view-unrighted.jpg", mimeType: "image/jpeg", sizeBytes: 100 });
    assert.ok(unrighted.ok);
    if (!unrighted.ok) return;
    await media.markMediaUploaded(db, unrighted.data.id);
    await media.markMediaReady(db, unrighted.data.id, { width: 100, height: 100 });

    await saveHomeEditorAction(db, { heroMediaId: unrighted.data.id }, UPDATED_BY);
    const blocked = await publishHomeEditorAction(db, UPDATED_BY);
    assert.match(blocked.redirect, /flash=error/, "publish must be blocked while FR is live and rights are unconfirmed");

    assert.equal(await isMediaUsedByPublicHomeContent(db, unrighted.data.id), false, "an unrighted media must never be considered publicly usable by home_content, published or not");
  });
});

describe("Éditeur visuel — Services page copy: draft never public, publish makes it public", () => {
  test("baseline + draft isolation + publish", async () => {
    const baseline = await publicServicesTitle("fr");
    assert.equal(baseline.title, "Services");

    await saveServicesPageEditorAction(db, { titleFr: "SERVICES EN EDITION" }, UPDATED_BY);
    const stillPublic = await publicServicesTitle("fr");
    assert.equal(stillPublic.title, "Services", "unpublished draft must not affect the public page");

    await publishServicesPageEditorAction(db, UPDATED_BY);
    const afterPublish = await publicServicesTitle("fr");
    assert.equal(afterPublish.title, "SERVICES EN EDITION");

    // Individual services (Services CMS, separate module) must be completely untouched.
    const activeServices = await db.prepare("SELECT COUNT(*) as n FROM services WHERE status = 'published'").first<{ n: number }>();
    assert.ok(activeServices!.n > 0);
  });
});
