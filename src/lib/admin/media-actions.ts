/**
 * Media Library mutation logic (Implementation Brief 014), same convention
 * as `src/lib/admin/work-actions.ts`: takes `db`/`bucket`/`credentials` as
 * explicit parameters instead of importing `src/lib/db/client.ts` or
 * `src/lib/storage/env.ts` directly, so `tests/admin/media-endpoints.test.ts`
 * (not yet written) can call this business logic directly under plain
 * `node --test` against a Miniflare-backed D1 + R2, with no real Cloudflare
 * account involved.
 *
 * Two shapes of result here, matching the two shapes of caller (§19/§20 vs.
 * §28-34):
 *   - `authorizeMediaUploadAction`/`completeMediaUploadAction` return plain
 *     typed JSON-serializable objects — their endpoints are the small-file,
 *     JSON API the multi-upload client module talks to (never a redirect).
 *   - Everything else (metadata edit, delete, restore) follows the
 *     `work-actions.ts` POST -> redirect -> GET + flash pattern, since
 *     those are regular admin form submissions from the media detail page.
 */
import {
  getMedia,
  createMediaMetadata,
  markMediaUploaded,
  markMediaReady,
  markMediaFailed,
  updateMediaMetadata as saveMediaMetadata,
  softDeleteMedia,
  restoreMedia,
  abandonStalePendingMedia,
} from "@/lib/db/media";
import type { MediaRow, DbErrorCode } from "@/lib/db/types";
import {
  authorizeMediaUpload,
  headMediaObject,
  validateMediaObject,
  type MediaValidationFailureReason,
  type R2Credentials,
} from "@/lib/storage/media-storage";
import { adminErrorMessage } from "./errors";
import { withFlash } from "./flash";

export type { R2Credentials } from "@/lib/storage/media-storage";

// ---------------------------------------------------------------------------
// Limits (Brief 014 §11/§17/§18) — documented here, the one place both the
// authorize action and (indirectly, via ADR-017) the abandon cleanup read
// them from.
// ---------------------------------------------------------------------------

/** MVP MIME allowlist (§10) — JPEG and PNG only, no SVG, no WebP (no clear justification found for this lot). */
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

/**
 * 50 MB (§11: "pas arbitrairement trop bas... plusieurs dizaines de Mo si
 * besoin"). Comfortably covers a light JPEG/PNG export of a ~24MP photo
 * (typically a few MB to low tens of MB even at high quality) without
 * accepting arbitrarily large uploads.
 */
export const MAX_MEDIA_UPLOAD_BYTES = 50 * 1024 * 1024;

/** 15 minutes (§17: "courte durée, exemple 10-15 minutes"). See ADR-017. */
export const UPLOAD_URL_EXPIRY_SECONDS = 15 * 60;

/** A `pending` row older than this is stale (§18) — same window as the presigned URL's own expiry: once that URL is dead, the row can never leave `pending` the honest way. */
export const ABANDON_AFTER_MS = UPLOAD_URL_EXPIRY_SECONDS * 1000;

// ---------------------------------------------------------------------------
// Authorize (§19) — POST /admin/media/upload/authorize
// ---------------------------------------------------------------------------

export interface AuthorizeUploadInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export type MediaUploadErrorCode =
  | "STORAGE_NOT_CONFIGURED"
  | "UNSUPPORTED_MIME_TYPE"
  | "INVALID_SIZE"
  | "OBJECT_NOT_FOUND"
  | MediaValidationFailureReason
  | DbErrorCode;

export type AuthorizeUploadResult =
  | { ok: true; mediaId: number; uploadUrl: string; expiresAt: number }
  | { ok: false; status: number; code: MediaUploadErrorCode; message: string };

/** Server-side truncation of the client-supplied filename — metadata only (§64), never part of the storage key, so a long/odd value is harmless beyond display. */
function sanitizeFilename(filename: string): string | null {
  const trimmed = filename.trim().slice(0, 255);
  return trimmed === "" ? null : trimmed;
}

