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
      turnstileLabel: "Vérification anti-spam",
      errors: {
        nameRequired: "Veuillez indiquer votre nom.",
        emailRequired: "Veuillez indiquer votre courriel.",
        emailInvalid: "Ce courriel ne semble pas valide.",
        serviceTypeRequired: "Veuillez choisir un type de prestation.",
        messageRequired: "Veuillez écrire votre message.",
        turnstile: "La vérification anti-spam a échoué. Veuillez réessayer.",
        rateLimited: "Trop de tentatives. Veuillez réessayer dans quelques minutes.",
        emailProvider:
          "Votre message n'a pas pu être envoyé pour le moment. Vous pouvez nous joindre directement par téléphone ou sur Instagram.",
        generic: "Une erreur est survenue. Veuillez réessayer.",
      },
      success: "Votre message a été envoyé. Nous vous répondrons rapidement.",
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
      turnstileLabel: "Anti-spam verification",
      errors: {
        nameRequired: "Please enter your name.",
        emailRequired: "Please enter your email.",
        emailInvalid: "This email doesn't look valid.",
        serviceTypeRequired: "Please choose a type of service.",
        messageRequired: "Please write your message.",
        turnstile: "The anti-spam verification failed. Please try again.",
        rateLimited: "Too many attempts. Please try again in a few minutes.",
        emailProvider:
          "Your message couldn't be sent right now. You can reach us directly by phone or on Instagram.",
        generic: "Something went wrong. Please try again.",
      },
      success: "Your message has been sent. We'll get back to you shortly.",
    },
  },
} as const satisfies Record<Locale, unknown>;

export function t(locale: Locale) {
  return ui[locale];
}
