/**
 * Temporary stand-ins only — NOT Divine Motion photography. These are
 * abstract dark-toned graphics (not stock photos passed off as real),
 * used so the homepage layout, rhythm and crops can be judged before
 * real assets are supplied (Implementation Brief 002, section 4).
 *
 * When real photos arrive: replace the files this module points to (or
 * point these keys at the new paths) — nothing in src/data/mock or
 * HomeView.astro needs to change.
 */
export const placeholderPhotos = {
  a: "/mock/ph-a.svg",
  b: "/mock/ph-b.svg",
  c: "/mock/ph-c.svg",
  d: "/mock/ph-d.svg",
  e: "/mock/ph-e.svg",
} as const;

export type PlaceholderPhotoKey = keyof typeof placeholderPhotos;
