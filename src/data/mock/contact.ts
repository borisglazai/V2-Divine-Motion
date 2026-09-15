import type { Locale } from "@/i18n/routes";

interface ContactDetailItem {
  label: string;
  value: string;
  href: string;
}

interface ContactContent {
  hero: {
    title: string;
    subtext: string;
  };
  details: {
    label: string;
    items: ContactDetailItem[];
  };
  closingNote: string;
}

/**
 * Placeholder contact details (section 13/14 of Implementation Brief 006):
 * a plausible-format email on the site's own domain, and the same generic
 * Instagram placeholder link already used in Footer.astro — never an
 * invented address, phone number, hours, or precise location.
 */
export const contactMock: Record<Locale, ContactContent> = {
  fr: {
    hero: {
      title: "Parlons de votre projet.",
      subtext: "Quelques détails suffisent pour commencer la conversation.",
    },
    details: {
      label: "Coordonnées",
      items: [
        { label: "Courriel", value: "bonjour@divinemotion.ca", href: "mailto:bonjour@divinemotion.ca" },
        { label: "Instagram", value: "Instagram", href: "https://instagram.com" },
      ],
    },
    closingNote: "Chaque projet commence par une conversation.",
  },
  en: {
    hero: {
      title: "Let's talk about your project.",
      subtext: "A few details are enough to start the conversation.",
    },
    details: {
      label: "Get in touch",
      items: [
        { label: "Email", value: "bonjour@divinemotion.ca", href: "mailto:bonjour@divinemotion.ca" },
        { label: "Instagram", value: "Instagram", href: "https://instagram.com" },
      ],
    },
    closingNote: "Every project starts with a conversation.",
  },
};
