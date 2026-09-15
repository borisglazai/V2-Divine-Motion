import type { Locale } from "@/i18n/routes";

interface PrivacySection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

interface PrivacyContent {
  title: string;
  intro: string[];
  /**
   * Mock placeholder — a real date is confirmed before production, not
   * hardcoded here as if final (Implementation Brief 007, section 8/22).
   */
  lastUpdated: string;
  sections: PrivacySection[];
  contactNote: {
    title: string;
    text: string;
    linkLabel: string;
  };
}

export const privacyMock: Record<Locale, PrivacyContent> = {
  fr: {
    title: "Confidentialité",
    intro: [
      "Nous accordons de l'importance à la protection des renseignements que vous nous transmettez.",
      "Cette page explique de façon simple comment certaines informations peuvent être utilisées lorsque vous communiquez avec Divine Motion.",
    ],
    lastUpdated: "Dernière mise à jour : 15 septembre 2026 (à confirmer avant mise en production)",
    sections: [
      {
        id: "collected",
        title: "Informations recueillies",
        paragraphs: [
          "Divine Motion peut recevoir certains renseignements lorsque vous utilisez le formulaire de contact du site.",
        ],
        bullets: [
          "Nom",
          "Courriel",
          "Téléphone, si vous le fournissez",
          "Informations sur votre projet",
          "Date et lieu, si vous les indiquez",
        ],
      },
      {
        id: "use",
        title: "Utilisation des informations",
        paragraphs: [
          "Ces renseignements servent principalement à :",
        ],
        bullets: [
          "Répondre à votre demande",
          "Échanger avec vous au sujet de votre projet",
          "Préparer le service que vous demandez",
        ],
      },
      {
        id: "retention",
        title: "Conservation",
        paragraphs: [
          "Les renseignements sont conservés seulement aussi longtemps que nécessaire pour répondre à la demande ou satisfaire les obligations applicables.",
        ],
      },
      {
        id: "sharing",
        title: "Partage",
        paragraphs: [
          "Divine Motion ne vend pas les renseignements personnels.",
          "Les informations peuvent être traitées par des fournisseurs techniques nécessaires au fonctionnement du site ou de nos communications.",
        ],
      },
      {
        id: "security",
        title: "Sécurité",
        paragraphs: [
          "Des mesures raisonnables sont mises en place pour protéger les renseignements que vous nous transmettez. Aucune méthode de transmission ou de stockage n'est toutefois entièrement infaillible.",
        ],
      },
      {
        id: "analytics",
        title: "Témoins et mesure d'audience",
        paragraphs: [
          "Le site utilise Cloudflare Web Analytics pour mieux comprendre son utilisation générale, de façon simple et respectueuse de la vie privée.",
        ],
      },
      {
        id: "rights",
        title: "Vos droits",
        paragraphs: [
          "Selon les règles applicables, vous pouvez demander l'accès, la correction ou la suppression de certains renseignements vous concernant.",
        ],
      },
    ],
    contactNote: {
      title: "Nous contacter",
      text: "Pour toute question relative à la confidentialité, vous pouvez communiquer avec nous.",
      linkLabel: "Nous écrire",
    },
  },
  en: {
    title: "Privacy",
    intro: [
      "We take the protection of the information you share with us seriously.",
      "This page explains in simple terms how certain information may be used when you get in touch with Divine Motion.",
    ],
    lastUpdated: "Last updated: September 15, 2026 (to be confirmed before production)",
    sections: [
      {
        id: "collected",
        title: "Information we collect",
        paragraphs: [
          "Divine Motion may receive certain information when you use the site's contact form.",
        ],
        bullets: [
          "Name",
          "Email",
          "Phone, if provided",
          "Details about your project",
          "Date and location, if provided",
        ],
      },
      {
        id: "use",
        title: "How we use it",
        paragraphs: ["This information is mainly used to:"],
        bullets: [
          "Respond to your request",
          "Discuss your project with you",
          "Prepare the service you're requesting",
        ],
      },
      {
        id: "retention",
        title: "Retention",
        paragraphs: [
          "Information is kept only for as long as needed to respond to your request or meet applicable obligations.",
        ],
      },
      {
        id: "sharing",
        title: "Sharing",
        paragraphs: [
          "Divine Motion does not sell personal information.",
          "Information may be processed by technical providers necessary to run the site or our communications.",
        ],
      },
      {
        id: "security",
        title: "Security",
        paragraphs: [
          "Reasonable measures are in place to protect the information you share with us. No method of transmission or storage is completely foolproof, though.",
        ],
      },
      {
        id: "analytics",
        title: "Cookies and analytics",
        paragraphs: [
          "The site uses Cloudflare Web Analytics to better understand general usage, in a simple, privacy-respecting way.",
        ],
      },
      {
        id: "rights",
        title: "Your rights",
        paragraphs: [
          "Depending on applicable rules, you can request access to, correction of, or deletion of certain information about you.",
        ],
      },
    ],
    contactNote: {
      title: "Get in touch",
      text: "For any privacy-related question, you can reach out to us.",
      linkLabel: "Write to us",
    },
  },
};
