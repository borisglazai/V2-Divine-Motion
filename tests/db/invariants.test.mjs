// D1 invariant suite (Implementation Brief 010).
//
// Runs against a real local D1 database created and migrated by Wrangler
// (see helpers.mjs) — not a bare node:sqlite file, not an in-memory
// throwaway. `npm run db:test` resets an isolated local D1 persistence
// directory, applies migrations/0001_initial.sql through
// `wrangler d1 migrations apply`, then exercises every invariant below
// through `wrangler d1 execute`.
//
// IMPORTANT: `wrangler d1 execute` runs each multi-statement --command as
// one atomic batch — if any statement in a call fails, the whole call
// rolls back, including statements that would otherwise have succeeded.
// So every test that expects a failure keeps its setup INSERTs in a
// separate, already-committed call before the failing statement.

import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { resetLocalD1, execD1, rows, expectSqlError } from "./helpers.mjs";

before(() => {
  resetLocalD1();
});

describe("schema applies", () => {
  test("migration 0001 created all expected tables", () => {
    const names = rows(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name;",
    ).map((r) => r.name);
    assert.deepEqual(names, [
      "about_approach_items",
      "about_content",
      "about_story_paragraphs",
      "contact_content",
      "content_snapshots",
      "home_content",
      "media",
      "page_seo",
      "service_features",
      "services",
      "services_approach_steps",
      "services_page_content",
      "site_settings",
      "testimonials",
      "work_items",
      "work_page_content",
    ]);
  });

  test("contact_submission_log does not exist (ADR-015)", () => {
    const names = rows(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='contact_submission_log';",
    );
    assert.equal(names.length, 0);
  });

  test("services has no layout column (ADR-014)", () => {
    const cols = rows("PRAGMA table_info(services);").map((c) => c.name);
    assert.ok(!cols.includes("layout"));
  });

  test("the 4 publication-rights triggers exist", () => {
    const names = rows(
      "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name;",
    ).map((r) => r.name);
    assert.deepEqual(names, [
      "trg_testimonials_rights_gate_en",
      "trg_testimonials_rights_gate_fr",
      "trg_work_items_rights_gate_en",
      "trg_work_items_rights_gate_fr",
    ]);
  });
});

describe("foreign keys", () => {
  test("PRAGMA foreign_keys is on by default in D1", () => {
    const r = rows("PRAGMA foreign_keys;");
    assert.equal(r[0].foreign_keys, 1);
  });

  test("RESTRICT blocks deleting a media referenced by work_items", () => {
    execD1(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at) VALUES ('media/fk-1.jpg','image/jpeg',1,1,1,1);",
    );
    const media = rows("SELECT id FROM media WHERE storage_key='media/fk-1.jpg';");
    const mediaId = media[0].id;
    execD1(
      `INSERT INTO work_items (media_id, position, ratio, alt_fr, alt_en, created_at, updated_at) VALUES (${mediaId},1,'4/5','a','a',1,1);`,
    );
    const err = expectSqlError(`DELETE FROM media WHERE id = ${mediaId};`);
    assert.match(err, /FOREIGN KEY constraint failed/);
  });

  test("SET NULL: deleting a media only referenced by page_seo.og_media_id succeeds and nulls the FK", () => {
    execD1(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at) VALUES ('media/fk-2.jpg','image/jpeg',1,1,1,1);",
    );
    const media = rows("SELECT id FROM media WHERE storage_key='media/fk-2.jpg';");
    const mediaId = media[0].id;
    execD1(
      `INSERT INTO page_seo (page_key, title_fr, title_en, description_fr, description_en, og_media_id, updated_at) VALUES ('home','t','t','d','d',${mediaId},1);`,
    );
    execD1(`DELETE FROM media WHERE id = ${mediaId};`);
    const seo = rows("SELECT og_media_id FROM page_seo WHERE page_key='home';");
    assert.equal(seo[0].og_media_id, null);
  });
});

