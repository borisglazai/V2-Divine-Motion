/**
 * Implementation Brief 013 — CMS Travail mutation logic tests. Calls the
 * real action functions in src/lib/admin/work-actions.ts directly — the
 * exact same functions the Astro endpoints in
 * src/pages/admin/work/**\/*.ts delegate to (see each endpoint file: auth
 * check, then `await xAction(getDb(), ...)`, then `redirect(result.redirect)`).
 * These actions take `db: D1Database` explicitly and never import
 * `src/lib/db/client.ts`, so — same as every src/lib/db/* module — they
 * run under plain `node --test` against a real local D1 via the Brief 011
 * Miniflare harness (tests/dal/harness.ts), not a mocked DAL.
 *
 * This is the endpoint-logic analogue of tests/dal/dal.test.ts: it does
 * NOT re-test DAL mechanics already covered there in depth (reorder
 * isolation internals, publish/snapshot atomicity, rights-gate wiring) —
 * it proves the admin-specific layer built on top of them (form
 * validation, draft resolution, media-usability gating, error-message
 * mapping, redirect targets) using the real production code.
 *
 * Mutation security (Origin/method/identity) is tested separately and
 * purely in tests/auth/mutation.test.ts; `preview.astro` (an Astro page,
 * not a plain function) is not covered here — its "draft visible before
 * publish" behavior was verified manually against a real `astro dev`
 * session (see IMPLEMENTATION REPORT 013) and relies on the exact same
 * `getWorkItemDraft`/`getWorkItem` reads this suite already exercises.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, closeTestDb } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as work from "../../src/lib/db/work";
import { listSnapshots } from "../../src/lib/db/snapshots";
import {
  createWorkItemAction,
  saveWorkItemAction,
  publishWorkItemAction,
  deleteWorkItemDraftAction,
  setWorkItemLanguageStatusAction,
  reorderWorkItemsAction,
} from "../../src/lib/admin/work-actions";
import { mediaFileUrl } from "../../src/lib/admin/media-preview";

let db: D1Database;
const UPDATED_BY = "cms-test-admin@divinemotion.ca";

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

function workItemForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    mediaId: "1",
    category: "wedding",
    position: "1",
    ratio: "4/5",
    altFr: "alt fr",
    altEn: "alt en",
    captionFr: "légende",
    captionEn: "caption",
    focalX: "50",
    focalY: "40",
    isVisible: "on",
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) fd.set(key, value);
  return fd;
}

function languageStatusForm(locale: "fr" | "en", status: "draft" | "published" | "archived"): FormData {
  const fd = new FormData();
  fd.set("locale", locale);
  fd.set("status", status);
  return fd;
}

describe("CMS Travail — full create -> save -> publish cycle", () => {
  let draftId: number;

  test("create draft", async () => {
    const mediaId = await findMediaId("media/seed-a.jpg");
    const result = await createWorkItemAction(db, workItemForm({ mediaId: String(mediaId), altFr: "original fr" }), UPDATED_BY);
    assert.match(result.redirect, /^\/admin\/work\/\d+\?flash=success/);
    draftId = Number(result.redirect.match(/\/admin\/work\/(\d+)/)![1]);

    const row = await work.getWorkItem(db, draftId);
    assert.equal(row!.status, "draft");
    assert.equal(row!.draft_of_id, null, "brand-new item, never published before");
    assert.equal(row!.alt_fr, "original fr");
  });

  test("save draft updates only the draft", async () => {
    const result = await saveWorkItemAction(db, draftId, workItemForm({ altFr: "updated fr" }), UPDATED_BY);
    if ("notFound" in result) throw new Error("unexpected 404");
    assert.match(result.redirect, /flash=success/);
    const row = await work.getWorkItem(db, draftId);
    assert.equal(row!.alt_fr, "updated fr");
  });

  test("publish promotes the brand-new draft in place, no snapshot (nothing to roll back to)", async () => {
    const beforeSnaps = await listSnapshots(db, "work_item", String(draftId));
    const result = await publishWorkItemAction(db, draftId, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    const row = await work.getWorkItem(db, draftId);
    assert.equal(row!.status, "published");
    assert.equal(row!.alt_fr, "updated fr");

    const afterSnaps = await listSnapshots(db, "work_item", String(draftId));
    assert.equal(afterSnaps.length, beforeSnaps.length);
  });
});

describe("CMS Travail — editing an already-published item auto-creates a draft, public row stays untouched", () => {
  let publishedId: number;
  let originalCaption: string | null;

  test("setup: a published seed item", async () => {
    const all = await work.listAllWorkItems(db);
    const published = all.filter((r) => r.status === "published")[0];
    publishedId = published.id;
    originalCaption = published.caption_fr;
  });

  test("save auto-creates a draft (Brief 013 §13) and leaves the published row untouched", async () => {
    const result = await saveWorkItemAction(db, publishedId, workItemForm({ captionFr: "ISOLATION TEST CAPTION" }), UPDATED_BY);
    if ("notFound" in result) throw new Error("unexpected 404");
    assert.match(result.redirect, /flash=success/);

    const publicRow = await work.getWorkItem(db, publishedId);
    assert.equal(publicRow!.caption_fr, originalCaption, "the published row must be untouched by a save");

    const draft = await work.getWorkItemDraft(db, publishedId);
    assert.ok(draft, "a draft must have been created");
    assert.equal(draft!.caption_fr, "ISOLATION TEST CAPTION");
  });

  test("publish merges the draft onto the published row; a snapshot of the PRE-publish state is created; draft is gone", async () => {
    const draft = await work.getWorkItemDraft(db, publishedId);
    const result = await publishWorkItemAction(db, draft!.id, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    const publicRow = await work.getWorkItem(db, publishedId);
    assert.equal(publicRow!.caption_fr, "ISOLATION TEST CAPTION");

    const draftGone = await work.getWorkItemDraft(db, publishedId);
    assert.equal(draftGone, null);

    const snaps = await listSnapshots(db, "work_item", String(publishedId));
    assert.ok(snaps.length >= 1);
    const payload = JSON.parse((snaps[0] as { snapshot_json: string }).snapshot_json);
    assert.notEqual(payload.caption_fr, "ISOLATION TEST CAPTION", "snapshot captures the PRE-publish value");
  });
});

describe("CMS Travail — delete draft", () => {
  test("delete-draft removes only the draft, never a published row", async () => {
    const mediaId = await findMediaId("media/seed-b.jpg");
    const created = await work.createWorkItem(db, {
      mediaId,
      position: 50,
      ratio: "1/1",
      altFr: "to delete",
      altEn: "to delete",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const draftId = created.data.draftId;

    const result = await deleteWorkItemDraftAction(db, draftId);
    assert.match(result.redirect, /flash=success/);
    assert.equal(await work.getWorkItem(db, draftId), null);
  });
});

describe("CMS Travail — FR/EN independence via the language-status action", () => {
  let itemId: number;
  let unrightedMediaId: number;

  test("setup: a published work_item on a media without confirmed rights", async () => {
    const createdMedia = await media.createMediaMetadata(db, {
      storageKey: "media/cms-test-unrighted.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    assert.equal(createdMedia.ok, true);
    if (!createdMedia.ok) return;
    unrightedMediaId = createdMedia.data.id;

    const created = await work.createWorkItem(db, {
      mediaId: unrightedMediaId,
      position: 51,
      ratio: "4/5",
      altFr: "a",
      altEn: "a",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    itemId = created.data.draftId;
    await work.publishWorkItem(db, itemId);
  });

  test("publication rights required: FR publish is blocked with a clear message, not raw SQL", async () => {
    const fd = new FormData();
    fd.set("locale", "fr");
    fd.set("status", "published");
    const result = await setWorkItemLanguageStatusAction(db, itemId, fd, UPDATED_BY);
    assert.match(result.redirect, /flash=error/);
    const message = new URL(result.redirect, "http://placeholder.local").searchParams.get("flash_message");
    assert.match(message ?? "", /Publication impossible/);

    const row = await work.getWorkItem(db, itemId);
    assert.equal(row!.fr_status, "draft", "must not have been published");
  });

  test("confirming rights unblocks FR publish; EN stays independent", async () => {
    await media.updateMediaMetadata(db, unrightedMediaId, { publicationRightsConfirmed: true });

    const frForm = new FormData();
    frForm.set("locale", "fr");
    frForm.set("status", "published");
    const frResult = await setWorkItemLanguageStatusAction(db, itemId, frForm, UPDATED_BY);
    assert.match(frResult.redirect, /flash=success/);

    let row = await work.getWorkItem(db, itemId);
    assert.equal(row!.fr_status, "published");
    assert.equal(row!.en_status, "draft", "EN must remain untouched by the FR-only action");

    const enForm = new FormData();
    enForm.set("locale", "en");
    enForm.set("status", "published");
    const enResult = await setWorkItemLanguageStatusAction(db, itemId, enForm, UPDATED_BY);
    assert.match(enResult.redirect, /flash=success/);

    row = await work.getWorkItem(db, itemId);
    assert.equal(row!.fr_status, "published", "publishing EN afterwards must not un-publish FR");
    assert.equal(row!.en_status, "published");
  });

  test("invalid locale/status values are rejected before touching the DAL", async () => {
    const fd = new FormData();
    fd.set("locale", "de");
    fd.set("status", "published");
    const result = await setWorkItemLanguageStatusAction(db, itemId, fd, UPDATED_BY);
    assert.match(result.redirect, /flash=error/);
  });
});

describe("CMS Travail — reorder action (draft-safe only)", () => {
  test("reordering never changes the public order until an explicit per-item publish", async () => {
    const all = await work.listAllWorkItems(db);
    const published = all.filter((r) => r.status === "published").slice(0, 3);
    assert.equal(published.length, 3);
    const ids = published.map((r) => r.id);
    const beforeRows = await Promise.all(ids.map((id) => work.getWorkItem(db, id)));
    const beforePositions = beforeRows.map((r) => r!.position);

    const reversed = [...ids].reverse();
    const formData = new FormData();
    formData.set("orderedIds", JSON.stringify(reversed));

    const result = await reorderWorkItemsAction(db, formData, UPDATED_BY);
    assert.match(result.redirect, /flash=success/);

    const afterReorder = await Promise.all(ids.map((id) => work.getWorkItem(db, id)));
    assert.deepEqual(
      afterReorder.map((r) => r!.position),
      beforePositions,
      "reordering must never change the public/published positions",
    );
  });

  test("malformed orderedIds payload is rejected cleanly", async () => {
    const formData = new FormData();
    formData.set("orderedIds", "not-json");
    const result = await reorderWorkItemsAction(db, formData, UPDATED_BY);
    assert.match(result.redirect, /flash=error/);
  });
});

describe("CMS Travail — media picker only offers ready, non-deleted media", () => {
  test("deleted, failed and pending media are excluded; ready media is included", async () => {
    const readyMedia = await media.createMediaMetadata(db, {
      storageKey: "media/cms-test-ready.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
    });
    const pendingMedia = await media.createMediaMetadata(db, {
      storageKey: "media/cms-test-pending.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
    });
    const failedMedia = await media.createMediaMetadata(db, {
      storageKey: "media/cms-test-failed.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
    });
    const deletedMedia = await media.createMediaMetadata(db, {
      storageKey: "media/cms-test-deleted.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
    });
    const abandonedMedia = await media.createMediaMetadata(db, {
      storageKey: "media/cms-test-abandoned.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
    });
    assert.ok(readyMedia.ok && pendingMedia.ok && failedMedia.ok && deletedMedia.ok && abandonedMedia.ok);
    if (!readyMedia.ok || !pendingMedia.ok || !failedMedia.ok || !deletedMedia.ok || !abandonedMedia.ok) return;

    // Brief 014: 'ready' is only reachable from 'uploaded' — the real
    // upload-complete flow always confirms R2 presence (markMediaUploaded)
    // before validating content (markMediaReady).
    await media.markMediaUploaded(db, readyMedia.data.id);
    await media.markMediaReady(db, readyMedia.data.id, { width: 100, height: 100 });
    // pendingMedia stays 'pending' (never marked ready)
    await media.markMediaFailed(db, failedMedia.data.id);
    await media.markMediaUploaded(db, deletedMedia.data.id);
    await media.markMediaReady(db, deletedMedia.data.id, { width: 100, height: 100 });
    await media.softDeleteMedia(db, deletedMedia.data.id);
    await media.abandonStalePendingMedia(db, -1000); // abandonedMedia stays 'pending' otherwise — force it abandoned

    // Exactly what src/pages/admin/work/new.astro and [id].astro do before
    // handing the list to <MediaPickerField> (Validation Brief 014S: the
    // sort was added on top of this same filter, never a change to it).
    const pickerMedia = media.sortMediaForPicker((await media.listMedia(db)).filter((m) => m.processing_status === "ready"));
    const pickerIds = new Set(pickerMedia.map((m) => m.id));

    assert.ok(pickerIds.has(readyMedia.data.id), "ready media must be offered");
    assert.ok(!pickerIds.has(pendingMedia.data.id), "pending media must not be offered");
    assert.ok(!pickerIds.has(failedMedia.data.id), "failed media must not be offered");
    assert.ok(!pickerIds.has(deletedMedia.data.id), "deleted media must not be offered, even though it was ready");
    assert.ok(!pickerIds.has(abandonedMedia.data.id), "abandoned media must not be offered");
  });

  test("Validation Brief 014S — a rights-confirmed media sorts ahead of newer rights-unconfirmed media in the real picker order", async () => {
    const olderConfirmed = await media.createMediaMetadata(db, {
      storageKey: "media/014s-older-confirmed.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
    });
    assert.ok(olderConfirmed.ok);
    if (!olderConfirmed.ok) return;
    await media.markMediaUploaded(db, olderConfirmed.data.id);
    await media.markMediaReady(db, olderConfirmed.data.id, { width: 100, height: 100 });
    await media.updateMediaMetadata(db, olderConfirmed.data.id, { publicationRightsConfirmed: true }, UPDATED_BY);

    // Newer uploads, created after — same shape as fresh test uploads
    // landing on top of a growing media library, unconfirmed by default.
    for (const key of ["media/014s-newer-unconfirmed-1.jpg", "media/014s-newer-unconfirmed-2.jpg"]) {
      const created = await media.createMediaMetadata(db, { storageKey: key, mimeType: "image/jpeg", sizeBytes: 100 });
      assert.ok(created.ok);
      if (!created.ok) continue;
      await media.markMediaUploaded(db, created.data.id);
      await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });
    }

    const pickerMedia = media.sortMediaForPicker((await media.listMedia(db)).filter((m) => m.processing_status === "ready"));
    const olderConfirmedIndex = pickerMedia.findIndex((m) => m.id === olderConfirmed.data.id);

    assert.notEqual(olderConfirmedIndex, -1, "the confirmed media must still be present");
    assert.equal(pickerMedia[olderConfirmedIndex].publication_rights_confirmed, 1);
    // Every unconfirmed media in this run must rank AFTER it, no matter how recently uploaded.
    for (let i = 0; i < olderConfirmedIndex; i++) {
      assert.equal(pickerMedia[i].publication_rights_confirmed, 1, `entry #${i} ranked ahead of the confirmed media but isn't itself confirmed`);
    }
  });

  test("Validation Brief 014S — an unconfirmed-rights ready media stays selectable for a draft, but publishing its language stays blocked until rights are confirmed", async () => {
    const unrighted = await media.createMediaMetadata(db, {
      storageKey: "media/014s-unrighted-usable.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
    });
    assert.ok(unrighted.ok);
    if (!unrighted.ok) return;
    await media.markMediaUploaded(db, unrighted.data.id);
    await media.markMediaReady(db, unrighted.data.id, { width: 100, height: 100 });

    // Still offered by the picker (never excluded for lacking rights).
    const pickerMedia = media.sortMediaForPicker((await media.listMedia(db)).filter((m) => m.processing_status === "ready"));
    assert.ok(pickerMedia.some((m) => m.id === unrighted.data.id), "unconfirmed media must still be offered in the picker");

    // Still usable to create and publish a draft's CONTENT (curation is
    // never gated on rights — only making a language live is).
    const created = await createWorkItemAction(db, workItemForm({ mediaId: String(unrighted.data.id) }), UPDATED_BY);
    const draftId = Number(created.redirect.match(/\/admin\/work\/(\d+)/)![1]);
    const published = await publishWorkItemAction(db, draftId, UPDATED_BY);
    assert.match(published.redirect, /flash=success/);
    const publishedId = Number(published.redirect.match(/\/admin\/work\/(\d+)/)![1]);

    // Publishing the FR language is refused — clear business error, not a raw SQL failure.
    const blocked = await setWorkItemLanguageStatusAction(db, publishedId, languageStatusForm("fr", "published"), UPDATED_BY);
    assert.match(blocked.redirect, /flash=error/);
    const row = await work.getWorkItem(db, publishedId);
    assert.equal(row!.fr_status, "draft", "the language must remain unpublished while rights are unconfirmed");

    // Confirm rights, then the exact same publish action succeeds.
    await media.updateMediaMetadata(db, unrighted.data.id, { publicationRightsConfirmed: true }, UPDATED_BY);
    const allowed = await setWorkItemLanguageStatusAction(db, publishedId, languageStatusForm("fr", "published"), UPDATED_BY);
    assert.match(allowed.redirect, /flash=success/);
    const rowAfter = await work.getWorkItem(db, publishedId);
    assert.equal(rowAfter!.fr_status, "published");
  });

  test("createWorkItemAction itself refuses a mediaId that isn't ready/not deleted, even if the client bypassed the picker", async () => {
    const notReady = await media.createMediaMetadata(db, {
      storageKey: "media/cms-test-bypass.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
    });
    assert.equal(notReady.ok, true);
    if (!notReady.ok) return;

    const before = (await work.listAllWorkItems(db)).length;
    const result = await createWorkItemAction(db, workItemForm({ mediaId: String(notReady.data.id) }), UPDATED_BY);
    assert.match(result.redirect, /error_mediaId/);
    const after = (await work.listAllWorkItems(db)).length;
    assert.equal(after, before, "nothing must be created when the media isn't usable");
  });
});

describe("Validation Brief 014S bug #2 — media picker thumbnails resolve to a real preview URL", () => {
  // MediaPickerField.astro has no independent render harness in this repo
  // (no Vitest/Astro-container test runner — see tests/admin/media-preview.test.ts's
  // header comment) — these tests instead exercise the exact server-side
  // data pipeline /admin/work/new.astro and /admin/work/[id].astro run
  // before handing media to that component, and assert every item in the
  // result resolves through the same mediaFileUrl() the component itself
  // now calls (never the old hardcoded mock placeholder).
  test("/admin/work/new: every ready media handed to the picker resolves a real /admin/media/:id/file preview URL", async () => {
    const created = await media.createMediaMetadata(db, { storageKey: "media/014s-bug2-new.jpg", mimeType: "image/jpeg", sizeBytes: 100 });
    assert.ok(created.ok);
    if (!created.ok) return;
    await media.markMediaUploaded(db, created.data.id);
    await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });

    // Exactly what src/pages/admin/work/new.astro computes.
    const readyMedia = media.sortMediaForPicker((await media.listMedia(db)).filter((m) => m.processing_status === "ready"));
    assert.ok(readyMedia.length > 0);

    const thisItem = readyMedia.find((m) => m.id === created.data.id);
    assert.ok(thisItem, "the newly-uploaded media must be in the list new.astro passes to the picker");
    assert.equal(mediaFileUrl(thisItem!.id), `/admin/media/${created.data.id}/file`);

    // No item in the whole list ever falls back to the old broken source.
    for (const item of readyMedia) {
      assert.doesNotMatch(mediaFileUrl(item.id), /placeholder/);
    }
  });

  test("/admin/work/[id]: the same pipeline, including the currently-selected media, resolves a real preview URL", async () => {
    const created = await media.createMediaMetadata(db, { storageKey: "media/014s-bug2-edit.jpg", mimeType: "image/jpeg", sizeBytes: 100 });
    assert.ok(created.ok);
    if (!created.ok) return;
    await media.markMediaUploaded(db, created.data.id);
    await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });

    const draftResult = await createWorkItemAction(db, workItemForm({ mediaId: String(created.data.id) }), UPDATED_BY);
    const draftId = Number(draftResult.redirect.match(/\/admin\/work\/(\d+)/)![1]);

    // Exactly what src/pages/admin/work/[id].astro computes, plus resolving
    // which item is pre-selected (formSource.media_id, same as that page).
    const row = await work.getWorkItem(db, draftId);
    assert.ok(row);
    const readyMedia = media.sortMediaForPicker((await media.listMedia(db)).filter((m) => m.processing_status === "ready"));
    const selected = readyMedia.find((m) => m.id === row!.media_id);

    assert.ok(selected, "the work item's current media must be among the ready media the picker offers");
    assert.equal(selected!.id, created.data.id);
    assert.equal(mediaFileUrl(selected!.id), `/admin/media/${created.data.id}/file`);
  });
});

describe("Validation Brief 014S bug A — /admin/work/[id]/preview resolves a real media preview URL", () => {
  // preview.astro has no independent render harness in this repo (see
  // tests/admin/media-preview.test.ts's header comment) — this exercises
  // the exact resolution preview.astro now performs
  // (mediaFileUrl(previewRow.media_id)) for both states that page can show:
  // an open draft, and (once published) the published row itself.
  test("draft preview: resolves the draft's own media, never the old mock placeholder", async () => {
    const created = await media.createMediaMetadata(db, { storageKey: "media/014s-a-draft-preview.jpg", mimeType: "image/jpeg", sizeBytes: 100 }, UPDATED_BY);
    assert.ok(created.ok);
    if (!created.ok) return;
    await media.markMediaUploaded(db, created.data.id);
    await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });

    const draftResult = await createWorkItemAction(db, workItemForm({ mediaId: String(created.data.id) }), UPDATED_BY);
    const draftId = Number(draftResult.redirect.match(/\/admin\/work\/(\d+)/)![1]);

    // Exactly what preview.astro computes: draft.status === 'draft' -> draft itself is previewRow.
    const row = await work.getWorkItem(db, draftId);
    assert.ok(row);
    assert.equal(row!.status, "draft");
    assert.equal(mediaFileUrl(row!.media_id), `/admin/media/${created.data.id}/file`);
    assert.doesNotMatch(mediaFileUrl(row!.media_id), /placeholder/);
  });

  test("published preview (no open draft): resolves the published row's media", async () => {
    const created = await media.createMediaMetadata(db, { storageKey: "media/014s-a-published-preview.jpg", mimeType: "image/jpeg", sizeBytes: 100 }, UPDATED_BY);
    assert.ok(created.ok);
    if (!created.ok) return;
    await media.markMediaUploaded(db, created.data.id);
    await media.markMediaReady(db, created.data.id, { width: 100, height: 100 });

    const draftResult = await createWorkItemAction(db, workItemForm({ mediaId: String(created.data.id) }), UPDATED_BY);
    const draftId = Number(draftResult.redirect.match(/\/admin\/work\/(\d+)/)![1]);
    const publishResult = await publishWorkItemAction(db, draftId, UPDATED_BY);
    const publishedId = Number(publishResult.redirect.match(/\/admin\/work\/(\d+)/)![1]);

    // Exactly what preview.astro computes: no open draft -> previewRow = the published row itself.
    const row = await work.getWorkItem(db, publishedId);
    const openDraft = await work.getWorkItemDraft(db, publishedId);
    assert.equal(openDraft, null, "no draft should be open right after a fresh publish");
    assert.equal(mediaFileUrl(row!.media_id), `/admin/media/${created.data.id}/file`);
  });
});

describe("CMS Travail — server-side validation is independent of the picker/HTML", () => {
  test("create rejects an unusable form without ever calling the DAL create", async () => {
    const before = (await work.listAllWorkItems(db)).length;
    const result = await createWorkItemAction(db, workItemForm({ altFr: "", ratio: "bad" }), UPDATED_BY);
    assert.match(result.redirect, /error_altFr/);
    assert.match(result.redirect, /error_ratio/);
    const after = (await work.listAllWorkItems(db)).length;
    assert.equal(after, before);
  });

  test("save on a non-existent id returns notFound", async () => {
    const result = await saveWorkItemAction(db, 999999, workItemForm(), UPDATED_BY);
    assert.deepEqual(result, { notFound: true });
  });
});
