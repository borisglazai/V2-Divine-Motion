import type { Locale } from "@/i18n/routes";

interface WorkContent {
  title: string;
  intro: string;
  galleryItems: { imageAlt: string; category: string }[];
  ctaLabel: string;
}

/**
 * Mock stand-in for the future `work_items` model (docs/CMS_SPEC.md /
 * ADR-003) — a curated selection of media, not a Projects catalogue.
 * No slugs, no per-item detail page.
 */
export const workMock: Record<Locale, WorkContent> = {
  fr: {
    title: "Travail",
    intro: "Une sélection de moments — mariages, portraits, événements.",
    galleryItems: [
      { imageAlt: "Mariage, sortie de cérémonie — mock", category: "Mariages" },
      { imageAlt: "Portrait lifestyle en extérieur — mock", category: "Portraits & Lifestyle" },
      { imageAlt: "Réception de mariage, danse — mock", category: "Mariages" },
      { imageAlt: "Événement professionnel, discours — mock", category: "Événements" },
      { imageAlt: "Portrait de couple — mock", category: "Portraits & Lifestyle" },
      { imageAlt: "Détail de mariage, alliance — mock", category: "Mariages" },
    ],
    ctaLabel: "Parler de votre projet",
  },
  en: {
    title: "Work",
    intro: "A selection of moments — weddings, portraits, events.",
    galleryItems: [
      { imageAlt: "Wedding, ceremony exit — mock", category: "Weddings" },
      { imageAlt: "Outdoor lifestyle portrait — mock", category: "Portraits & Lifestyle" },
      { imageAlt: "Wedding reception, dancing — mock", category: "Weddings" },
      { imageAlt: "Professional event, speech — mock", category: "Events" },
      { imageAlt: "Couple portrait — mock", category: "Portraits & Lifestyle" },
      { imageAlt: "Wedding detail, rings — mock", category: "Weddings" },
    ],
    ctaLabel: "Talk about your project",
  },
};
