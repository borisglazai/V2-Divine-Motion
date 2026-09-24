import type { SiteSettingsInput } from "@/lib/db/settings";

export type SettingsFormResult = { ok: true; data: SiteSettingsInput } | { ok: false; error: string };

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function parseSettingsForm(formData: FormData): SettingsFormResult {
  const brandName = value(formData, "brandName");
  const contactEmail = value(formData, "contactEmail");
  const instagramUrl = value(formData, "instagramUrl");
  const instagramHandleLabel = value(formData, "instagramHandleLabel");
  const defaultSeoTitleFr = value(formData, "defaultSeoTitleFr");
  const defaultSeoTitleEn = value(formData, "defaultSeoTitleEn");
  const defaultSeoDescriptionFr = value(formData, "defaultSeoDescriptionFr");
  const defaultSeoDescriptionEn = value(formData, "defaultSeoDescriptionEn");

  if (!brandName || brandName.length > 80) return { ok: false, error: "Le nom de marque est obligatoire et limité à 80 caractères." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { ok: false, error: "L’adresse courriel publique est invalide." };
  try {
    const url = new URL(instagramUrl);
    if (url.protocol !== "https:" || !/(^|\.)instagram\.com$/i.test(url.hostname)) throw new Error("host");
  } catch {
    return { ok: false, error: "L’URL Instagram doit être une adresse HTTPS instagram.com valide." };
  }
  if (!instagramHandleLabel || instagramHandleLabel.length > 50) return { ok: false, error: "Le libellé Instagram est obligatoire et limité à 50 caractères." };
  if (!defaultSeoTitleFr || !defaultSeoTitleEn || defaultSeoTitleFr.length > 70 || defaultSeoTitleEn.length > 70) return { ok: false, error: "Les titres SEO par défaut sont obligatoires et limités à 70 caractères." };
  if (!defaultSeoDescriptionFr || !defaultSeoDescriptionEn || defaultSeoDescriptionFr.length > 180 || defaultSeoDescriptionEn.length > 180) return { ok: false, error: "Les descriptions SEO par défaut sont obligatoires et limitées à 180 caractères." };

  return { ok: true, data: {
    brandName,
    contactEmail,
    instagramUrl,
    instagramHandleLabel,
    serviceAreaFr: value(formData, "serviceAreaFr") || null,
    serviceAreaEn: value(formData, "serviceAreaEn") || null,
    defaultSeoTitleFr,
    defaultSeoTitleEn,
    defaultSeoDescriptionFr,
    defaultSeoDescriptionEn,
  } };
}
