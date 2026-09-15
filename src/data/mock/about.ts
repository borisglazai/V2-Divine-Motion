import type { Locale } from "@/i18n/routes";

interface AboutContent {
  title: string;
  heroImageAlt: string;
  paragraphs: string[];
  secondImageAlt: string;
  ctaLabel: string;
}

export const aboutMock: Record<Locale, AboutContent> = {
  fr: {
    title: "À propos",
    heroImageAlt: "Portrait en coulisses de Divine Motion — mock",
    paragraphs: [
      "Divine Motion est né d'une conviction simple : les meilleures images viennent des vrais moments, pas de la mise en scène.",
      "Chaque séance commence par l'écoute — comprendre qui vous êtes avant de décider comment vous photographier.",
      "Le résultat : des images élégantes et sincères, qui vous ressemblent vraiment.",
    ],
    secondImageAlt: "Séance photo en cours, ambiance de travail — mock",
    ctaLabel: "Parler de votre projet",
  },
  en: {
    title: "About",
    heroImageAlt: "Behind-the-scenes portrait of Divine Motion — mock",
    paragraphs: [
      "Divine Motion was born from a simple conviction: the best images come from real moments, not staging.",
      "Every session starts with listening — understanding who you are before deciding how to photograph you.",
      "The result: elegant, sincere images that actually look like you.",
    ],
    secondImageAlt: "Photo session in progress, working atmosphere — mock",
    ctaLabel: "Talk about your project",
  },
};
