/**
 * The Contact email's own subject/labels — internal-facing (read by
 * Divine Motion, never the visitor), so it deliberately lives here rather
 * than in src/i18n/ui.ts (public UI copy). Localized by the SUBMITTING
 * form's locale (not a separate admin preference), so the recipient can
 * tell at a glance which site language the inquiry came from.
 */
import type { Locale } from "@/i18n/routes";
import type { ContactEmailCopy } from "./email";

export const CONTACT_EMAIL_COPY: Record<Locale, ContactEmailCopy> = {
  fr: {
    subject: "Nouvelle demande de contact — site Divine Motion",
    labels: {
      name: "Nom",
      email: "Courriel",
      phone: "Téléphone",
      serviceType: "Type de prestation",
      date: "Date",
      location: "Lieu",
      message: "Message",
    },
    notProvided: "Non fourni",
  },
  en: {
    subject: "New contact request — Divine Motion website",
    labels: {
      name: "Name",
      email: "Email",
      phone: "Phone",
      serviceType: "Type of service",
      date: "Date",
      location: "Location",
      message: "Message",
    },
    notProvided: "Not provided",
  },
};
