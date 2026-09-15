/**
 * Unit tests for real image format/dimension detection (Brief 014
 * §12/§22). Pure, no I/O — builds minimal valid/invalid byte buffers by
 * hand rather than reading fixture files, so these run anywhere with no
 * setup.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  detectImageFormat,
  inspectImage,
  parseJpegDimensions,
  parsePngDimensions,
} from "../../src/lib/storage/image-inspect";

function buildPngBuffer(width: number, height: number, options: { chunkType?: string } = {}): Uint8Array {
  const buf = new Uint8Array(33);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(buf.buffer);
  view.setUint32(8, 13, false);
  const chunkType = options.chunkType ?? "IHDR";
  for (let i = 0; i < 4; i++) buf[12 + i] = chunkType.charCodeAt(i);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  buf[24] = 8; // bit depth
  buf[25] = 6; // color type (RGBA)
  return buf;
}

function buildJpegBuffer(width: number, height: number, options: { withApp0?: boolean } = {}): Uint8Array {
  const bytes: number[] = [0xff, 0xd8]; // SOI
  if (options.withApp0) {
    // APP0/JFIF segment the parser must skip over to reach SOF0.
    bytes.push(0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0));
  }
  bytes.push(0xff, 0xc0); // SOF0
  bytes.push(0x00, 0x11); // segment length = 17
  bytes.push(0x08); // precision
  bytes.push((height >> 8) & 0xff, height & 0xff);
  bytes.push((width >> 8) & 0xff, width & 0xff);
  bytes.push(0x03); // numComponents
  bytes.push(0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01);
  bytes.push(0xff, 0xd9); // EOI
  return new Uint8Array(bytes);
}

describe("detectImageFormat", () => {
  test("identifies PNG by magic bytes", () => {
    assert.equal(detectImageFormat(buildPngBuffer(100, 50)), "image/png");
  });

  test("identifies JPEG by magic bytes", () => {
    assert.equal(detectImageFormat(buildJpegBuffer(100, 50)), "image/jpeg");
  });

  test("returns null for non-image bytes — never trusts a declared Content-Type", () => {
    assert.equal(detectImageFormat(new TextEncoder().encode("not an image, just text data here")), null);
  });

  test("returns null for an empty buffer", () => {
    assert.equal(detectImageFormat(new Uint8Array(0)), null);
  });
});

describe("parsePngDimensions", () => {
  test("reads real width/height from IHDR", () => {
    const dims = parsePngDimensions(buildPngBuffer(6000, 4000));
    assert.deepEqual(dims, { width: 6000, height: 4000 });
  });

  test("rejects a truncated PNG (magic bytes only)", () => {
    assert.equal(parsePngDimensions(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), null);
  });

  test("rejects a PNG whose first chunk isn't IHDR", () => {
    assert.equal(parsePngDimensions(buildPngBuffer(100, 50, { chunkType: "IDAT" })), null);
  });

  test("rejects zero width/height", () => {
    assert.equal(parsePngDimensions(buildPngBuffer(0, 50)), null);
  });
});

describe("parseJpegDimensions", () => {
  test("reads real width/height from the SOF0 segment", () => {
    assert.deepEqual(parseJpegDimensions(buildJpegBuffer(6000, 4000)), { width: 6000, height: 4000 });
  });

  test("skips preceding marker segments (APP0/JFIF) to find SOF0", () => {
    assert.deepEqual(parseJpegDimensions(buildJpegBuffer(800, 600, { withApp0: true })), { width: 800, height: 600 });
  });

  test("rejects bytes that don't start with the JPEG SOI marker", () => {
    assert.equal(parseJpegDimensions(new Uint8Array([0x00, 0x00, 0xff, 0xc0])), null);
  });

  test("rejects a truncated JPEG (SOI only)", () => {
    assert.equal(parseJpegDimensions(new Uint8Array([0xff, 0xd8])), null);
  });

  test("rejects a JPEG that reaches EOI without any SOF segment", () => {
    assert.equal(parseJpegDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), null);
  });
});

describe("inspectImage", () => {
  test("returns mimeType + real dimensions for a valid PNG", () => {
    assert.deepEqual(inspectImage(buildPngBuffer(1920, 1080)), {
      mimeType: "image/png",
      width: 1920,
      height: 1080,
    });
  });

  test("returns mimeType + real dimensions for a valid JPEG", () => {
    assert.deepEqual(inspectImage(buildJpegBuffer(1920, 1080)), {
      mimeType: "image/jpeg",
      width: 1920,
      height: 1080,
    });
  });

  test("rejects a corrupt/unsupported file — never throws", () => {
    assert.doesNotThrow(() => inspectImage(new Uint8Array([1, 2, 3, 4, 5])));
    assert.equal(inspectImage(new Uint8Array([1, 2, 3, 4, 5])), null);
  });

  test("rejects a PNG with a mangled IHDR even though the magic bytes are real (simulated corruption)", () => {
    const buf = buildPngBuffer(100, 50);
    buf[12] = 0x00; // corrupt the "IHDR" chunk type marker
    assert.equal(inspectImage(buf), null);
  });
});
