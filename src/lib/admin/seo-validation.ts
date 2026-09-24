import type { PageKey } from "@/lib/db/types";

const PAGE_KEYS = new Set<PageKey>(["home", "work", "services", "about", "contact", "privacy"]);

export interface SeoFormInput {
  pageKey: PageKey;
  titleFr: string;
  titleEn: string;
  descriptionFr: string;
  descriptionEn: string;
  ogMediaId: number | null;
  canonicalOverride: string | null;
  noindex: boolean;
}

export type SeoFormResult = { ok: true; data: SeoFormInput } | { ok: false; error: string };

export function parseSeoForm(formData: FormData): SeoFormResult {
  const pageKey = String(formData.get("pageKey") ?? "") as PageKey;
  if (!PAGE_KEYS.has(pageKey)) return { ok: false, error: "Page SEO inconnue." };
  const titleFr = String(formData.get("titleFr") ?? "").trim();
  const titleEn = String(formData.get("titleEn") ?? "").trim();
  const descriptionFr = String(formData.get("descriptionFr") ?? "").trim();
  const descriptionEn = String(formData.get("descriptionEn") ?? "").trim();
  if (!titleFr || !titleEn || !descriptionFr || !descriptionEn) return { ok: false, error: "Les titres et descriptions FR/EN sont obligatoires." };
  if (titleFr.length > 70 || titleEn.length > 70) return { ok: false, error: "Un titre SEO ne doit pas dépasser 70 caractères." };
  if (descriptionFr.length > 180 || descriptionEn.length > 180) return { ok: false, error: "Une description SEO ne doit pas dépasser 180 caractères." };
  const mediaRaw = String(formData.get("ogMediaId") ?? "").trim();
  const ogMediaId = mediaRaw ? Number(mediaRaw) : null;
  if (ogMediaId !== null && (!Number.isInteger(ogMediaId) || ogMediaId <= 0)) return { ok: false, error: "Image sociale invalide." };
  const canonicalRaw = String(formData.get("canonicalOverride") ?? "").trim();
  if (canonicalRaw) {
    try {
      const parsed = new URL(canonicalRaw);
      if (parsed.protocol !== "https:") throw new Error("protocol");
    } catch {
      return { ok: false, error: "L’URL canonique doit être une URL HTTPS complète." };
    }
  }
  return { ok: true, data: { pageKey, titleFr, titleEn, descriptionFr, descriptionEn, ogMediaId, canonicalOverride: canonicalRaw || null, noindex: formData.get("noindex") === "1" } };
}
