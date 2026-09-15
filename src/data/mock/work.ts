import type { Locale } from "@/i18n/routes";
import type { GalleryBlock } from "@/lib/gallery-blocks";

interface WorkContent {
  title: string;
  intro: string;
  gallery: GalleryBlock[];
  ctaHeadline: string;
}

const suffix = {
  fr: "photo à venir",
  en: "photo coming soon",
} as const;

/**
 * The curated sequence itself (Implementation Brief 003, section 7-11) —
 * a fixed, data-driven composition of block types, not a Projects grid
 * (ADR-003). Placeholder graphics stand in for real media (see
 * src/lib/placeholder-photos.ts); swapping media later only changes
 * `mediaKey`/`alt` here, never WorkGallery.astro.
 */
function buildGallery(locale: Locale): GalleryBlock[] {
  const s = suffix[locale];
  const alt = (fr: string, en: string) => (locale === "fr" ? `${fr} — ${s}` : `${en} — ${s}`);

  return [
    {
      type: "full",
      image: {
        mediaKey: "a",
        ratio: "21 / 9",
        alt: alt("Paysage large en fin de journée", "Wide landscape at dusk"),
      },
    },
    {
      type: "centered",
      image: {
        mediaKey: "b",
        ratio: "4 / 5",
        alt: alt("Portrait naturel en lumière douce", "Natural portrait in soft light"),
      },
    },
    {
      type: "duo",
      split: "left-heavy",
      left: {
        mediaKey: "c",
        ratio: "3 / 2",
        alt: alt("Rue animée, ambiance urbaine", "Busy street, urban mood"),
      },
      right: {
        mediaKey: "d",
        ratio: "4 / 5",
        alt: alt("Portrait rapproché", "Close portrait"),
      },
    },
    {
      type: "large",
      image: {
        mediaKey: "e",
        ratio: "4 / 5",
        alt: alt("Portrait signature en grand format", "Signature portrait, large format"),
      },
    },
    {
      type: "full",
      image: {
        mediaKey: "a",
        ratio: "16 / 9",
        alt: alt("Réception, vue d'ensemble", "Reception, wide view"),
      },
    },
    {
      type: "duo",
      split: "even",
      left: {
        mediaKey: "b",
        ratio: "4 / 5",
        alt: alt("Portrait en extérieur", "Outdoor portrait"),
      },
      right: {
        mediaKey: "c",
        ratio: "4 / 5",
        alt: alt("Portrait en intérieur", "Indoor portrait"),
      },
    },
    {
      type: "offset",
      side: "right",
      image: {
        mediaKey: "d",
        ratio: "3 / 2",
        alt: alt("Paysage urbain, lumière rasante", "Urban landscape, low light"),
      },
    },
    {
      type: "duo",
      split: "right-heavy",
      left: {
        mediaKey: "e",
        ratio: "4 / 5",
        alt: alt("Portrait de couple", "Couple portrait"),
      },
      right: {
        mediaKey: "a",
        ratio: "3 / 2",
        alt: alt("Scène de rue, mouvement", "Street scene, movement"),
      },
    },
    {
      type: "centered",
      image: {
        mediaKey: "b",
        ratio: "1 / 1",
        alt: alt("Détail, cadrage serré", "Detail, tight framing"),
      },
    },
    {
      type: "full",
      image: {
        mediaKey: "c",
        ratio: "21 / 9",
        alt: alt("Panorama de clôture", "Closing panorama"),
      },
    },
  ];
}

export const workMock: Record<Locale, WorkContent> = {
  fr: {
    title: "Travail",
    intro: "Une sélection de notre regard.",
    gallery: buildGallery("fr"),
    ctaHeadline: "Vous avez quelque chose à raconter ?",
  },
  en: {
    title: "Work",
    intro: "A glimpse into how we see.",
    gallery: buildGallery("en"),
    ctaHeadline: "Have a story to tell?",
  },
};
