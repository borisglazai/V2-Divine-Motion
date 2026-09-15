/**
 * Unit tests for presigned R2 upload URL generation (Brief 014 §8, ADR-017).
 * Pure — signs against fake credentials, never touches a real R2 endpoint
 * (aws4fetch's `sign()` needs no network to build a query-string-signed
 * URL, it just uses SubtleCrypto).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createPresignedUploadUrl, type R2Credentials } from "../../src/lib/storage/r2-presign";

const CREDENTIALS: R2Credentials = {
  accountId: "test-account-id",
  accessKeyId: "test-access-key-id",
  secretAccessKey: "test-secret-access-key",
  bucketName: "test-bucket",
};

describe("createPresignedUploadUrl", () => {
  test("targets the right R2 S3 endpoint, bucket and key", async () => {
    const result = await createPresignedUploadUrl(CREDENTIALS, "media/abc-123/original.jpg", 900);
    const url = new URL(result.url);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "test-account-id.r2.cloudflarestorage.com");
    assert.equal(url.pathname, "/test-bucket/media/abc-123/original.jpg");
  });

  test("is a query-string-signed AWS SigV4 URL (no custom crypto — real aws4fetch signature params)", async () => {
    const result = await createPresignedUploadUrl(CREDENTIALS, "media/abc-123/original.jpg", 900);
    const url = new URL(result.url);
    assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
    assert.ok(url.searchParams.get("X-Amz-Credential")?.startsWith("test-access-key-id/"));
    assert.ok(url.searchParams.get("X-Amz-Signature"));
    assert.ok(url.searchParams.get("X-Amz-SignedHeaders"));
  });

  test("honors the requested expiry — never the aws4fetch 24h default (ADR-017: 15 minutes)", async () => {
    const result = await createPresignedUploadUrl(CREDENTIALS, "media/abc-123/original.jpg", 900);
    const url = new URL(result.url);
    assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  });

  test("expiresAt reflects the requested expiry, not the library default", async () => {
    const before = Date.now();
    const result = await createPresignedUploadUrl(CREDENTIALS, "media/abc-123/original.jpg", 900);
    const after = Date.now();
    assert.ok(result.expiresAt >= before + 900_000);
    assert.ok(result.expiresAt <= after + 900_000);
  });

  test("URL-encodes each storage key path segment", async () => {
    const result = await createPresignedUploadUrl(CREDENTIALS, "media/has space/original.jpg", 900);
    const url = new URL(result.url);
    assert.equal(url.pathname, "/test-bucket/media/has%20space/original.jpg");
  });

  test("different storage keys produce different signatures", async () => {
    const a = await createPresignedUploadUrl(CREDENTIALS, "media/aaa/original.jpg", 900);
    const b = await createPresignedUploadUrl(CREDENTIALS, "media/bbb/original.jpg", 900);
    const sigA = new URL(a.url).searchParams.get("X-Amz-Signature");
    const sigB = new URL(b.url).searchParams.get("X-Amz-Signature");
    assert.notEqual(sigA, sigB);
  });
});
