/**
 * R2 storage composition layer (Implementation Brief 014 §60): key
 * generation, signed upload authorization, head/get, and post-upload object
 * validation. No generic storage framework — just the handful of operations
 * `src/lib/admin/media-actions.ts` (not yet written) needs, each taking
 * `bucket`/`credentials` as explicit parameters (never importing
 * `./env.ts`) so this stays testable under plain Node against a
 * Miniflare-backed R2 bucket.
 *
 * This file never touches D1 — `src/lib/db/media.ts` owns metadata,
 * `media-actions.ts` composes the two.
 */
import { generateMediaStorageKey } from "./keys";
import { createPresignedUploadUrl, type R2Credentials } from "./r2-presign";
import { inspectImage, type InspectedImage } from "./image-inspect";

export type { R2Credentials } from "./r2-presign";

export interface AuthorizedMediaUpload {
  storageKey: string;
  uploadUrl: string;
  expiresAt: number;
}

/**
 * Generates a fresh, server-chosen storage key and a short-lived presigned
 * PUT URL for it. Returns `null` only if `mimeType` isn't one this project
 * accepts — callers should already have validated that before reaching
 * here (§10/§19), so this is a defensive second check, not the primary one.
 */
export async function authorizeMediaUpload(
  credentials: R2Credentials,
  mimeType: string,
  expirySeconds: number,
): Promise<AuthorizedMediaUpload | null> {
  const storageKey = generateMediaStorageKey(mimeType);
  if (!storageKey) return null;
  const presigned = await createPresignedUploadUrl(credentials, storageKey, expirySeconds);
  return { storageKey, uploadUrl: presigned.url, expiresAt: presigned.expiresAt };
}

export interface MediaObjectHead {
  exists: boolean;
  sizeBytes: number | null;
}

/** A HEAD-equivalent check — confirms presence/size without downloading the object (used by the `pending -> uploaded` step). */
export async function headMediaObject(bucket: R2Bucket, storageKey: string): Promise<MediaObjectHead> {
  const head = await bucket.head(storageKey);
  if (!head) return { exists: false, sizeBytes: null };
  return { exists: true, sizeBytes: head.size };
}

export type MediaValidationFailureReason = "OBJECT_NOT_FOUND" | "SIZE_MISMATCH" | "CORRUPT_OR_UNSUPPORTED" | "MIME_MISMATCH";

export type MediaValidationResult =
  | ({ ok: true; sizeBytes: number } & InspectedImage)
  | { ok: false; sizeBytes: number; reason: MediaValidationFailureReason };

/**
 * The `uploaded -> ready`/`failed` step (§20-22): downloads the real
 * object, compares its real size to what the client declared at authorize
 * time, then inspects its real bytes for format + dimensions. Never trusts
 * `declaredMimeType`/`declaredSizeBytes` beyond using them as the values to
 * check the real object against.
 */
export async function validateMediaObject(
  bucket: R2Bucket,
  storageKey: string,
  declaredMimeType: string,
  declaredSizeBytes: number,
): Promise<MediaValidationResult> {
  const object = await bucket.get(storageKey);
  if (!object) {
    return { ok: false, sizeBytes: 0, reason: "OBJECT_NOT_FOUND" };
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== declaredSizeBytes) {
    return { ok: false, sizeBytes: bytes.byteLength, reason: "SIZE_MISMATCH" };
  }
  const inspected = inspectImage(bytes);
  if (!inspected) {
    return { ok: false, sizeBytes: bytes.byteLength, reason: "CORRUPT_OR_UNSUPPORTED" };
  }
  if (inspected.mimeType !== declaredMimeType) {
    return { ok: false, sizeBytes: bytes.byteLength, reason: "MIME_MISMATCH" };
  }
  return { ok: true, sizeBytes: bytes.byteLength, ...inspected };
}

/** Streams the real object bytes back out, for the admin-only preview route (§37-38) — never used for the upload path itself. */
export async function readMediaObject(bucket: R2Bucket, storageKey: string): Promise<R2ObjectBody | null> {
  return bucket.get(storageKey);
}
