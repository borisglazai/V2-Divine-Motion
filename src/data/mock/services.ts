import type { Locale } from "@/i18n/routes";
import type { PlaceholderPhotoKey } from "@/lib/placeholder-photos";

export type ServiceLayout = "wide-offset" | "split" | "text-image";

interface ServiceItem {
  id: string;
  /** Discreet kicker above the title — a magazine-style index, not a
   * repeat of the title (section 6-9: "label discret" then "titre"). */
  label: string;
  title: string;
  description: string;
  /** Max 3, enforced by content discipline, not by the type. */
  features: string[];
  imageKey: PlaceholderPhotoKey;
  ratio: string;
  imageAlt: string;
  ctaLabel: string;
  layout: ServiceLayout;
}

interface ApproachStep {
  number: string;
  title: string;
  text: string;
}

interface ServicesContent {
  title: string;
  intro: string;
  services: ServiceItem[];
  approachLabel: string;
  approachSteps: ApproachStep[];
  finalCta: {
    headline: string;
  };
}

export const servicesMock: Record<Locale, ServicesContent> = {
  fr: {
    title: "Services",
    intro: "Des images pensées pour les moments qui comptent.",
    services: [
      {
        id: "weddings",
        label: "01",
        title: "Mariages",
        description:
          "Couverture photo et vidéo pensée pour raconter la journée avec naturel, élégance et attention aux détails.",
        features: [
          "Couverture personnalisée",
          "Photo et/ou vidéo",
          "Accompagnement avant le jour J",
        ],
        imageKey: "e",
        ratio: "16 / 9",
        imageAlt: "Mariage, ambiance de réception — photo à venir",
        ctaLabel: "Parler de votre mariage",
        layout: "wide-offset",
      },
      {
        id: "portraits",
        label: "02",
        title: "Portraits & Lifestyle",
        description:
          "Séances individuelles, en couple ou en famille — en studio ou en extérieur, pour des images qui vous ressemblent vraiment.",
        features: [
          "Portraits individuels",
          "Couples & familles",
          "Séances urbaines & lifestyle",
        ],
        imageKey: "b",
        ratio: "4 / 5",
        imageAlt: "Portrait en lumière naturelle — photo à venir",
        ctaLabel: "Organiser une séance",
        layout: "split",
      },
      {
        id: "events",
        label: "03",
        title: "Événements",
        description:
          "Une présence discrète pour couvrir vos événements privés ou professionnels, du premier instant au dernier.",
        features: ["Anniversaires & célébrations", "Événements privés", "Événements professionnels"],
        imageKey: "d",
        ratio: "21 / 9",
        imageAlt: "Événement, ambiance de salle — photo à venir",
        ctaLabel: "Parler de votre événement",
        layout: "text-image",
      },
    ],
    approachLabel: "Approche",
    approachSteps: [
      {
        number: "01",
        title: "Échange",
        text: "On comprend votre besoin, votre date et votre intention.",
      },
      {
        number: "02",
        title: "Préparation",
        text: "On définit ensemble l'approche et les détails essentiels.",
      },
      {
        number: "03",
        title: "Création",
        text: "On capture votre moment avec une direction claire et naturelle.",
      },
    ],
    finalCta: {
      headline: "Votre projet ne rentre pas exactement dans une case ? Parlons-en.",
    },
  },
  en: {
    title: "Services",
    intro: "Images made for the moments that matter.",
    services: [
      {
        id: "weddings",
        label: "01",
        title: "Weddings",
        description:
          "Photo and video coverage designed to tell your day's story with warmth, elegance and an eye for detail.",
        features: ["Personalized coverage", "Photo and/or video", "Support before the big day"],
        imageKey: "e",
        ratio: "16 / 9",
        imageAlt: "Wedding, reception ambiance — photo coming soon",
        ctaLabel: "Talk about your wedding",
        layout: "wide-offset",
      },
      {
        id: "portraits",
        label: "02",
        title: "Portraits & Lifestyle",
        description:
          "Solo, couple or family sessions — in studio or outdoors, for images that actually look like you.",
        features: ["Individual portraits", "Couples & families", "Urban & lifestyle sessions"],
        imageKey: "b",
        ratio: "4 / 5",
        imageAlt: "Portrait in natural light — photo coming soon",
        ctaLabel: "Book a session",
        layout: "split",
      },
      {
        id: "events",
        label: "03",
        title: "Events",
        description:
          "A discreet presence covering your private or professional events, from the first moment to the last.",
        features: ["Birthdays & celebrations", "Private events", "Professional events"],
        imageKey: "d",
        ratio: "21 / 9",
        imageAlt: "Event, room ambiance — photo coming soon",
        ctaLabel: "Talk about your event",
        layout: "text-image",
      },
    ],
    approachLabel: "How it works",
    approachSteps: [
      {
        number: "01",
        title: "Conversation",
        text: "We get to know your need, your date and your intention.",
      },
      {
        number: "02",
        title: "Preparation",
        text: "We map out the approach and the details that matter.",
      },
      {
        number: "03",
        title: "Creation",
        text: "We capture your moment with a clear, natural direction.",
      },
    ],
    finalCta: {
      headline: "Doesn't quite fit a box? Let's talk about it.",
    },
  },
};