describe("draft/publish — uniform mechanism (ADR-013)", () => {
  test("at most one draft per published work_item", () => {
    execD1(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at, publication_rights_confirmed) VALUES ('media/draft-wi.jpg','image/jpeg',1,1,1,1,1);",
    );
    const mediaId = rows("SELECT id FROM media WHERE storage_key='media/draft-wi.jpg';")[0].id;
    execD1(
      `INSERT INTO work_items (media_id, position, ratio, alt_fr, alt_en, created_at, updated_at) VALUES (${mediaId},1,'4/5','a','a',1,1);`,
    );
    const publishedId = rows(
      `SELECT id FROM work_items WHERE media_id=${mediaId} AND status='published';`,
    )[0].id;
    execD1(
      `INSERT INTO work_items (status, draft_of_id, media_id, position, ratio, alt_fr, alt_en, created_at, updated_at) VALUES ('draft',${publishedId},${mediaId},1,'4/5','a','a',1,1);`,
    );
    const err = expectSqlError(
      `INSERT INTO work_items (status, draft_of_id, media_id, position, ratio, alt_fr, alt_en, created_at, updated_at) VALUES ('draft',${publishedId},${mediaId},1,'4/5','b','b',1,1);`,
    );
    assert.match(err, /UNIQUE constraint failed/);
  });

  test("public isolation: editing a work_item via its draft never changes the published read", () => {
    execD1(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at, publication_rights_confirmed) VALUES ('media/isolation.jpg','image/jpeg',1,1,1,1,1);",
    );
    const mediaId = rows("SELECT id FROM media WHERE storage_key='media/isolation.jpg';")[0].id;
    execD1(
      `INSERT INTO work_items (media_id, position, ratio, caption_fr, caption_en, alt_fr, alt_en, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at) VALUES (${mediaId},1,'4/5','Original FR','Original EN','a','a','published','published',1,1,1,1);`,
    );
    const publishedId = rows(
      `SELECT id FROM work_items WHERE media_id=${mediaId} AND status='published';`,
    )[0].id;
    execD1(
      `INSERT INTO work_items (status, draft_of_id, media_id, position, ratio, caption_fr, caption_en, alt_fr, alt_en, created_at, updated_at) VALUES ('draft',${publishedId},${mediaId},1,'4/5','EDITED FR','EDITED EN','a','a',1,1);`,
    );

    const publicBefore = rows(
      `SELECT caption_fr FROM work_items WHERE id=${publishedId} AND status='published';`,
    )[0];
    assert.equal(publicBefore.caption_fr, "Original FR");

    const draft = rows(`SELECT id, caption_fr, caption_en FROM work_items WHERE draft_of_id=${publishedId};`)[0];
    assert.equal(draft.caption_fr, "EDITED FR");

    // Publish transition: copy draft fields onto the published row, then delete the draft.
    execD1(
      `UPDATE work_items SET caption_fr = '${draft.caption_fr}', caption_en = '${draft.caption_en}', updated_at = 2 WHERE id = ${publishedId}; DELETE FROM work_items WHERE id = ${draft.id};`,
    );

    const publicAfter = rows(
      `SELECT caption_fr FROM work_items WHERE id=${publishedId} AND status='published';`,
    )[0];
    assert.equal(publicAfter.caption_fr, "EDITED FR");

    const draftGone = rows(`SELECT id FROM work_items WHERE draft_of_id=${publishedId};`);
    assert.equal(draftGone.length, 0);
  });

  test("services: draft shares its published row's slug without violating uniqueness", () => {
    execD1(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at, publication_rights_confirmed) VALUES ('media/svc-draft.jpg','image/jpeg',1,1,1,1,1);",
    );
    const mediaId = rows("SELECT id FROM media WHERE storage_key='media/svc-draft.jpg';")[0].id;
    execD1(
      `INSERT INTO services (slug, title_fr, title_en, description_fr, description_en, media_id, ratio, image_alt_fr, image_alt_en, cta_label_fr, cta_label_en, position, fr_status, en_status, created_at, updated_at) VALUES ('events','Événements','Events','d','d',${mediaId},'16/9','a','a','c','c',1,'published','published',1,1);`,
    );
    const svcId = rows("SELECT id FROM services WHERE slug='events';")[0].id;
    execD1(
      `INSERT INTO services (status, draft_of_id, slug, title_fr, title_en, description_fr, description_en, media_id, ratio, image_alt_fr, image_alt_en, cta_label_fr, cta_label_en, position, created_at, updated_at) VALUES ('draft',${svcId},'events','ÉVÉNEMENTS EDITED','Events','d','d',${mediaId},'16/9','a','a','c','c',1,1,1);`,
    );
    const count = rows(`SELECT COUNT(*) c FROM services WHERE slug='events';`)[0].c;
    assert.equal(count, 2);
    const publicTitle = rows(`SELECT title_fr FROM services WHERE id=${svcId};`)[0].title_fr;
    assert.equal(publicTitle, "Événements");
  });

  test("page content: at most one published row and one draft per published row (home_content)", () => {
    execD1(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at) VALUES ('media/home.jpg','image/jpeg',1,1,1,1);",
    );
    const mediaId = rows("SELECT id FROM media WHERE storage_key='media/home.jpg';")[0].id;
    const insertHome = (extra = "") => `INSERT INTO home_content (${extra ? "status," : ""}hero_headline_fr,hero_headline_en,hero_subline_fr,hero_subline_en,hero_media_id,hero_image_alt_fr,hero_image_alt_en,work_preview_label_fr,work_preview_label_en,work_preview_link_label_fr,work_preview_link_label_en,brand_statement_fr,brand_statement_en,services_preview_label_fr,services_preview_label_en,about_preview_label_fr,about_preview_label_en,about_preview_text_fr,about_preview_text_en,final_cta_headline_fr,final_cta_headline_en,created_at,updated_at) VALUES (${extra}'h','h','s','s',${mediaId},'a','a','w','w','l','l','b','b','sp','sp','ap','ap','t','t','c','c',1,1);`;
    execD1(insertHome());
    const err = expectSqlError(insertHome());
    assert.match(err, /UNIQUE constraint failed/);

    const publishedId = rows("SELECT id FROM home_content WHERE status='published';")[0].id;
    execD1(
      `INSERT INTO home_content (status, draft_of_id, hero_headline_fr,hero_headline_en,hero_subline_fr,hero_subline_en,hero_media_id,hero_image_alt_fr,hero_image_alt_en,work_preview_label_fr,work_preview_label_en,work_preview_link_label_fr,work_preview_link_label_en,brand_statement_fr,brand_statement_en,services_preview_label_fr,services_preview_label_en,about_preview_label_fr,about_preview_label_en,about_preview_text_fr,about_preview_text_en,final_cta_headline_fr,final_cta_headline_en,created_at,updated_at) VALUES ('draft',${publishedId},'h2','h2','s','s',${mediaId},'a','a','w','w','l','l','b','b','sp','sp','ap','ap','t','t','c','c',1,1);`,
    );
    const err2 = expectSqlError(
      `INSERT INTO home_content (status, draft_of_id, hero_headline_fr,hero_headline_en,hero_subline_fr,hero_subline_en,hero_media_id,hero_image_alt_fr,hero_image_alt_en,work_preview_label_fr,work_preview_label_en,work_preview_link_label_fr,work_preview_link_label_en,brand_statement_fr,brand_statement_en,services_preview_label_fr,services_preview_label_en,about_preview_label_fr,about_preview_label_en,about_preview_text_fr,about_preview_text_en,final_cta_headline_fr,final_cta_headline_en,created_at,updated_at) VALUES ('draft',${publishedId},'h3','h3','s','s',${mediaId},'a','a','w','w','l','l','b','b','sp','sp','ap','ap','t','t','c','c',1,1);`,
    );
    assert.match(err2, /UNIQUE constraint failed/);
  });
});

