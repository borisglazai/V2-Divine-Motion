/**
 * Admin navigation — the arborescence fixed by docs/CMS_SPEC.md
 * ("Dashboard, Modifier le site, Travail, Médias, Services, Témoignages,
 * Contenu, SEO, Paramètres"). Single source of truth for
 * AdminSidebar/AdminMobileNav (the nav itself) and AdminLayout (resolving
 * the current page's title from its pathname) — same shared-table
 * approach as `src/i18n/routes.ts` for the public site.
 */
export type AdminPageId =
  | "dashboard"
  | "site"
  | "work"
  | "media"
  | "services"
  | "testimonials"
  | "content"
  | "seo"
  | "settings";

export interface AdminNavItem {
  id: AdminPageId;
  label: string;
  href: string;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/admin" },
  { id: "site", label: "Modifier le site", href: "/admin/site" },
  { id: "work", label: "Travail", href: "/admin/work" },
  { id: "media", label: "Médias", href: "/admin/media" },
  { id: "services", label: "Services", href: "/admin/services" },
  { id: "testimonials", label: "Témoignages", href: "/admin/testimonials" },
  { id: "content", label: "Contenu", href: "/admin/content" },
  { id: "seo", label: "SEO", href: "/admin/seo" },
  { id: "settings", label: "Paramètres", href: "/admin/settings" },
];
