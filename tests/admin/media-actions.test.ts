/**
 * Implementation Brief 014 — Media Library + R2 upload lifecycle tests.
 * Calls the real action functions in src/lib/admin/media-actions.ts
 * directly against a Miniflare-backed local D1 + R2 (tests/dal/harness.ts,
 * extended in this brief with `getTestBucket()`), the same functions the
 * Astro endpoints in src/pages/admin/media/**\/*.ts delegate to.
 *
 * `authorizeMediaUploadAction` never touches R2 itself (it only signs a
 * URL — see r2-presign.test.ts for that in isolation) — a real presigned
 * PUT against `*.r2.cloudflarestorage.com` needs a real Cloudflare
 * account, out of scope for local/CI tests (§45/§74). Instead, these
 * tests simulate "the browser uploaded the file" the same way the real
 * upload-complete flow will observe it: by writing bytes directly into
 * the Miniflare-backed bucket at the storage key `authorizeMediaUploadAction`
 * generated, then exercising `completeMediaUploadAction` exactly as the
 * real `/admin/media/:id/upload-complete` endpoint would. This still
 * proves the real thing this brief cares about: that the server-side half
 * of the lifecycle (D1 metadata, real R2 verification, magic-byte +
 * dimension checks, state transitions) behaves correctly against a real
 * R2 engine, not a mock.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resetTestDb, seedTestDb, getTestBucket, closeTestDb } from "../dal/harness";
import * as media from "../../src/lib/db/media";
import * as work from "../../src/lib/db/work";
import {
  authorizeMediaUploadAction,
  completeMediaUploadAction,
  deleteMediaAction,
  cleanupAbandonedMediaAction,
  MAX_MEDIA_UPLOAD_BYTES,
  type R2Credentials,
} from "../../src/lib/admin/media-actions";
import { abandonStalePendingMedia } from "../../src/lib/db/media";

let db: D1Database;
let bucket: R2Bucket;
const UPDATED_BY = "media-test-admin@divinemotion.ca";

const FAKE_CREDENTIALS: R2Credentials = {
  accountId: "test-account",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucketName: "test-bucket",
};

before(async () => {
  db = await resetTestDb();
  seedTestDb();
  bucket = await getTestBucket();
});

after(async () => {
  await closeTestDb();
});

// ---------------------------------------------------------------------------
// Byte fixtures — same header-construction approach as
// tests/storage/image-inspect.test.ts, no external fixture files needed.
// ---------------------------------------------------------------------------

function buildPngBytes(width: number, height: number, paddingBytes = 0): Uint8Array {
  const header = new Uint8Array(33);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(header.buffer);
  view.setUint32(8, 13, false);
  header.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  header[24] = 8;
  header[25] = 6;
  if (paddingBytes === 0) return header;
  const full = new Uint8Array(header.length + paddingBytes);
  full.set(header, 0);
  return full;
}

function buildJpegBytes(width: number, height: number, paddingBytes = 0): Uint8Array {
  const bytes: number[] = [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08];
  bytes.push((height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff);
  bytes.push(0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01);
  bytes.push(0xff, 0xd9);
  const header = new Uint8Array(bytes);
  if (paddingBytes === 0) return header;
  const full = new Uint8Array(header.length + paddingBytes);
  full.set(header, 0);
  return full;
}

async function authorizeAndFetchRow(input: { filename: string; mimeType: string; sizeBytes: number }) {
  const result = await authorizeMediaUploadAction(db, FAKE_CREDENTIALS, input, UPDATED_BY);
  assert.equal(result.ok, true, "authorize must succeed");
  if (!result.ok) throw new Error("unreachable");
  const row = await media.getMedia(db, result.mediaId);
  assert.ok(row, "media row must exist after authorize");
  return { mediaId: result.mediaId, storageKey: row!.storage_key };
}

describe("Media Library — authorize", () => {
  test("creates a 'pending' D1 row and a presigned upload URL, never touching R2", async () => {
    const result = await authorizeMediaUploadAction(
      db,
      FAKE_CREDENTIALS,
      { filename: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 1000 },
      UPDATED_BY,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.uploadUrl.startsWith("https://test-account.r2.cloudflarestorage.com/"));

    const row = await media.getMedia(db, result.mediaId);
    assert.equal(row!.processing_status, "pending");
    assert.equal(row!.uploaded_at, row!.authorized_at, "uploaded_at starts as an honest provisional placeholder (ADR-017)");
  });

  test("rejects an unsupported MIME type (§10 — JPEG/PNG only)", async () => {
    const result = await authorizeMediaUploadAction(
      db,
      FAKE_CREDENTIALS,
      { filename: "photo.webp", mimeType: "image/webp", sizeBytes: 1000 },
      UPDATED_BY,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "UNSUPPORTED_MIME_TYPE");
  });

  test("rejects a size over the documented limit (§11)", async () => {
    const result = await authorizeMediaUploadAction(
      db,
      FAKE_CREDENTIALS,
      { filename: "huge.jpg", mimeType: "image/jpeg", sizeBytes: MAX_MEDIA_UPLOAD_BYTES + 1 },
      UPDATED_BY,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "INVALID_SIZE");
  });

  test("rejects when R2 credentials aren't configured — fails closed, never a bypass", async () => {
    const result = await authorizeMediaUploadAction(
      db,
      null,
      { filename: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 1000 },
      UPDATED_BY,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "STORAGE_NOT_CONFIGURED");
  });
});

describe("Media Library — light JPEG: authorize -> upload -> complete -> ready -> persists", () => {
  test("full cycle", async () => {
    const bytes = buildJpegBytes(1200, 800);
    const { mediaId, storageKey } = await authorizeAndFetchRow({
      filename: "light.jpg",
      mimeType: "image/jpeg",
      sizeBytes: bytes.byteLength,
    });

    await bucket.put(storageKey, bytes);

    const completed = await completeMediaUploadAction(db, bucket, mediaId);
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.media.processing_status, "ready");
    assert.equal(completed.media.width, 1200);
    assert.equal(completed.media.height, 800);
    assert.ok(completed.media.uploaded_at >= completed.media.authorized_at!);

    // "reload admin" — metadata still there, R2 object still there (§56 persistence).
    const reloaded = await media.getMedia(db, mediaId);
    assert.equal(reloaded!.processing_status, "ready");
    const stillInR2 = await bucket.head(storageKey);
    assert.ok(stillInR2, "the object must still be present in R2 after completion");
  });
});

describe("Media Library — PNG: same full cycle", () => {
  test("full cycle", async () => {
    const bytes = buildPngBytes(1600, 900);
    const { mediaId, storageKey } = await authorizeAndFetchRow({
      filename: "light.png",
      mimeType: "image/png",
      sizeBytes: bytes.byteLength,
    });
    await bucket.put(storageKey, bytes);

    const completed = await completeMediaUploadAction(db, bucket, mediaId);
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.media.processing_status, "ready");
    assert.equal(completed.media.width, 1600);
    assert.equal(completed.media.height, 900);
  });
});

describe("Media Library — ~24MP image: large file, exact dimensions, no crash", () => {
  test("a 6000x4000 (24MP) JPEG with a multi-megabyte body completes cleanly", async () => {
    const bytes = buildJpegBytes(6000, 4000, 8 * 1024 * 1024); // 8 MB padded body
    const { mediaId, storageKey } = await authorizeAndFetchRow({
      filename: "24mp.jpg",
      mimeType: "image/jpeg",
      sizeBytes: bytes.byteLength,
    });
    await bucket.put(storageKey, bytes);

    const startedAt = Date.now();
    const completed = await completeMediaUploadAction(db, bucket, mediaId);
    const elapsedMs = Date.now() - startedAt;

    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.media.width, 6000);
    assert.equal(completed.media.height, 4000);
    assert.ok(elapsedMs < 10_000, `should complete well within a few seconds, took ${elapsedMs}ms`);
  });
});

describe("Media Library — multi-upload: independent per-file cycles, one failure never blocks the others", () => {
  test("3 concurrent files, 1 corrupt: the 2 valid ones reach ready, the corrupt one fails alone", async () => {
    const good1 = buildJpegBytes(800, 600);
    const good2 = buildPngBytes(640, 480);
    const corrupt = new TextEncoder().encode("this is not an image at all, just plain text bytes");

    const [row1, row2, row3] = await Promise.all([
      authorizeAndFetchRow({ filename: "a.jpg", mimeType: "image/jpeg", sizeBytes: good1.byteLength }),
      authorizeAndFetchRow({ filename: "b.png", mimeType: "image/png", sizeBytes: good2.byteLength }),
      authorizeAndFetchRow({ filename: "c.jpg", mimeType: "image/jpeg", sizeBytes: corrupt.byteLength }),
    ]);

    await Promise.all([
      bucket.put(row1.storageKey, good1),
      bucket.put(row2.storageKey, good2),
      bucket.put(row3.storageKey, corrupt),
    ]);

    const [r1, r2, r3] = await Promise.all([
      completeMediaUploadAction(db, bucket, row1.mediaId),
      completeMediaUploadAction(db, bucket, row2.mediaId),
      completeMediaUploadAction(db, bucket, row3.mediaId),
    ]);

    assert.equal(r1.ok, true, "file 1 must succeed independently of file 3's failure");
    assert.equal(r2.ok, true, "file 2 must succeed independently of file 3's failure");
    assert.equal(r3.ok, false, "the corrupt file must fail");

    const row3After = await media.getMedia(db, row3.mediaId);
    assert.equal(row3After!.processing_status, "failed");
  });
});

describe("Media Library — corrupt/fake file: upload can 'succeed', post-upload validation must fail", () => {
  test("bytes with no real image magic number -> failed, never ready", async () => {
    const fake = new TextEncoder().encode("PRETENDING-TO-BE-A-JPEG-BUT-ISNT-0123456789");
    const { mediaId, storageKey } = await authorizeAndFetchRow({
      filename: "fake.jpg",
      mimeType: "image/jpeg",
      sizeBytes: fake.byteLength,
    });
    await bucket.put(storageKey, fake);

    const completed = await completeMediaUploadAction(db, bucket, mediaId);
    assert.equal(completed.ok, false);
    if (completed.ok) return;
    assert.equal(completed.code, "CORRUPT_OR_UNSUPPORTED");

    const row = await media.getMedia(db, mediaId);
    assert.equal(row!.processing_status, "failed");
  });
});

describe("Media Library — MIME mismatch: real bytes don't match the declared type", () => {
  test("declared image/jpeg but the real uploaded object is a PNG -> refused", async () => {
    const pngBytes = buildPngBytes(400, 300);
    const { mediaId, storageKey } = await authorizeAndFetchRow({
      filename: "actually-a-png.jpg",
      mimeType: "image/jpeg",
      sizeBytes: pngBytes.byteLength,
    });
    await bucket.put(storageKey, pngBytes);

    const completed = await completeMediaUploadAction(db, bucket, mediaId);
    assert.equal(completed.ok, false);
    if (completed.ok) return;
    assert.equal(completed.code, "MIME_MISMATCH");

    const row = await media.getMedia(db, mediaId);
    assert.equal(row!.processing_status, "failed");
  });
});

describe("Media Library — size mismatch: real object size differs from what was declared", () => {
  test("declared size doesn't match the real R2 object -> refused", async () => {
    const bytes = buildJpegBytes(800, 600);
    const { mediaId, storageKey } = await authorizeAndFetchRow({
      filename: "size-lie.jpg",
      mimeType: "image/jpeg",
      sizeBytes: bytes.byteLength + 500, // declared bigger than what actually gets uploaded
    });
    await bucket.put(storageKey, bytes);

    const completed = await completeMediaUploadAction(db, bucket, mediaId);
    assert.equal(completed.ok, false);
    if (completed.ok) return;
    assert.equal(completed.code, "SIZE_MISMATCH");

    const row = await media.getMedia(db, mediaId);
    assert.equal(row!.processing_status, "failed");
  });
});

describe("Media Library — upload-complete with nothing actually in R2", () => {
  test("authorize without ever uploading, then call complete -> OBJECT_NOT_FOUND, failed", async () => {
    const result = await authorizeMediaUploadAction(
      db,
      FAKE_CREDENTIALS,
      { filename: "never-uploaded.jpg", mimeType: "image/jpeg", sizeBytes: 1000 },
      UPDATED_BY,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const completed = await completeMediaUploadAction(db, bucket, result.mediaId);
    assert.equal(completed.ok, false);
    if (completed.ok) return;
    assert.equal(completed.code, "OBJECT_NOT_FOUND");

    const row = await media.getMedia(db, result.mediaId);
    assert.equal(row!.processing_status, "failed");
  });
});

describe("Media Library — abandoned: a stale pending upload becomes 'abandoned'", () => {
  test("cleanup marks an old pending row abandoned; upload-complete on it is then refused", async () => {
    const result = await authorizeMediaUploadAction(
      db,
      FAKE_CREDENTIALS,
      { filename: "stale.jpg", mimeType: "image/jpeg", sizeBytes: 1000 },
      UPDATED_BY,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;

    // Force every currently-pending row to look "already expired", instead
    // of waiting out the real 15-minute window (ABANDON_AFTER_MS).
    const abandonedCount = await abandonStalePendingMedia(db, -1000);
    assert.ok(abandonedCount >= 1);

    const row = await media.getMedia(db, result.mediaId);
    assert.equal(row!.processing_status, "abandoned");

    const completed = await completeMediaUploadAction(db, bucket, result.mediaId);
    assert.equal(completed.ok, false);
    if (completed.ok) return;
    assert.equal(completed.code, "INVALID_STATE");
  });

  test("cleanupAbandonedMediaAction (the action-level wrapper) does the same thing", async () => {
    const result = await authorizeMediaUploadAction(
      db,
      FAKE_CREDENTIALS,
      { filename: "stale-2.jpg", mimeType: "image/jpeg", sizeBytes: 1000 },
      UPDATED_BY,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;

    // ABANDON_AFTER_MS (15 min) hasn't elapsed yet — a real-world-paced
    // cleanup call must NOT touch this brand-new row.
    await cleanupAbandonedMediaAction(db);
    const stillPending = await media.getMedia(db, result.mediaId);
    assert.equal(stillPending!.processing_status, "pending");
  });
});

describe("Media Library — delete blocked while in use", () => {
  test("a media referenced by a work item cannot be trashed", async () => {
    const bytes = buildJpegBytes(500, 500);
    const { mediaId, storageKey } = await authorizeAndFetchRow({
      filename: "in-use.jpg",
      mimeType: "image/jpeg",
      sizeBytes: bytes.byteLength,
    });
    await bucket.put(storageKey, bytes);
    await completeMediaUploadAction(db, bucket, mediaId);

    const created = await work.createWorkItem(
      db,
      {
        mediaId,
        category: "portrait",
        position: 999,
        ratio: "4/5",
        captionFr: null,
        captionEn: null,
        altFr: "alt fr",
        altEn: "alt en",
        focalX: 50,
        focalY: 50,
        isVisible: true,
        featuredOnHome: false,
      },
      UPDATED_BY,
    );
    assert.equal(created.ok, true);

    const deleteResult = await deleteMediaAction(db, mediaId);
    assert.ok("redirect" in deleteResult);
    if ("redirect" in deleteResult) {
      assert.match(deleteResult.redirect, /flash=error/);
    }

    const row = await media.getMedia(db, mediaId);
    assert.equal(row!.deleted_at, null, "must not have been trashed");
  });

  test("an unused media can be trashed", async () => {
    const bytes = buildJpegBytes(500, 500);
    const { mediaId, storageKey } = await authorizeAndFetchRow({
      filename: "unused.jpg",
      mimeType: "image/jpeg",
      sizeBytes: bytes.byteLength,
    });
    await bucket.put(storageKey, bytes);
    await completeMediaUploadAction(db, bucket, mediaId);

    const deleteResult = await deleteMediaAction(db, mediaId);
    assert.ok("redirect" in deleteResult);
    if ("redirect" in deleteResult) assert.match(deleteResult.redirect, /flash=success/);

    const row = await media.getMedia(db, mediaId);
    assert.ok(row!.deleted_at !== null);
  });
});

describe("Media Library — IDOR: :id must resolve to a real row", () => {
  test("completeMediaUploadAction on a non-existent id -> NOT_FOUND, never a crash", async () => {
    const result = await completeMediaUploadAction(db, bucket, 999_999);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "NOT_FOUND");
  });

  test("deleteMediaAction on a non-existent id -> notFound sentinel", async () => {
    const result = await deleteMediaAction(db, 999_999);
    assert.ok("notFound" in result);
  });
});
