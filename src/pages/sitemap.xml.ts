import type { APIRoute } from "astro";
import { routes } from "@/i18n/routes";

export const prerender = true;

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]!);
}

export const GET: APIRoute = ({ site }) => {
  const origin = site?.toString().replace(/\/$/, "") ?? "https://divinemotion.ca";
  const urls = routes.flatMap(({ fr, en }) => [
    { path: fr, locale: "fr", alternatePath: en, alternateLocale: "en" },
    { path: en, locale: "en", alternatePath: fr, alternateLocale: "fr" },
  ]).map(({ path, locale, alternatePath, alternateLocale }) => `  <url>
    <loc>${escapeXml(`${origin}${path}`)}</loc>
    <xhtml:link rel="alternate" hreflang="${locale}" href="${escapeXml(`${origin}${path}`)}" />
    <xhtml:link rel="alternate" hreflang="${alternateLocale}" href="${escapeXml(`${origin}${alternatePath}`)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${origin}${locale === "fr" ? path : alternatePath}`)}" />
  </url>`);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
