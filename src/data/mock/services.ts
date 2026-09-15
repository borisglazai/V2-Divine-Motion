import type { Locale } from "@/i18n/routes";

interface ServiceItem {
  title: string;
  text: string;
  imageAlt: string;
}

interface ServicesContent {
  title: string;
  intro: string;
  items: ServiceItem[];
  ctaLabel: string;
}

export const servicesMock: Record<Locale, ServicesContent> = {
  fr: {
    title: "Services",
    intro: "Trois univers, une même exigence photographique et humaine.",
    items: [
      {
        title: "Mariages",
        text: "Couverture complète de votre journée, de la préparation à la soirée, avec une attention discrète portée aux vrais moments.",
        imageAlt: "Mariage, préparatifs de la mariée — mock",
      },
      {
        title: "Portraits & Lifestyle",
        text: "Séances en studio ou en extérieur, seul, en couple ou en famille — des images naturelles, jamais figées.",
        imageAlt: "Séance portrait en lumière naturelle — mock",
      },
      {
        title: "Événements",
        text: "Événements privés et professionnels : une présence discrète qui capture l'ambiance sans jamais la perturber.",
        imageAlt: "Événement privé, ambiance de salle — mock",
      },
    ],
    ctaLabel: "Parler de votre projet",
  },
  en: {
    title: "Services",
    intro: "Three worlds, one photographic and human standard.",
    items: [
      {
        title: "Weddings",
        text: "Full-day coverage, from getting ready to the reception, with a discreet eye for the moments that actually matter.",
        imageAlt: "Wedding, bride getting ready — mock",
      },
      {
        title: "Portraits & Lifestyle",
        text: "Studio or outdoor sessions, solo, as a couple or as a family — natural images, never stiff.",
        imageAlt: "Portrait session in natural light — mock",
      },
      {
        title: "Events",
        text: "Private and professional events: a discreet presence that captures the mood without ever disrupting it.",
        imageAlt: "Private event, room ambiance — mock",
      },
    ],
    ctaLabel: "Talk about your project",
  },
};