export async function authorizeMediaUploadAction(
  db: D1Database,
  credentials: R2Credentials | null,
  input: AuthorizeUploadInput,
  createdBy: string | null,
): Promise<AuthorizeUploadResult> {
  if (!credentials) {
    return {
      ok: false,
      status: 503,
      code: "STORAGE_NOT_CONFIGURED",
      message: "R2 upload storage isn't configured yet.",
    };
  }

  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    return {
      ok: false,
      status: 422,
      code: "UNSUPPORTED_MIME_TYPE",
      message: "Only JPEG and PNG images are accepted.",
    };
  }

  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_MEDIA_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 422,
      code: "INVALID_SIZE",
      message: `File size must be between 1 byte and ${MAX_MEDIA_UPLOAD_BYTES} bytes.`,
    };
  }

  const authorized = await authorizeMediaUpload(credentials, input.mimeType, UPLOAD_URL_EXPIRY_SECONDS);
  if (!authorized) {
    return {
      ok: false,
      status: 422,
      code: "UNSUPPORTED_MIME_TYPE",
      message: "Only JPEG and PNG images are accepted.",
    };
  }

  const created = await createMediaMetadata(
    db,
    {
      storageKey: authorized.storageKey,
      originalFilename: sanitizeFilename(input.filename) ?? undefined,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    },
    createdBy ?? undefined,
  );
  if (!created.ok) {
    return { ok: false, status: 400, code: created.error.code, message: created.error.message };
  }

  return { ok: true, mediaId: created.data.id, uploadUrl: authorized.uploadUrl, expiresAt: authorized.expiresAt };
}

// ---------------------------------------------------------------------------
// Upload complete (§20-22) — POST /admin/media/:id/upload-complete
// ---------------------------------------------------------------------------

export type CompleteUploadResult =
  | { ok: true; media: MediaRow }
  | { ok: false; status: number; code: MediaUploadErrorCode; message: string };

function validationFailureMessage(reason: MediaValidationFailureReason): string {
  switch (reason) {
    case "OBJECT_NOT_FOUND":
      return "No file was found at the expected location.";
    case "SIZE_MISMATCH":
      return "The uploaded file size doesn't match what was declared.";
    case "CORRUPT_OR_UNSUPPORTED":
      return "The uploaded file isn't a valid JPEG or PNG image.";
    case "MIME_MISMATCH":
      return "The uploaded file's real format doesn't match the declared type.";
  }
}

/**
 * Never trusts the browser (§21): re-derives everything that matters —
 * object presence, real size, real format, real dimensions — from R2
 * itself. `mediaId` is checked against a real row before anything else
 * (§41 IDOR discipline).
 */
export async function completeMediaUploadAction(
  db: D1Database,
  bucket: R2Bucket,
  mediaId: number,
): Promise<CompleteUploadResult> {
  const row = await getMedia(db, mediaId);
  if (!row) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Media not found." };
  }
  if (row.processing_status !== "pending") {
    return {
      ok: false,
      status: 409,
      code: "INVALID_STATE",
      message: "This upload has already been processed.",
    };
  }

  const head = await headMediaObject(bucket, row.storage_key);
  if (!head.exists) {
    await markMediaFailed(db, mediaId);
    return {
      ok: false,
      status: 422,
      code: "OBJECT_NOT_FOUND",
      message: "No file was found at the expected location.",
    };
  }

  const uploaded = await markMediaUploaded(db, mediaId);
  if (!uploaded.ok) {
    return { ok: false, status: 409, code: uploaded.error.code, message: uploaded.error.message };
  }

  const validation = await validateMediaObject(bucket, row.storage_key, row.mime_type, row.size_bytes);
  if (!validation.ok) {
    await markMediaFailed(db, mediaId);
    return { ok: false, status: 422, code: validation.reason, message: validationFailureMessage(validation.reason) };
  }

  const ready = await markMediaReady(db, mediaId, { width: validation.width, height: validation.height });
  if (!ready.ok) {
    return { ok: false, status: 409, code: ready.error.code, message: ready.error.message };
  }

  const updated = await getMedia(db, mediaId);
  if (!updated) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Media not found." };
  }
  return { ok: true, media: updated };
}

// ---------------------------------------------------------------------------
// Metadata edit / delete / restore (§28-34) — regular admin form
// submissions, same POST -> redirect -> GET + flash pattern as
// work-actions.ts.
// ---------------------------------------------------------------------------

export type MediaActionResult = { redirect: string } | { notFound: true };

export interface MediaFormErrors {
  [field: string]: string;
}

export interface ParsedMediaMetadataForm {
  altFr: string | null;
  altEn: string | null;
  focalX: number;
  focalY: number;
  publicationRightsConfirmed: boolean;
  publicationRightsNote: string | null;
}

