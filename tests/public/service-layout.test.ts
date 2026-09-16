/**
 * Services CMS — pure tests for the ADR-014 frontend-owned slug -> layout
 * correspondence (src/lib/service-layout.ts). No D1.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveServiceLayout } from "../../src/lib/service-layout";

describe("resolveServiceLayout", () => {
  test("the 3 known MVP slugs resolve to their established, visually distinct layouts", () => {
    assert.equal(resolveServiceLayout("weddings", 0), "wide-offset");
    assert.equal(resolveServiceLayout("portraits", 1), "split");
    assert.equal(resolveServiceLayout("events", 2), "text-image");
  });

  test("an unknown slug (a service created beyond the initial 3) still resolves deterministically, never crashes", () => {
    const layout = resolveServiceLayout("boudoir-session", 3);
    assert.ok(["wide-offset", "split", "text-image"].includes(layout));
  });

  test("unknown slugs cycle through the 3 variants by index — real variety, not one repeated layout for every extra service", () => {
    assert.equal(resolveServiceLayout("a", 0), "wide-offset");
    assert.equal(resolveServiceLayout("b", 1), "split");
    assert.equal(resolveServiceLayout("c", 2), "text-image");
    assert.equal(resolveServiceLayout("d", 3), "wide-offset");
  });

  test("layout is never CMS-editable content — same slug always resolves to the same layout regardless of index (only unknown-slug fallback uses index)", () => {
    assert.equal(resolveServiceLayout("weddings", 5), "wide-offset");
    assert.equal(resolveServiceLayout("weddings", 0), "wide-offset");
  });
});