describe("FR/EN independence", () => {
  test("FR can publish while EN stays draft on the same work_item row", () => {
    execD1(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at, publication_rights_confirmed) VALUES ('media/fren.jpg','image/jpeg',1,1,1,1,1);",
    );
    const mediaId = rows("SELECT id FROM media WHERE storage_key='media/fren.jpg';")[0].id;
    execD1(
      `INSERT INTO work_items (media_id, position, ratio, alt_fr, alt_en, created_at, updated_at) VALUES (${mediaId},1,'4/5','a','a',1,1);`,
    );
    const id = rows(`SELECT id FROM work_items WHERE media_id=${mediaId};`)[0].id;
    execD1(`UPDATE work_items SET fr_status='published', fr_published_at=1 WHERE id=${id};`);
    const state = rows(`SELECT fr_status, en_status FROM work_items WHERE id=${id};`)[0];
    assert.equal(state.fr_status, "published");
    assert.equal(state.en_status, "draft");
  });

  test("no language overwrites the other: publishing EN afterwards leaves FR published", () => {
    const id = rows(
      "SELECT wi.id FROM work_items wi JOIN media m ON m.id=wi.media_id WHERE m.storage_key='media/fren.jpg';",
    )[0].id;
    execD1(`UPDATE work_items SET en_status='published', en_published_at=2 WHERE id=${id};`);
    const state = rows(`SELECT fr_status, en_status FROM work_items WHERE id=${id};`)[0];
    assert.equal(state.fr_status, "published");
    assert.equal(state.en_status, "published");
  });
});