const MEDIA_FORM_FIELDS = ["altFr", "altEn", "focalX", "focalY", "publicationRightsNote"] as const;

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** No HTML-only validation (same reasoning as `validation.ts`'s header comment): focal X/Y are re-checked here, not just trusted from `min`/`max` input attributes (§30). */
export function parseMediaMetadataForm(
  formData: FormData,
): { ok: true; data: ParsedMediaMetadataForm } | { ok: false; errors: MediaFormErrors } {
  const errors: MediaFormErrors = {};

  const altFrRaw = stringField(formData, "altFr");
  const altEnRaw = stringField(formData, "altEn");

  const focalXRaw = stringField(formData, "focalX");
  const focalX = focalXRaw === "" ? 50 : Number(focalXRaw);
  if (!Number.isFinite(focalX) || focalX < 0 || focalX > 100) {
    errors.focalX = "Le point focal horizontal doit être entre 0 et 100.";
  }

  const focalYRaw = stringField(formData, "focalY");
  const focalY = focalYRaw === "" ? 50 : Number(focalYRaw);
  if (!Number.isFinite(focalY) || focalY < 0 || focalY > 100) {
    errors.focalY = "Le point focal vertical doit être entre 0 et 100.";
  }

  // §31: an admin may leave a media unrighted (draft/non-public use) —
  // confirming publication rights here is optional, never required to save.
  const publicationRightsConfirmed = formData.get("publicationRightsConfirmed") === "on";
  const publicationRightsNoteRaw = stringField(formData, "publicationRightsNote");

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      altFr: altFrRaw === "" ? null : altFrRaw,
      altEn: altEnRaw === "" ? null : altEnRaw,
      focalX,
      focalY,
      publicationRightsConfirmed,
      publicationRightsNote: publicationRightsNoteRaw === "" ? null : publicationRightsNoteRaw,
    },
  };
}

function buildMediaFormRedirect(basePath: string, errors: MediaFormErrors, formData: FormData): string {
  const url = new URL(basePath, "https://placeholder.local");
  for (const [field, message] of Object.entries(errors)) {
    url.searchParams.set(`error_${field}`, message);
  }
  for (const field of MEDIA_FORM_FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string" && value !== "") url.searchParams.set(`value_${field}`, value);
  }
  return url.pathname + url.search;
}

export function readMediaFormRedirect(url: URL): { errors: MediaFormErrors; values: Record<string, string> } {
  const errors: MediaFormErrors = {};
  const values: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key.startsWith("error_")) errors[key.slice("error_".length)] = value;
    if (key.startsWith("value_")) values[key.slice("value_".length)] = value;
  }
  return { errors, values };
}

export async function updateMediaMetadataAction(
  db: D1Database,
  id: number,
  formData: FormData,
  updatedBy: string,
): Promise<MediaActionResult> {
  const row = await getMedia(db, id);
  if (!row) return { notFound: true };

  const parsed = parseMediaMetadataForm(formData);
  if (!parsed.ok) {
    return { redirect: buildMediaFormRedirect(`/admin/media/${id}`, parsed.errors, formData) };
  }

  const result = await saveMediaMetadata(db, id, parsed.data, updatedBy);
  if (!result.ok) {
    return { redirect: withFlash(`/admin/media/${id}`, "error", adminErrorMessage(result.error)) };
  }

  return { redirect: withFlash(`/admin/media/${id}`, "success", "Média mis à jour.") };
}

export async function deleteMediaAction(db: D1Database, id: number): Promise<MediaActionResult> {
  const row = await getMedia(db, id);
  if (!row) return { notFound: true };

  const result = await softDeleteMedia(db, id);
  if (!result.ok) {
    return { redirect: withFlash(`/admin/media/${id}`, "error", adminErrorMessage(result.error)) };
  }
  return { redirect: withFlash("/admin/media", "success", "Média mis à la corbeille.") };
}

export async function restoreMediaAction(db: D1Database, id: number): Promise<MediaActionResult> {
  const row = await getMedia(db, id);
  if (!row) return { notFound: true };

  const result = await restoreMedia(db, id);
  if (!result.ok) {
    return { redirect: withFlash(`/admin/media/${id}`, "error", adminErrorMessage(result.error)) };
  }
  return { redirect: withFlash(`/admin/media/${id}`, "success", "Média restauré.") };
}

/** Callable manually or opportunistically (e.g. before rendering the library list) — no Cron Trigger in this brief (§18). */
export async function cleanupAbandonedMediaAction(db: D1Database): Promise<number> {
  return abandonStalePendingMedia(db, ABANDON_AFTER_MS);
}
