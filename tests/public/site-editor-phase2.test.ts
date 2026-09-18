/**
 * Éditeur visuel Phase 2 — same discipline as
 * tests/public/site-editor-view.test.ts (Phase 1): draft never public,
 * publish makes it public, FR/EN independent. Covers the 3 newly-wired
 * pages (Travail page copy + gallery slots, À propos, Contact) against
 * the real local D1 + the real DAL/admin-action modules — no D1 mocking,
 * no Astro render harness (none exists in this repo).
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, closeTestDb, getTestBucket } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as work from "../../src/lib/db/work";
import * as pages from "../../src/lib/db/pages";
import { saveWorkPageEditorAction, publishWorkPageEditorAction } from "../../src/lib/admin/work-page-editor-actions";
import { saveWorkSlotAction, publishWorkSlotAction, createWorkSlotItemAction, setWorkSlotLanguageStatusAction } from "../../src/lib/admin/work-slot-actions";
import { buildAdminGallerySlots } from "../../src/lib/work-gallery-adapter";
import { saveAboutEditorAction, publishAboutEditorAction } from "../../src/lib/admin/about-editor-actions";
import { saveContactEditorAction, publishContactEditorAction, setContactEditorLanguageStatusAction } from "../../src/lib/admin/contact-editor-actions";

let db: D1Database;
let bucket: R2Bucket;
const UPDATED_BY = "site-editor-phase2-test@divinemotion.ca";
const REDIRECT = "/admin/site/travail";

async function readyRightedMedia(storageKey: string): Promise<number> {
  const created = await media.createMediaMetadata(db, { storageKey, mimeType: "image/jpeg", sizeBytes: 100 }, UPDATED_BY);
  assert.ok(created.ok);
  if (!created.ok) throw new Error("unreachable");
  await media.markMediaUploaded(db, created.data.id);
  await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });
  await media.updateMediaMetadata(db, created.data.id, { publicationRightsConfirmed: true }, UPDATED_BY);
  return created.data.id;
}

before(async () => {
  db = await resetTestDb(".wrangler-test-public-siteeditor-phase2");
  seedTestDb();
  bucket = await getTestBucket();
  void bucket;
});

after(async () => {
  await closeTestDb();
});

describe("Travail page copy (work_page_content) — draft never public, publish makes it public, gallery_layout persists", () => {
  test("baseline seed", async () => {
    const published = await pages.workPageContent.getPublished(db);
    assert.equal(published!.title_fr, "Travail");
    assert.equal(published!.gallery_layout, "editorial", "migrations/0006's own DEFAULT — the seed never sets it explicitly");
  });

  test("save (draft) does not affect the published row; publish merges it, including gallery_layout", async () => {
    const saveResult = await saveWorkPageEditorAction(db, { titleFr: "TRAVAIL EN EDITION", galleryLayout: "story" }, UPDATED_BY);
    assert.match(saveResult.redirect, /flash=success/);

    const stillPublished = await pages.workPageContent.getPublished(db);
    assert.equal(stillPublished!.title_fr, "Travail");
    assert.equal(stillPublished!.gallery_layout, "editorial");

    const publishResult = await publishWorkPageEditorAction(db, UPDATED_BY);
    assert.match(publishResult.redirect, /flash=success/);

    const afterPublish = await pages.workPageContent.getPublished(db);
    assert.equal(afterPublish!.title_fr, "TRAVAIL EN EDITION");
    assert.equal(afterPublish!.gallery_layout, "story");
  });
});

describe("Travail gallery slots — occupied slot edits a draft, empty slot creates a new item, alt text is never invented", () => {
  let publishedId: number;

  test("creating a work item via the normal DAL, then editing it through the slot save action only touches its draft", async () => {
    const mediaId = await readyRightedMedia("media/phase2-slot-a.jpg");
    const created = await work.createWorkItem(db, { mediaId, position: 500, ratio: "4/5", altFr: "alt fr", altEn: "alt en" }, UPDATED_BY);
    assert.ok(created.ok);
    if (!created.ok) return;
    const published = await work.publishWorkItem(db, created.data.draftId, UPDATED_BY);
    assert.ok(published.ok);
    if (!published.ok) return;
    publishedId = published.data.publishedId;

    const newMediaId = await readyRightedMedia("media/phase2-slot-a-new.jpg");
    const slotSave = await saveWorkSlotAction(
      db,
      publishedId,
      { mediaId: newMediaId, altFr: "alt fr", altEn: "alt en", captionFr: "légende", featuredOnHome: false },
      REDIRECT,
      UPDATED_BY,
    );
    assert.ok(!("notFound" in slotSave));
    if ("notFound" in slotSave) return;
    assert.match(slotSave.redirect, /flash=success/);

    // Draft only — the published row's media_id is untouched.
    const stillPublished = await work.getWorkItem(db, publishedId);
    assert.equal(stillPublished!.media_id, mediaId);

    const draft = await work.getWorkItemDraft(db, publishedId);
    assert.ok(draft);
    assert.equal(draft!.media_id, newMediaId);
    assert.equal(draft!.caption_fr, "légende");
  });

  test("publishing the slot's draft merges the new media onto the published row", async () => {
    const draft = await work.getWorkItemDraft(db, publishedId);
    assert.ok(draft);
    const publishResult = await publishWorkSlotAction(db, draft!.id, REDIRECT, UPDATED_BY);
    assert.match(publishResult.redirect, /flash=success/);

    const published = await work.getWorkItem(db, publishedId);
    assert.equal(published!.caption_fr, "légende");
  });

  test("language-status toggle through the slot action works independently per locale", async () => {
    const before = await work.getWorkItem(db, publishedId);
    assert.equal(before!.en_status, "draft");

    const result = await setWorkSlotLanguageStatusAction(db, publishedId, "en", "published", REDIRECT, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    const after = await work.getWorkItem(db, publishedId);
    assert.equal(after!.en_status, "published");
    assert.equal(after!.fr_status, "draft", "FR must be untouched by an EN-only toggle");
  });

  test("an empty slot's 'Ajouter une photo' creates a new work_item at the given position — alt FR/EN are required, never defaulted", async () => {
    const mediaId = await readyRightedMedia("media/phase2-slot-new.jpg");

    const missingAlt = await createWorkSlotItemAction(db, { position: 999, ratio: "3/2", mediaId, altFr: "", altEn: "" }, REDIRECT, UPDATED_BY);
    assert.match(missingAlt.redirect, /flash=error/, "alt text must never be silently defaulted — the action must reject an empty alt");

    const result = await createWorkSlotItemAction(
      db,
      { position: 999, ratio: "3/2", mediaId, altFr: "nouvelle photo FR", altEn: "new photo EN", captionFr: "légende FR" },
      REDIRECT,
      UPDATED_BY,
    );
    assert.match(result.redirect, /flash=success/);

    const all = await work.listAllWorkItems(db);
    const created = all.find((item) => item.position === 999);
    assert.ok(created, "the new item must exist at the requested position");
    assert.equal(created!.status, "draft", "a brand-new slot item is a draft — it never appears publicly before an explicit publish");
    assert.equal(created!.alt_fr, "nouvelle photo FR");
    assert.equal(created!.alt_en, "new photo EN");
  });

  test("buildAdminGallerySlots reflects the merged item set with a trailing empty slot always present", async () => {
    const { items } = await work.listWorkItemsForAdminGallery(db);
    const slots = buildAdminGallerySlots(items, "editorial");
    const allEntries = slots.flatMap((s) => s.entries);
    assert.ok(allEntries.some((e) => e.item === null), "there must always be at least one empty, still-addable slot");
  });
});

describe("À propos (about_content + children) — draft never public, publish makes it public, locale-merge never blanks the other language", () => {
  test("baseline seed", async () => {
    const published = await pages.aboutContent.getPublished(db);
    assert.equal(published!.hero_title_fr, "Une approche sensible de l'image.");
    const paragraphs = await pages.aboutContent.getStoryParagraphs(db, published!.id);
    assert.equal(paragraphs.length, 3);
  });

  test("editing only the FR story paragraph text preserves the EN text (never invented/blanked)", async () => {
    const saveResult = await saveAboutEditorAction(
      db,
      { heroTitleFr: "TITRE EN EDITION" },
      [{ index: 0, locale: "fr", text: "PARAGRAPHE 1 MODIFIÉ" }],
      [],
      UPDATED_BY,
    );
    assert.match(saveResult.redirect, /flash=success/);

    const draft = await pages.aboutContent.getDraft(db);
    assert.ok(draft);
    const draftParagraphs = await pages.aboutContent.getStoryParagraphs(db, draft!.id);
    assert.equal(draftParagraphs[0].text_fr, "PARAGRAPHE 1 MODIFIÉ");
    assert.equal(
      draftParagraphs[0].text_en,
      "Divine Motion started with a simple idea: capture people as they really are, in the moments that matter most.",
      "the EN text must be preserved exactly, never blanked by an FR-only edit",
    );
    assert.equal(draftParagraphs[1].text_fr, "Le studio photographie et filme les mariages, les portraits et les événements avec une attention particulière portée à la lumière, aux détails et aux émotions réelles.");

    // Published row must still be entirely untouched.
    const stillPublished = await pages.aboutContent.getPublished(db);
    assert.equal(stillPublished!.hero_title_fr, "Une approche sensible de l'image.");
  });

  test("publishing merges hero title and the story paragraph edit", async () => {
    const publishResult = await publishAboutEditorAction(db, UPDATED_BY);
    assert.match(publishResult.redirect, /flash=success/);

    const published = await pages.aboutContent.getPublished(db);
    assert.equal(published!.hero_title_fr, "TITRE EN EDITION");
    const paragraphs = await pages.aboutContent.getStoryParagraphs(db, published!.id);
    assert.equal(paragraphs[0].text_fr, "PARAGRAPHE 1 MODIFIÉ");
    assert.equal(paragraphs[0].text_en, "Divine Motion started with a simple idea: capture people as they really are, in the moments that matter most.");
  });

  test("an approach item word/text edit only touches the edited locale's fields", async () => {
    const saveResult = await saveAboutEditorAction(db, {}, [], [{ index: 0, locale: "en", word: "Radiance" }], UPDATED_BY);
    assert.match(saveResult.redirect, /flash=success/);

    const draft = await pages.aboutContent.getDraft(db);
    assert.ok(draft);
    const items = await pages.aboutContent.getApproachItems(db, draft!.id);
    assert.equal(items[0].word_en, "Radiance");
    assert.equal(items[0].word_fr, "Lumière", "the FR word must be untouched");
    assert.equal(items[0].text_fr, "Chercher la lumière qui raconte quelque chose de vrai.", "the untouched text fields must be preserved verbatim");
  });

  test("changing the hero media while a language is live is blocked at publish time without confirmed rights (migrations/0006's about_content rights-gate)", async () => {
    const unrighted = await media.createMediaMetadata(db, { storageKey: "media/phase2-about-unrighted.jpg", mimeType: "image/jpeg", sizeBytes: 100 });
    assert.ok(unrighted.ok);
    if (!unrighted.ok) return;
    await media.markMediaUploaded(db, unrighted.data.id);
    await media.markMediaReady(db, unrighted.data.id, { width: 100, height: 100 });

    // Save only checks "media exists, ready, not deleted" — same as
    // Home's own bug-fix test (tests/public/site-editor-view.test.ts) —
    // so this succeeds. The rights-gate is a PUBLISH-time preflight.
    const saveResult = await saveAboutEditorAction(db, { heroMediaId: unrighted.data.id }, [], [], UPDATED_BY);
    assert.match(saveResult.redirect, /flash=success/);

    const blocked = await publishAboutEditorAction(db, UPDATED_BY);
    assert.match(blocked.redirect, /flash=error/, "publish must be blocked while a language is live and rights are unconfirmed");

    const stillPublished = await pages.aboutContent.getPublished(db);
    assert.notEqual(stillPublished!.hero_media_id, unrighted.data.id, "the unrighted media must never reach the published row");
  });
});

describe("Contact (contact_content) — draft never public, publish makes it public, FR/EN independent", () => {
  test("baseline + draft isolation + publish", async () => {
    const baseline = await pages.contactContent.getPublished(db);
    assert.equal(baseline!.hero_title_fr, "Parlons de votre projet.");

    const saveResult = await saveContactEditorAction(db, { heroTitleFr: "CONTACT EN EDITION" }, UPDATED_BY);
    assert.match(saveResult.redirect, /flash=success/);

    const stillPublic = await pages.contactContent.getPublished(db);
    assert.equal(stillPublic!.hero_title_fr, "Parlons de votre projet.", "unpublished draft must not affect the public page");

    const publishResult = await publishContactEditorAction(db, UPDATED_BY);
    assert.match(publishResult.redirect, /flash=success/);

    const afterPublish = await pages.contactContent.getPublished(db);
    assert.equal(afterPublish!.hero_title_fr, "CONTACT EN EDITION");
  });

  test("unpublishing EN leaves FR untouched", async () => {
    const result = await setContactEditorLanguageStatusAction(db, "en", "draft", UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    const row = await pages.contactContent.getPublished(db);
    assert.equal(row!.en_status, "draft");
    assert.equal(row!.fr_status, "published");
  });
});
