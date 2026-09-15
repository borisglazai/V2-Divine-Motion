import type { Locale } from "@/i18n/routes";

interface HomeContent {
  heroHeadline: string;
  heroImageAlt: string;
  workPreviewTitle: string;
  workPreviewItems: { imageAlt: string }[];
  brandStatement: string;
  servicesPreviewTitle: string;
  servicesPreviewItems: { title: string; imageAlt: string }[];
  editorialImageAlt: string;
  aboutPreviewTitle: string;
  aboutPreviewText: string;
  ctaHeadline: string;
}

export const homeMock: Record<Locale, HomeContent> = {
  fr: {
    heroHeadline: "Des images qui racontent vos moments les plus vrais.",
    heroImageAlt: "Portrait éditorial en lumière naturelle — mock",
    workPreviewTitle: "Travail",
    workPreviewItems: [
      { imageAlt: "Mariage en extérieur, lumière du soir — mock" },
      { imageAlt: "Portrait lifestyle en studio — mock" },
      { imageAlt: "Événement privé, ambiance en salle — mock" },
    ],
    brandStatement:
      "Divine Motion capture des moments de vie avec une sensibilité cinématographique — sans artifice, sans mise en scène excessive.",
    servicesPreviewTitle: "Services",
    servicesPreviewItems: [
      { title: "Mariages", imageAlt: "Cérémonie de mariage — mock" },
      { title: "Portraits & Lifestyle", imageAlt: "Séance portrait urbaine — mock" },
      { title: "Événements", imageAlt: "Événement professionnel — mock" },
    ],
    editorialImageAlt: "Photographie éditoriale de respiration — mock",
    aboutPreviewTitle: "À propos",
    aboutPreviewText:
      "Un studio visuel qui met la qualité du regard au service de vos moments les plus importants.",
    ctaHeadline: "Racontons votre histoire ensemble.",
  },
  en: {
    heroHeadline: "Images that tell the truest version of your moments.",
    heroImageAlt: "Editorial portrait in natural light — mock",
    workPreviewTitle: "Work",
    workPreviewItems: [
      { imageAlt: "Outdoor wedding, evening light — mock" },
      { imageAlt: "Studio lifestyle portrait — mock" },
      { imageAlt: "Private event, indoor ambiance — mock" },
    ],
    brandStatement:
      "Divine Motion captures life's moments with a cinematic sensibility — no artifice, no excessive staging.",
    servicesPreviewTitle: "Services",
    servicesPreviewItems: [
      { title: "Weddings", imageAlt: "Wedding ceremony — mock" },
      { title: "Portraits & Lifestyle", imageAlt: "Urban portrait session — mock" },
      { title: "Events", imageAlt: "Professional event — mock" },
    ],
    editorialImageAlt: "Editorial breathing-room photograph — mock",
    aboutPreviewTitle: "About",
    aboutPreviewText:
      "A visual studio that puts a distinctive eye at the service of your most important moments.",
    ctaHeadline: "Let's tell your story together.",
  },
};
