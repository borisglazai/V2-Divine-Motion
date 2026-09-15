export type Locale = "fr" | "en";

export type PageId =
  | "home"
  | "work"
  | "services"
  | "about"
  | "contact"
  | "privacy";

interface RouteEntry {
  id: PageId;
  fr: string;
  en: string;
}

/**
 * FR and EN slugs are different words (travail vs work, a-propos vs about,
 * confidentialite vs privacy), so Astro's built-in i18n routing (which
 * assumes a shared slug per locale) doesn't fit. This explicit table is the
 * single source of truth for path <-> page id <-> locale, used by the
 * language switcher and by each page to build its hreflang alternates.
 */
export const routes: RouteEntry[] = [
  { id: "home", fr: "/", en: "/en" },
  { id: "work", fr: "/travail", en: "/en/work" },
  { id: "services", fr: "/services", en: "/en/services" },
  { id: "about", fr: "/a-propos", en: "/en/about" },
  { id: "contact", fr: "/contact", en: "/en/contact" },
  { id: "privacy", fr: "/confidentialite", en: "/en/privacy" },
];

export function getPath(id: PageId, locale: Locale): string {
  const entry = routes.find((r) => r.id === id);
  if (!entry) throw new Error(`Unknown page id: ${id}`);
  return entry[locale];
}

/** Given the current page id, return the path of its equivalent in the other locale. */
export function getAlternatePath(id: PageId, currentLocale: Locale): string {
  const targetLocale: Locale = currentLocale === "fr" ? "en" : "fr";
  return getPath(id, targetLocale);
}

export function getAllPathsFor(id: PageId): { fr: string; en: string } {
  const entry = routes.find((r) => r.id === id);
  if (!entry) throw new Error(`Unknown page id: ${id}`);
  return { fr: entry.fr, en: entry.en };
}
