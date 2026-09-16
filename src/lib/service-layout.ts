/**
 * Services CMS — the frontend-owned `slug -> layout` correspondence
 * ADR-014 calls for ("Toute page consommant `services` doit résoudre la
 * présentation via une correspondance frontend `slug → layout`"). Layout
 * is never CMS-editable content and never lives in D1 — see
 * src/lib/work-gallery-adapter.ts for the equivalent decision on Travail
 * (there, computed from ratio; here, from a stable identifier instead,
 * per ADR-014's own distinction between the two entities).
 */
export type ServiceLayout = "wide-offset" | "split" | "text-image";

/** The 3 known MVP services — same slugs as the pre-CMS mock (src/data/mock/services.ts) and seeds/local.sql, kept for visual continuity. */
const KNOWN_LAYOUTS: Record<string, ServiceLayout> = {
  weddings: "wide-offset",
  portraits: "split",
  events: "text-image",
};

const FALLBACK_CYCLE: readonly ServiceLayout[] = ["wide-offset", "split", "text-image"];

/**
 * Resolves a layout for any slug, known or not — the CMS is generic
 * (services beyond the initial 3 can be created), so a service with an
 * unrecognized slug still gets a deliberate, deterministic layout instead
 * of crashing or defaulting to one variant for everything. `index` is the
 * service's position among the ones being rendered (0-based).
 */
export function resolveServiceLayout(slug: string, index: number): ServiceLayout {
  return KNOWN_LAYOUTS[slug] ?? FALLBACK_CYCLE[index % FALLBACK_CYCLE.length];
}
