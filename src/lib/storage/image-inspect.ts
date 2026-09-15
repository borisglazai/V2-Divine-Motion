/**
 * Real image format/dimension detection (Implementation Brief 014 §12/§22) —
 * pure, no I/O, no `cloudflare:workers` import. Used by the `/upload-complete`
 * verification flow (not yet written) to decide `uploaded -> ready` vs.
 * `uploaded -> failed`: never trust the browser-declared MIME type or
 * dimensions (§21) — read the real bytes instead.
 *
 * Deliberately narrow: only the two MIME types this project accepts
 * (`image/jpeg`, `image/png` — see `keys.ts`). No SVG, no WebP, no video.
 */

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface InspectedImage extends ImageDimensions {
  mimeType: "image/jpeg" | "image/png";
}

function matchesMagic(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

/**
 * Identifies the real format from file-signature (magic byte) inspection —
 * never from the client-supplied `Content-Type`/filename extension (§22).
 */
export function detectImageFormat(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (matchesMagic(bytes, PNG_MAGIC)) return "image/png";
  if (matchesMagic(bytes, JPEG_MAGIC)) return "image/jpeg";
  return null;
}

/** Reads the IHDR chunk's width/height (bytes 16-23, big-endian) — fixed offset, no scanning needed for PNG. */
export function parsePngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24 || !matchesMagic(bytes, PNG_MAGIC)) return null;
  const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunkType !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

function isJpegSofMarker(marker: number): boolean {
  // SOFx markers (0xC0-0xCF) except DHT (0xC4), JPG ext (0xC8), DAC (0xCC) —
  // those share the numeric range but aren't Start-Of-Frame segments.
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * JPEG has no fixed dimension offset — width/height live inside whichever
 * SOFx marker segment the encoder used, reached by walking the marker chain
 * from the start of the file. Returns null on any malformed/truncated input
 * rather than throwing, so callers can map straight to `markMediaFailed`.
 */
export function parseJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, false) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    // Legal padding: a marker may be preceded by any number of extra 0xFF fill bytes.
    let markerOffset = offset;
    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) markerOffset++;
    if (markerOffset >= bytes.length) return null;
    const marker = bytes[markerOffset];
    offset = markerOffset + 1;

    // Markers with no payload: TEM (0x01) and the restart markers (0xD0-0xD7).
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9) return null; // EOI reached without a SOF segment

    if (offset + 1 >= bytes.length) return null;
    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2) return null;

    if (isJpegSofMarker(marker)) {
      // Payload: 1 byte precision, 2 bytes height, 2 bytes width, ...
      if (offset + 6 >= bytes.length) return null;
      const height = view.getUint16(offset + 3, false);
      const width = view.getUint16(offset + 5, false);
      if (width === 0 || height === 0) return null;
      return { width, height };
    }

    offset += segmentLength;
  }
  return null;
}

/**
 * Detects the real format and parses its real dimensions in one call. Null
 * means "reject as corrupt/unsupported" — the caller (media-actions.ts, not
 * yet written) maps that to `markMediaFailed`.
 */
export function inspectImage(bytes: Uint8Array): InspectedImage | null {
  const format = detectImageFormat(bytes);
  if (!format) return null;
  const dimensions = format === "image/png" ? parsePngDimensions(bytes) : parseJpegDimensions(bytes);
  if (!dimensions) return null;
  return { mimeType: format, ...dimensions };
}
