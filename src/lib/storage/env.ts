/**
 * The ONE file in src/lib/storage/ allowed to reach for the live R2 binding
 * and S3 API credentials (Implementation Brief 014 §44) — mirrors
 * `src/lib/db/client.ts` and `src/lib/auth/env.ts` exactly: every other
 * function in this directory takes `bucket`/`credentials` as explicit
 * parameters instead of importing this file, so it stays testable under
 * plain Node against Miniflare (see `tests/dal/harness.ts`'s D1 setup for
 * the established pattern this extends to R2).
 */
import { env } from "cloudflare:workers";
import type { R2Credentials } from "./r2-presign";

const PLACEHOLDER_PREFIX = "REPLACE_WITH_";

export function getMediaBucket(): R2Bucket {
  return env.MEDIA;
}

/**
 * Returns the real R2 S3 API credentials, or `null` if any part is missing
 * or still a committed placeholder (see wrangler.toml's "R2 S3 API config"
 * comment) — callers must fail closed on `null` (no presigned URL can be
 * generated), same fail-closed pattern as `getAccessConfig()`.
 */
export function getR2Credentials(): R2Credentials | null {
  const accountId = env.R2_ACCOUNT_ID;
  const bucketName = env.R2_BUCKET_NAME;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) return null;
  if (accountId.startsWith(PLACEHOLDER_PREFIX) || bucketName.startsWith(PLACEHOLDER_PREFIX)) return null;
  return { accountId, bucketName, accessKeyId, secretAccessKey };
}
