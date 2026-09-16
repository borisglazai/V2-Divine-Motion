import type { Locale } from "./routes";

declare const __BUILD_YEAR__: string;

export const ui = {
  fr: {
    siteName: "Divine Motion",
    nav: {
      work: "Travail",
      services: "Services",
      about: "À propos",
      contact: "Contact",
    },
    langSwitchLabel: "EN",
    langSwitchAria: "Passer au site en anglais",
    mainNavLabel: "Navigation principale",
    menuOpen: "Menu",
    menuClose: "Fermer",
    cta: {
      talkProject: "Parler de votre projet",
      discoverAbout: "Découvrir Divine Motion",
      contactUs: "Nous contacter",
    },
    testimonials: {
      label: "Témoignages",
    },
    footer: {
      privacy: "Confidentialité",
      rights: `© ${__BUILD_YEAR__} Divine Motion. Tous droits réservés.`,
      instagram: "Instagram",
    },
    contactForm: {
      name: "Nom",
      email: "Courriel",
      phone: "Téléphone (facultatif)",
      serviceType: "Type de prestation",
      serviceTypeOptions: ["Mariage", "Portrait / Lifestyle", "Événement", "Autre"],
      date: "Date (facultative)",
      location: "Lieu",
      message: "Message",
      messagePlaceholder:
        "Parlez-nous de votre projet, de votre date et de ce que vous imaginez.",
      submit: "Envoyer",
      privacyNotice:
        "Vos renseignements servent uniquement à répondre à votre demande.",
    },
  },
  en: {
    siteName: "Divine Motion",
    nav: {
      work: "Work",
      services: "Services",
      about: "About",
      contact: "Contact",
    },
    langSwitchLabel: "FR",
    langSwitchAria: "Switch to the French site",
    mainNavLabel: "Main navigation",
    menuOpen: "Menu",
    menuClose: "Close",
    cta: {
      talkProject: "Talk about your project",
      discoverAbout: "Discover Divine Motion",
      contactUs: "Contact us",
    },
    testimonials: {
      label: "Testimonials",
    },
    footer: {
      privacy: "Privacy",
      rights: `© ${__BUILD_YEAR__} Divine Motion. All rights reserved.`,
      instagram: "Instagram",
    },
    contactForm: {
      name: "Name",
      email: "Email",
      phone: "Phone (optional)",
      serviceType: "Type of service",
      serviceTypeOptions: ["Wedding", "Portrait / Lifestyle", "Event", "Other"],
      date: "Date (optional)",
      location: "Location",
      message: "Message",
      messagePlaceholder: "Tell us about your project, your date and what you have in mind.",
      submit: "Send",
      privacyNotice: "Your information is only used to respond to your request.",
    },
  },
} as const satisfies Record<Locale, unknown>;

export function t(locale: Locale) {
  return ui[locale];
}
