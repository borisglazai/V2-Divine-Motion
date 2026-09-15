import type { Locale } from "@/i18n/routes";
import type { PlaceholderPhotoKey } from "@/lib/placeholder-photos";

interface ApproachItem {
  word: string;
  text: string;
}

interface AboutContent {
  hero: {
    title: string;
    intro: string;
    imageKey: PlaceholderPhotoKey;
    ratio: string;
    imageAlt: string;
  };
  story: {
    label: string;
    paragraphs: string[];
  };
  approach: {
    label: string;
    items: ApproachItem[];
  };
  breathingImage: {
    imageKey: PlaceholderPhotoKey;
    ratio: string;
    imageAlt: string;
  };
  humanNote: {
    text: string;
    imageKey: PlaceholderPhotoKey;
    ratio: string;
    imageAlt: string;
  };
  finalCta: {
    headline: string;
  };
}

export const aboutMock: Record<Locale, AboutContent> = {
  fr: {
    hero: {
      title: "Une approche sensible de l'image.",
      intro: "Derrière Divine Motion, une manière simple de raconter ce qui est vrai.",
      imageKey: "b",
      ratio: "16 / 9",
      imageAlt: "Portrait de Divine Motion en situation de travail — photo à venir",
    },
    story: {
      label: "Qui sommes-nous",
      paragraphs: [
        "Divine Motion est né d'une passion simple : capturer les gens tels qu'ils sont, dans les moments qui comptent vraiment.",
        "Le studio photographie et filme les mariages, les portraits et les événements avec une attention particulière portée à la lumière, aux détails et aux émotions réelles.",
        "Chaque séance commence par une conversation, pas par une liste de poses — pour que les images restent naturelles et sincères.",
      ],
    },
    approach: {
      label: "Approche",
      items: [
        { word: "Lumière", text: "Chercher la lumière qui raconte quelque chose de vrai." },
        { word: "Émotion", text: "Capturer ce qui se passe vraiment, pas ce qui est posé." },
        { word: "Simplicité", text: "Aller à l'essentiel, sans artifice inutile." },
      ],
    },
    breathingImage: {
      imageKey: "d",
      ratio: "21 / 9",
      imageAlt: "Photographie éditoriale de respiration — photo à venir",
    },
    humanNote: {
      text: "On sait que se retrouver devant un objectif n'est pas toujours confortable. Notre travail commence là : mettre les gens à l'aise, pour que ce qui reste soit simplement vrai.",
      imageKey: "c",
      ratio: "4 / 5",
      imageAlt: "Séance photo en cours, ambiance de travail — photo à venir",
    },
    finalCta: {
      headline: "Votre histoire mérite d'être racontée avec justesse.",
    },
  },
  en: {
    hero: {
      title: "A thoughtful way of seeing.",
      intro: "Behind Divine Motion, a simple way of telling what's true.",
      imageKey: "b",
      ratio: "16 / 9",
      imageAlt: "Portrait of Divine Motion at work — photo coming soon",
    },
    story: {
      label: "About us",
      paragraphs: [
        "Divine Motion started with a simple idea: capture people as they really are, in the moments that matter most.",
        "The studio photographs and films weddings, portraits and events with close attention to light, detail and real emotion.",
        "Every session starts with a conversation, not a list of poses — so the images stay natural and honest.",
      ],
    },
    approach: {
      label: "Approach",
      items: [
        { word: "Light", text: "Looking for light that says something true." },
        { word: "Emotion", text: "Capturing what's really happening, not what's posed." },
        { word: "Simplicity", text: "Getting to what matters, without unnecessary artifice." },
      ],
    },
    breathingImage: {
      imageKey: "d",
      ratio: "21 / 9",
      imageAlt: "Editorial breathing-room photograph — photo coming soon",
    },
    humanNote: {
      text: "We know that standing in front of a camera isn't always easy. That's where the work really begins — putting people at ease, so what's left is simply true.",
      imageKey: "c",
      ratio: "4 / 5",
      imageAlt: "Photo session in progress, working atmosphere — photo coming soon",
    },
    finalCta: {
      headline: "Your story deserves to be told honestly.",
    },
  },
};
