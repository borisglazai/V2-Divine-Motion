/**
 * Regression test — staging validation bug: "Enregistrer" (save) on the
 * Accueil editor reported success, but the very next "Publier FR" click
 * failed with the generic NOT_FOUND flash ("Cet élément n'existe pas ou
 * n'est plus disponible.").
 *
 * Root cause (see src/lib/admin/site-editor-shared.ts's `ensureSiteEditorDraft`
 * doc comment for the full account): `ensureSiteEditorDraft` reused ANY
 * existing draft row without ever checking that a published row still
 * exists for it to eventually be merged into. `pageRepo.setLanguageStatus`
 * (called by "Publier FR") and `pageRepo.publish` (called by "Publier")
 * both correctly require a published row and fail with NOT_FOUND when
 * there isn't one — but the SAVE action never applied that same check, so
 * it could report success on a home_content table with a draft but no
 * published row, deferring the real problem to a confusing failure one
 * click later.
 *
 * home_content.draft_of_id has a self-referencing `ON DELETE CASCADE` FK
 * (migrations/0001_initial.sql) — a draft can never be left dangling off
 * a published row that got deleted out from under it. This test instead
 * reproduces the reachable version of the exact same class of bug: a
 * draft-only home_content table with zero rows at status='published' —
 * schema-valid (draft_of_id NULL satisfies the FK trivially) and exactly
 * the state that makes save "succeed" while publish always correctly
 * failed.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, closeTestDb } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as pages from "../../src/lib/db/pages";
import { saveHomeEditorAction, setHomeEditorLanguageStatusAction } from "../../src/lib/admin/home-editor-actions";

let db: D1Database;
const UPDATED_BY = "site-editor-bugfix-test@divinemotion.ca";

before(async () => {
  // Deliberately NOT seeded (no seedTestDb() call) — home_content starts
  // with zero rows, so the draft-only state below is reached by a single
  // hand-crafted INSERT, not by fighting the seed's own published row.
  db = await resetTestDb(".wrangler-test-site-editor-bugfix");
});

after(async () => {
  await closeTestDb();
});

describe("Bug fix — save must require a live published row, same as publish already does", () => {
  test("with a draft but no published row: save now fails the same clear way publish always did, instead of silently succeeding", async () => {
    const mediaResult = await media.createMediaMetadata(db, { storageKey: "media/orphan-hero.jpg", mimeType: "image/jpeg", sizeBytes: 1 });
    assert.ok(mediaResult.ok);
    if (!mediaResult.ok) return;

    await db
      .prepare(
        `INSERT INTO home_content (status, draft_of_id, hero_headline_fr,hero_headline_en,hero_subline_fr,hero_subline_en,hero_media_id,hero_image_alt_fr,hero_image_alt_en,work_preview_label_fr,work_preview_label_en,work_preview_link_label_fr,work_preview_link_label_en,brand_statement_fr,brand_statement_en,services_preview_label_fr,services_preview_label_en,about_preview_label_fr,about_preview_label_en,about_preview_text_fr,about_preview_text_en,final_cta_headline_fr,final_cta_headline_en,fr_status,en_status,created_at,updated_at)
         VALUES ('draft', NULL, 'h','h','s','s',?,'a','a','w','w','l','l','b','b','sp','sp','ap','ap','t','t','c','c','draft','draft',1,1)`,
      )
      .bind(mediaResult.data.id)
      .run();

    assert.ok(await pages.homeContent.getDraft(db), "sanity: the draft-only row is there");
    assert.equal(await pages.homeContent.getPublished(db), null, "sanity: genuinely no published row");

    // BEFORE the fix, this reported "Brouillon enregistré." (flash=success)
    // — exactly matching the reported staging symptom ("le draft est
    // correctement sauvegardé").
    const saveResult = await saveHomeEditorAction(db, { heroHeadlineFr: "should not silently succeed" }, UPDATED_BY);
    assert.match(
      saveResult.redirect,
      /flash=error/,
      "save must now fail clearly instead of reporting success against a draft that can never actually be published",
    );
    const saveMessage = new URL(saveResult.redirect, "http://placeholder.local").searchParams.get("flash_message");
    assert.match(saveMessage ?? "", /n'existe pas/);

    // The draft must be untouched by the rejected save — no silent partial write.
    const draftAfter = await pages.homeContent.getDraft(db);
    assert.notEqual(draftAfter!.hero_headline_fr, "should not silently succeed");

    // language-status ("Publier FR") already correctly refused this state
    // before the fix — still does, and now agrees with save instead of
    // being the only action to catch the problem.
    const langResult = await setHomeEditorLanguageStatusAction(db, "fr", "published", UPDATED_BY);
    assert.match(langResult.redirect, /flash=error/);
    const langMessage = new URL(langResult.redirect, "http://placeholder.local").searchParams.get("flash_message");
    assert.match(langMessage ?? "", /n'existe pas/);
  });

  test("the normal case (a published row exists) is completely unaffected — save/publish/language-status all still work exactly as before", async () => {
    // A fresh, properly-published home_content row alongside the orphaned
    // draft-only leftovers from the previous test would violate the
    // singleton unique index, so this runs against its own isolated DB.
    const freshDb = await resetTestDb(".wrangler-test-site-editor-bugfix-happy");
    const seedMedia = await media.createMediaMetadata(freshDb, { storageKey: "media/happy-hero.jpg", mimeType: "image/jpeg", sizeBytes: 1 });
    assert.ok(seedMedia.ok);
    if (!seedMedia.ok) return;
    await media.markMediaUploaded(freshDb, seedMedia.data.id);
    await media.markMediaReady(freshDb, seedMedia.data.id, { width: 10, height: 10 });
    await media.updateMediaMetadata(freshDb, seedMedia.data.id, { publicationRightsConfirmed: true }, UPDATED_BY);

    await freshDb
      .prepare(
        `INSERT INTO home_content (status, hero_headline_fr,hero_headline_en,hero_subline_fr,hero_subline_en,hero_media_id,hero_image_alt_fr,hero_image_alt_en,work_preview_label_fr,work_preview_label_en,work_preview_link_label_fr,work_preview_link_label_en,brand_statement_fr,brand_statement_en,services_preview_label_fr,services_preview_label_en,about_preview_label_fr,about_preview_label_en,about_preview_text_fr,about_preview_text_en,final_cta_headline_fr,final_cta_headline_en,fr_status,en_status,created_at,updated_at)
         VALUES ('published', 'h','h','s','s',?,'a','a','w','w','l','l','b','b','sp','sp','ap','ap','t','t','c','c','draft','draft',1,1)`,
      )
      .bind(seedMedia.data.id)
      .run();

    const saveResult = await saveHomeEditorAction(freshDb, { heroHeadlineFr: "Nouveau titre" }, UPDATED_BY);
    assert.match(saveResult.redirect, /flash=success/);

    const langResult = await setHomeEditorLanguageStatusAction(freshDb, "fr", "published", UPDATED_BY);
    assert.match(langResult.redirect, /flash=success/);

    const published = await pages.homeContent.getPublished(freshDb);
    assert.equal(published!.fr_status, "published");
  });
});
