/**
 * Éditeur visuel Phase 1 — mutation logic tests for the Home and
 * Services-page editors, same shape as tests/admin/services-endpoints.test.ts:
 * calls the real action functions (src/lib/admin/home-editor-actions.ts,
 * services-page-editor-actions.ts) directly against a real local D1 via
 * the Brief 011 Miniflare harness. These are the exact functions
 * src/pages/admin/site/**\/*.ts delegate to.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, closeTestDb } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as pages from "../../src/lib/db/pages";
import { saveHomeEditorAction, publishHomeEditorAction, setHomeEditorLanguageStatusAction } from "../../src/lib/admin/home-editor-actions";
import {
  saveServicesPageEditorAction,
  publishServicesPageEditorAction,
  setServicesPageEditorLanguageStatusAction,
} from "../../src/lib/admin/services-page-editor-actions";

let db: D1Database;
const UPDATED_BY = "site-editor-test-admin@divinemotion.ca";

before(async () => {
  db = await resetTestDb(".wrangler-test-site-editor-endpoints");
  seedTestDb();
});

after(async () => {
  await closeTestDb();
});

describe("Éditeur visuel — Accueil (home_content)", () => {
  test("save auto-creates a draft from the seeded published row and updates only the submitted fields", async () => {
    const result = await saveHomeEditorAction(db, { heroHeadlineFr: "NOUVEAU TITRE FR" }, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    const draft = await pages.homeContent.getDraft(db);
    assert.ok(draft, "a draft must now exist");
    assert.equal(draft!.hero_headline_fr, "NOUVEAU TITRE FR");
    // Untouched field must still carry the seeded value, not be blanked.
    assert.equal(draft!.hero_headline_en, "Images that stay in motion.");

    const published = await pages.homeContent.getPublished(db);
    assert.notEqual(published!.hero_headline_fr, "NOUVEAU TITRE FR", "the published row must be untouched by a save");
  });

  test("save rejects a hero media that isn't usable (deleted or not ready), never silently writes it", async () => {
    const notReady = await media.createMediaMetadata(db, { storageKey: "media/site-editor-not-ready.jpg", mimeType: "image/jpeg", sizeBytes: 1 });
    assert.ok(notReady.ok);
    if (!notReady.ok) return;

    const result = await saveHomeEditorAction(db, { heroMediaId: notReady.data.id }, UPDATED_BY);
    assert.match(result.redirect, /flash=error/);

    const draft = await pages.homeContent.getDraft(db);
    assert.notEqual(draft!.hero_media_id, notReady.data.id, "an unusable media must never be written to the draft");
  });

  test("publish merges the draft into the published row", async () => {
    const result = await publishHomeEditorAction(db, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    const published = await pages.homeContent.getPublished(db);
    assert.equal(published!.hero_headline_fr, "NOUVEAU TITRE FR");
    assert.equal(await pages.homeContent.getDraft(db), null, "the draft shadow must be gone after publish");
  });

  test("publish is blocked when the draft's hero media has unconfirmed rights and a language is already live", async () => {
    const unrighted = await media.createMediaMetadata(db, { storageKey: "media/site-editor-unrighted.jpg", mimeType: "image/jpeg", sizeBytes: 100 });
    assert.ok(unrighted.ok);
    if (!unrighted.ok) return;
    await media.markMediaUploaded(db, unrighted.data.id);
    await media.markMediaReady(db, unrighted.data.id, { width: 100, height: 100 });
    // Rights left unconfirmed on purpose.

    const saveResult = await saveHomeEditorAction(db, { heroMediaId: unrighted.data.id }, UPDATED_BY);
    assert.match(saveResult.redirect, /flash=success/, "saving to a draft never requires confirmed rights");

    const publishResult = await publishHomeEditorAction(db, UPDATED_BY);
    assert.match(publishResult.redirect, /flash=error/);
    const message = new URL(publishResult.redirect, "http://placeholder.local").searchParams.get("flash_message");
    assert.match(message ?? "", /droits de publication/);

    const published = await pages.homeContent.getPublished(db);
    assert.notEqual(published!.hero_media_id, unrighted.data.id, "the live row's hero media must be untouched by the blocked publish");
  });

  test("language-status toggles FR/EN independently", async () => {
    const offResult = await setHomeEditorLanguageStatusAction(db, "en", "draft", UPDATED_BY);
    assert.match(offResult.redirect, /flash=success/);
    let published = await pages.homeContent.getPublished(db);
    assert.equal(published!.en_status, "draft");
    assert.equal(published!.fr_status, "published", "FR must be untouched by the EN-only action");

    const onResult = await setHomeEditorLanguageStatusAction(db, "en", "published", UPDATED_BY);
    assert.match(onResult.redirect, /flash=success/);
    published = await pages.homeContent.getPublished(db);
    assert.equal(published!.en_status, "published");
  });
});

describe("Éditeur visuel — Services (services_page_content, page-level copy only)", () => {
  test("save auto-creates a draft, updates only submitted fields, never touches individual services", async () => {
    const result = await saveServicesPageEditorAction(db, { titleFr: "NOUVEAU TITRE SERVICES" }, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    const draft = await pages.servicesPageContent.getDraft(db);
    assert.ok(draft);
    assert.equal(draft!.title_fr, "NOUVEAU TITRE SERVICES");
    assert.equal(draft!.title_en, "Services", "untouched field keeps its seeded value");

    const servicesCountRow = await db.prepare("SELECT COUNT(*) as n FROM services").first<{ n: number }>();
    assert.ok(servicesCountRow!.n > 0, "individual services rows must still exist, untouched");
  });

  test("publish merges the draft; language-status toggles FR/EN independently", async () => {
    const publishResult = await publishServicesPageEditorAction(db, UPDATED_BY);
    assert.match(publishResult.redirect, /flash=success/);
    let published = await pages.servicesPageContent.getPublished(db);
    assert.equal(published!.title_fr, "NOUVEAU TITRE SERVICES");

    const langResult = await setServicesPageEditorLanguageStatusAction(db, "fr", "draft", UPDATED_BY);
    assert.match(langResult.redirect, /flash=success/);
    published = await pages.servicesPageContent.getPublished(db);
    assert.equal(published!.fr_status, "draft");
    assert.equal(published!.en_status, "published", "EN must be untouched by the FR-only action");
  });
});
