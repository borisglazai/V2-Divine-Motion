/**
 * Presigned R2 upload URL generation (Implementation Brief 014 §8, ADR-017).
 *
 * The native Worker `R2Bucket` binding (`env.MEDIA`) has no API for
 * generating a browser-usable upload URL — it's server-side only. R2's
 * S3-compatible API is Cloudflare's documented way to get one, so the
 * browser can `PUT` the object directly without the Worker ever proxying
 * the bytes (§39). Signing uses `aws4fetch`, a small SigV4 implementation —
 * never custom crypto (§8's explicit instruction).
 *
 * Pure/testable: takes credentials as explicit parameters, no
 * `cloudflare:workers` import (mirrors `src/lib/db/media.ts` taking `db` as
 * a parameter rather than importing it) — see `src/lib/storage/env.ts` for
 * the one place that reads the real bindings/secrets.
 */

import { AwsClient } from "aws4fetch";

export interface R2Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export interface PresignedUpload {
  url: string;
  expiresAt: number;
}

function r2Endpoint(credentials: R2Credentials, storageKey: string): string {
  const encodedKey = storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://${credentials.accountId}.r2.cloudflarestorage.com/${credentials.bucketName}/${encodedKey}`;
}

/**
 * Returns a short-lived, query-string-signed PUT URL for `storageKey`. No
 * headers are included in the signature (deliberately, not an oversight):
 * binding the signature to a client-declared `Content-Type` would only
 * re-introduce trust in a value the server independently re-verifies from
 * the real bytes after upload anyway (§21/§22) — keeping the signed surface
 * to method + path + expiry is simpler and just as safe here.
 */
export async function createPresignedUploadUrl(
  credentials: R2Credentials,
  storageKey: string,
  expirySeconds: number,
): Promise<PresignedUpload> {
  const client = new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service: "s3",
    region: "auto",
  });

  const url = new URL(r2Endpoint(credentials, storageKey));
  url.searchParams.set("X-Amz-Expires", String(expirySeconds));

  const signedRequest = await client.sign(url.toString(), {
    method: "PUT",
    aws: { signQuery: true },
  });

  return {
    url: signedRequest.url,
    expiresAt: Date.now() + expirySeconds * 1000,
  };
}