describe("publication rights (ADR-011)", () => {
  test("work_items: publish FR blocked when media rights not confirmed", () => {
    execD1(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at) VALUES ('media/unrighted.jpg','image/jpeg',1,1,1,1);",
    );
    const mediaId = rows("SELECT id FROM media WHERE storage_key='media/unrighted.jpg';")[0].id;
    execD1(
      `INSERT INTO work_items (media_id, position, ratio, alt_fr, alt_en, created_at, updated_at) VALUES (${mediaId},1,'4/5','a','a',1,1);`,
    );
    const id = rows(`SELECT id FROM work_items WHERE media_id=${mediaId};`)[0].id;
    const err = expectSqlError(`UPDATE work_items SET fr_status='published' WHERE id=${id};`);
    assert.match(err, /cannot publish FR — media publication rights not confirmed/);
  });

  test("work_items: publish succeeds once rights are confirmed", () => {
    const mediaId = rows("SELECT id FROM media WHERE storage_key='media/unrighted.jpg';")[0].id;
    execD1(
      `UPDATE media SET publication_rights_confirmed=1, publication_rights_confirmed_at=1 WHERE id=${mediaId};`,
    );
    const id = rows(`SELECT id FROM work_items WHERE media_id=${mediaId};`)[0].id;
    execD1(`UPDATE work_items SET fr_status='published' WHERE id=${id};`);
    const state = rows(`SELECT fr_status FROM work_items WHERE id=${id};`)[0];
    assert.equal(state.fr_status, "published");
  });

  test("work_items: EN publish gate is independent of FR", () => {
    execD1(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at) VALUES ('media/en-gate.jpg','image/jpeg',1,1,1,1);",
    );
    const mediaId = rows("SELECT id FROM media WHERE storage_key='media/en-gate.jpg';")[0].id;
    execD1(
      `INSERT INTO work_items (media_id, position, ratio, alt_fr, alt_en, created_at, updated_at) VALUES (${mediaId},1,'4/5','a','a',1,1);`,
    );
    const id = rows(`SELECT id FROM work_items WHERE media_id=${mediaId};`)[0].id;
    const err = expectSqlError(`UPDATE work_items SET en_status='published' WHERE id=${id};`);
    assert.match(err, /cannot publish EN — media publication rights not confirmed/);
  });

  test("testimonials: publish blocked when photo rights not confirmed", () => {
    execD1(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at) VALUES ('media/testi-photo.jpg','image/jpeg',1,1,1,1);",
    );
    const mediaId = rows("SELECT id FROM media WHERE storage_key='media/testi-photo.jpg';")[0].id;
    execD1(
      `INSERT INTO testimonials (author_name, quote_fr, quote_en, photo_media_id, position, created_at, updated_at) VALUES ('A','q','q',${mediaId},1,1,1);`,
    );
    const id = rows(`SELECT id FROM testimonials WHERE author_name='A';`)[0].id;
    const err = expectSqlError(`UPDATE testimonials SET fr_status='published' WHERE id=${id};`);
    assert.match(err, /cannot publish FR — photo publication rights not confirmed/);
  });

  test("testimonials: a photo-less testimonial publishes without any rights gate", () => {
    execD1(
      "INSERT INTO testimonials (author_name, quote_fr, quote_en, position, created_at, updated_at) VALUES ('B','q','q',2,1,1);",
    );
    const id = rows("SELECT id FROM testimonials WHERE author_name='B';")[0].id;
    execD1(`UPDATE testimonials SET fr_status='published', en_status='published' WHERE id=${id};`);
    const state = rows(`SELECT fr_status, en_status FROM testimonials WHERE id=${id};`)[0];
    assert.equal(state.fr_status, "published");
    assert.equal(state.en_status, "published");
  });
});

