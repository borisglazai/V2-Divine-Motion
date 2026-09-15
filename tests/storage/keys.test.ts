/**
 * Unit tests for R2 storage key generation (Brief 014 §9). Pure, no I/O.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extensionForMimeType, generateMediaStorageKey } from "../../src/lib/storage/keys";

describe("extensionForMimeType", () => {
  test("maps known MIME types", () => {
    assert.equal(extensionForMimeType("image/jpeg"), "jpg");
    assert.equal(extensionForMimeType("image/png"), "png");
  });

  test("returns null for unsupported MIME types", () => {
    assert.equal(extensionForMimeType("image/webp"), null);
    assert.equal(extensionForMimeType("image/svg+xml"), null);
    assert.equal(extensionForMimeType("video/mp4"), null);
    assert.equal(extensionForMimeType(""), null);
  });
});

describe("generateMediaStorageKey", () => {
  test("matches the media/{uuid}/original.{ext} shape", () => {
    const key = generateMediaStorageKey("image/jpeg");
    assert.ok(key);
    assert.match(
      key!,
      /^media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/original\.jpg$/,
    );
  });

  test("uses the right extension per MIME type", () => {
    assert.match(generateMediaStorageKey("image/png")!, /\/original\.png$/);
  });

  test("returns null for an unsupported MIME type — never falls back to a guess", () => {
    assert.equal(generateMediaStorageKey("image/webp"), null);
  });

  test("never derived from a filename — two calls for the same MIME type never collide", () => {
    const a = generateMediaStorageKey("image/jpeg");
    const b = generateMediaStorageKey("image/jpeg");
    assert.notEqual(a, b);
  });
});
