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
      discoverWork: "Découvrir notre travail",
      talkProject: "Parler de votre projet",
      discoverAbout: "Découvrir Divine Motion",
      contactUs: "Nous contacter",
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
      discoverWork: "Discover our work",
      talkProject: "Talk about your project",
      discoverAbout: "Discover Divine Motion",
      contactUs: "Contact us",
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
      submit: "Send",
      privacyNotice: "Your information is only used to respond to your request.",
    },
  },
} as const satisfies Record<Locale, unknown>;

export function t(locale: Locale) {
  return ui[locale];
}