describe("soft delete", () => {
  test("media: deleted_at defaults to NULL, can be set (trash) and cleared (restore)", () => {
    execD1(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at) VALUES ('media/soft.jpg','image/jpeg',1,1,1,1);",
    );
    const id = rows("SELECT id FROM media WHERE storage_key='media/soft.jpg';")[0].id;
    assert.equal(rows(`SELECT deleted_at FROM media WHERE id=${id};`)[0].deleted_at, null);
    execD1(`UPDATE media SET deleted_at=5 WHERE id=${id};`);
    assert.equal(rows(`SELECT deleted_at FROM media WHERE id=${id};`)[0].deleted_at, 5);
    execD1(`UPDATE media SET deleted_at=NULL WHERE id=${id};`);
    assert.equal(rows(`SELECT deleted_at FROM media WHERE id=${id};`)[0].deleted_at, null);
  });

  test("testimonials: soft-deletable via deleted_at", () => {
    execD1(
      "INSERT INTO testimonials (author_name, quote_fr, quote_en, position, created_at, updated_at) VALUES ('C','q','q',3,1,1);",
    );
    const id = rows("SELECT id FROM testimonials WHERE author_name='C';")[0].id;
    execD1(`UPDATE testimonials SET deleted_at=9 WHERE id=${id};`);
    assert.equal(rows(`SELECT deleted_at FROM testimonials WHERE id=${id};`)[0].deleted_at, 9);
  });

  test("work_items has no deleted_at column (curation rows are hard-deleted, not soft-deleted)", () => {
    const cols = rows("PRAGMA table_info(work_items);").map((c) => c.name);
    assert.ok(!cols.includes("deleted_at"));
  });
});

describe("CHECK constraints", () => {
  test("focal_x out of 0-100 is rejected", () => {
    const err = expectSqlError(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at, focal_x) VALUES ('media/bad-focal.jpg','image/jpeg',1,1,1,1,150);",
    );
    assert.match(err, /CHECK constraint failed/);
  });

  test("invalid processing_status value is rejected ('processing' was removed, 009A)", () => {
    const err = expectSqlError(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at, processing_status) VALUES ('media/bad-status.jpg','image/jpeg',1,1,1,1,'processing');",
    );
    assert.match(err, /CHECK constraint failed/);
  });

  test("invalid media_type value is rejected (image-only at MVP)", () => {
    const err = expectSqlError(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at, media_type) VALUES ('media/bad-type.jpg','image/jpeg',1,1,1,1,'video');",
    );
    assert.match(err, /CHECK constraint failed/);
  });

  test("invalid work_items.status value is rejected", () => {
    execD1(
      "INSERT INTO media (storage_key, mime_type, size_bytes, uploaded_at, created_at, updated_at) VALUES ('media/bad-wi-status.jpg','image/jpeg',1,1,1,1);",
    );
    const mediaId = rows("SELECT id FROM media WHERE storage_key='media/bad-wi-status.jpg';")[0].id;
    const err = expectSqlError(
      `INSERT INTO work_items (status, media_id, position, ratio, alt_fr, alt_en, created_at, updated_at) VALUES ('archived',${mediaId},1,'4/5','a','a',1,1);`,
    );
    assert.match(err, /CHECK constraint failed/);
  });

  test("site_settings singleton: id can only be 1", () => {
    const err = expectSqlError(
      "INSERT INTO site_settings (id, contact_email, instagram_url, default_seo_title_fr, default_seo_title_en, default_seo_description_fr, default_seo_description_en, updated_at) VALUES (2,'a@b.c','https://instagram.com','t','t','d','d',1);",
    );
    assert.match(err, /CHECK constraint failed/);
  });

  test("page_seo.page_key rejects an unknown page", () => {
    const err = expectSqlError(
      "INSERT INTO page_seo (page_key, title_fr, title_en, description_fr, description_en, updated_at) VALUES ('blog','t','t','d','d',1);",
    );
    assert.match(err, /CHECK constraint failed/);
  });
});
