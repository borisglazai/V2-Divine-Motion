/**
 * Validation Brief 014S — staging bug: media with confirmed publication
 * rights were reportedly missing from the /admin/work/new media picker,
 * while unconfirmed media dominated the visible list.
 *
 * Root cause (found by full code audit of every place `publication_rights_
 * confirmed` is read — src/lib/db/media.ts, src/pages/admin/work/new.astro,
 * src/pages/admin/work/[id].astro, src/components/admin/MediaPickerField.astro):
 * nothing ever *excluded* rights-unconfirmed media from the picker — that
 * was correct all along (a draft can use an unrighted media; only
 * *publishing* the language is blocked, see work.ts/testimonials.ts). The
 * real defect: `listMedia()` returns rows `created_at DESC`, and the
 * picker only ever did `.filter(ready)` on top of that — so an admin's
 * newest *uploads* (typically rights-unconfirmed, fresh off the upload
 * flow validated in Brief 014/014S) always sorted ahead of older,
 * deliberately rights-confirmed media. On a media library that has
 * accumulated many rows — exactly what real staging upload validation
 * produces (JPEG/PNG/24MP/multi-upload tests) — the confirmed media an
 * admin actually wants could sit far enough down the picker's small
 * scrollable list to look entirely absent, with no reload fixing it
 * (matches the exact reported symptom: Ctrl+F5 changes nothing, because
 * it isn't a caching issue).
 *
 * `sortMediaForPicker()` (src/lib/db/media.ts) fixes this — pure, no D1,
 * tested directly here. It deliberately does NOT touch `listMedia()`
 * itself (the Médiathèque list at /admin/media keeps its existing
 * `created_at DESC` order unchanged) — only the two Work item picker call
 * sites (new.astro, [id].astro) apply it.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sortMediaForPicker } from "../../src/lib/db/media";
import type { MediaRow } from "../../src/lib/db/types";

let nextId = 1;

function fakeMedia(overrides: Partial<MediaRow> & { publication_rights_confirmed: 0 | 1; created_at: number }): MediaRow {
  const id = nextId++;
  return {
    id,
    storage_key: `media/fake-${id}/original.jpg`,
    original_filename: `fake-${id}.jpg`,
    mime_type: "image/jpeg",
    size_bytes: 1000,
    width: 800,
    height: 600,
    media_type: "image",
    alt_fr: null,
    alt_en: null,
    focal_x: 50,
    focal_y: 50,
    processing_status: "ready",
    publication_rights_note: null,
    publication_rights_confirmed_at: overrides.publication_rights_confirmed === 1 ? overrides.created_at : null,
    uploaded_at: overrides.created_at,
    authorized_at: overrides.created_at,
    updated_at: overrides.created_at,
    deleted_at: null,
    created_by: null,
    updated_by: null,
    ...overrides,
  };
}

describe("bug reproduction — the unsorted order the picker used to render (pre-fix)", () => {
  test("naive filter(ready) on a listMedia()-shaped (created_at DESC) array buries an older confirmed media behind newer unconfirmed uploads", () => {
    // Exactly what listMedia() returns: newest first. This mirrors 3
    // recent unconfirmed test uploads (Brief 014S JPEG/PNG/24MP/multi
    // validation) landing ahead of an older, deliberately rights-confirmed
    // media — the staging scenario as reported.
    const listMediaOrder: MediaRow[] = [
      fakeMedia({ created_at: 4000, publication_rights_confirmed: 0 }), // newest upload, unconfirmed
      fakeMedia({ created_at: 3000, publication_rights_confirmed: 0 }), // unconfirmed
      fakeMedia({ created_at: 2000, publication_rights_confirmed: 0 }), // unconfirmed
      fakeMedia({ created_at: 1000, publication_rights_confirmed: 1 }), // older, rights CONFIRMED
    ];

    const naivePickerOrder = listMediaOrder.filter((m) => m.processing_status === "ready");

    // The bug, demonstrated: the confirmed media ends up last, not first —
    // an admin scanning from the top of a long, height-capped list sees 3
    // unconfirmed items before ever reaching the one they actually want.
    assert.equal(naivePickerOrder[naivePickerOrder.length - 1].publication_rights_confirmed, 1);
    assert.equal(naivePickerOrder[0].publication_rights_confirmed, 0);
  });
});

describe("sortMediaForPicker — the fix", () => {
  test("rights-confirmed media sort before rights-unconfirmed media, regardless of upload recency", () => {
    const listMediaOrder: MediaRow[] = [
      fakeMedia({ created_at: 4000, publication_rights_confirmed: 0 }),
      fakeMedia({ created_at: 3000, publication_rights_confirmed: 0 }),
      fakeMedia({ created_at: 2000, publication_rights_confirmed: 0 }),
      fakeMedia({ created_at: 1000, publication_rights_confirmed: 1 }),
    ];

    const sorted = sortMediaForPicker(listMediaOrder.filter((m) => m.processing_status === "ready"));

    assert.equal(sorted[0].publication_rights_confirmed, 1, "the confirmed media must now be first");
    assert.equal(sorted[0].created_at, 1000);
  });

  test("a rights-confirmed ready media is present and ranked ahead of every unconfirmed one — exactly what /admin/work/new must show", () => {
    const confirmed = fakeMedia({ created_at: 1000, publication_rights_confirmed: 1 });
    const unconfirmedA = fakeMedia({ created_at: 5000, publication_rights_confirmed: 0 });
    const unconfirmedB = fakeMedia({ created_at: 4500, publication_rights_confirmed: 0 });

    const sorted = sortMediaForPicker([unconfirmedA, unconfirmedB, confirmed]);

    assert.ok(sorted.some((m) => m.id === confirmed.id), "the confirmed media must be present, never dropped");
    assert.equal(sorted[0].id, confirmed.id, "the confirmed media must be first");
  });

  test("a rights-unconfirmed ready media stays present too — a draft can still use it, only publishing the language is blocked elsewhere", () => {
    const unconfirmed = fakeMedia({ created_at: 1000, publication_rights_confirmed: 0 });
    const sorted = sortMediaForPicker([unconfirmed]);
    assert.equal(sorted.length, 1);
    assert.equal(sorted[0].publication_rights_confirmed, 0);
  });

  test("within each rights group, the original (newest-first) order from listMedia() is preserved — stable sort, no re-shuffling within a group", () => {
    const confirmedNewer = fakeMedia({ created_at: 2000, publication_rights_confirmed: 1 });
    const confirmedOlder = fakeMedia({ created_at: 1000, publication_rights_confirmed: 1 });
    const unconfirmedNewer = fakeMedia({ created_at: 4000, publication_rights_confirmed: 0 });
    const unconfirmedOlder = fakeMedia({ created_at: 3000, publication_rights_confirmed: 0 });

    // Already in listMedia()'s created_at DESC order within each group.
    const input = [unconfirmedNewer, unconfirmedOlder, confirmedNewer, confirmedOlder];
    const sorted = sortMediaForPicker(input);

    assert.deepEqual(
      sorted.map((m) => m.id),
      [confirmedNewer.id, confirmedOlder.id, unconfirmedNewer.id, unconfirmedOlder.id],
    );
  });

  test("does not mutate the input array (listMedia()'s own return value)", () => {
    const input = [
      fakeMedia({ created_at: 1000, publication_rights_confirmed: 0 }),
      fakeMedia({ created_at: 2000, publication_rights_confirmed: 1 }),
    ];
    const snapshot = [...input];
    sortMediaForPicker(input);
    assert.deepEqual(input, snapshot);
  });

  test("empty list stays empty", () => {
    assert.deepEqual(sortMediaForPicker([]), []);
  });
});
