import type { Locale } from "@/i18n/routes";
import type { PlaceholderPhotoKey } from "@/lib/placeholder-photos";

interface WorkPreviewItem {
  imageKey: PlaceholderPhotoKey;
  ratio: string;
  alt: string;
}

interface ServicePreviewItem {
  title: string;
  text: string;
  imageKey: PlaceholderPhotoKey;
}

interface HomeContent {
  hero: {
    headline: string;
    subline: string;
    imageAlt: string;
  };
  workPreview: {
    label: string;
    items: WorkPreviewItem[];
    linkLabel: string;
  };
  brandStatement: string;
  servicesPreview: {
    label: string;
    items: ServicePreviewItem[];
  };
  editorial: {
    imageAlt: string;
  };
  aboutPreview: {
    label: string;
    text: string;
    imageAlt: string;
  };
  finalCta: {
    headline: string;
  };
}

/**
 * Placeholder-graphic pass (Implementation Brief 002) — alt text describes
 * the real subject the future Divine Motion photograph will show, suffixed
 * so it stays honest about the current state (see
 * src/lib/placeholder-photos.ts). Swap `imageKey` values and drop the
 * suffix once real assets land; nothing else in this shape needs to change.
 */
export const homeMock: Record<Locale, HomeContent> = {
  fr: {
    hero: {
      headline: "Des images qui restent en mouvement.",
      subline:
        "Photographie et vidéographie pour les mariages, les portraits et les moments qui comptent.",
      imageAlt: "Portrait signature en lumière naturelle — photo à venir",
    },
    workPreview: {
      label: "Travail",
      items: [
        { imageKey: "a", ratio: "3 / 2", alt: "Mariage, sortie de cérémonie — photo à venir" },
        { imageKey: "b", ratio: "4 / 5", alt: "Portrait en extérieur — photo à venir" },
        { imageKey: "c", ratio: "1 / 1", alt: "Détail de mariage — photo à venir" },
        { imageKey: "d", ratio: "4 / 5", alt: "Portrait de couple — photo à venir" },
        { imageKey: "e", ratio: "3 / 2", alt: "Séance urbaine — photo à venir" },
        { imageKey: "a", ratio: "21 / 9", alt: "Réception de mariage — photo à venir" },
      ],
      linkLabel: "Voir notre travail",
    },
    brandStatement:
      "Nous photographions les personnes et les moments tels qu'ils méritent d'être ressentis.",
    servicesPreview: {
      label: "Services",
      items: [
        {
          title: "Mariages",
          text: "Une couverture complète, du matin à la soirée.",
          imageKey: "b",
        },
        {
          title: "Portraits & Lifestyle",
          text: "Des images naturelles, seul, en couple ou en famille.",
          imageKey: "d",
        },
        {
          title: "Événements",
          text: "Une présence discrète qui capture l'essentiel.",
          imageKey: "c",
        },
      ],
    },
    editorial: {
      imageAlt: "Photographie éditoriale de respiration — photo à venir",
    },
    aboutPreview: {
      label: "À propos",
      text: "Un studio visuel qui met la qualité du regard au service de vos moments les plus importants.",
      imageAlt: "Portrait en coulisses de Divine Motion — photo à venir",
    },
    finalCta: {
      headline: "Parlons de ce que vous voulez raconter.",
    },
  },
  en: {
    hero: {
      headline: "Images that stay in motion.",
      subline:
        "Photography and videography for weddings, portraits and the moments that matter.",
      imageAlt: "Signature portrait in natural light — photo coming soon",
    },
    workPreview: {
      label: "Work",
      items: [
        { imageKey: "a", ratio: "3 / 2", alt: "Wedding, ceremony exit — photo coming soon" },
        { imageKey: "b", ratio: "4 / 5", alt: "Outdoor portrait — photo coming soon" },
        { imageKey: "c", ratio: "1 / 1", alt: "Wedding detail — photo coming soon" },
        { imageKey: "d", ratio: "4 / 5", alt: "Couple portrait — photo coming soon" },
        { imageKey: "e", ratio: "3 / 2", alt: "Urban session — photo coming soon" },
        { imageKey: "a", ratio: "21 / 9", alt: "Wedding reception — photo coming soon" },
      ],
      linkLabel: "See our work",
    },
    brandStatement:
      "We photograph people and moments the way they deserve to be felt.",
    servicesPreview: {
      label: "Services",
      items: [
        {
          title: "Weddings",
          text: "Full coverage, from morning to reception.",
          imageKey: "b",
        },
        {
          title: "Portraits & Lifestyle",
          text: "Natural images, solo, as a couple or as a family.",
          imageKey: "d",
        },
        {
          title: "Events",
          text: "A discreet presence that captures what matters.",
          imageKey: "c",
        },
      ],
    },
    editorial: {
      imageAlt: "Editorial breathing-room photograph — photo coming soon",
    },
    aboutPreview: {
      label: "About",
      text: "A visual studio that puts a distinctive eye at the service of your most important moments.",
      imageAlt: "Behind-the-scenes portrait of Divine Motion — photo coming soon",
    },
    finalCta: {
      headline: "Let's talk about what you want to tell.",
    },
  },
};
