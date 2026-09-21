/**
 * Server-side validation for the public Contact form (Production Readiness
 * — Step 1: Contact Form). Same discipline as
 * src/lib/admin/validation.ts's parseWorkItemForm: pure, takes a
 * `FormData`, never trusts `required`/`type="email"` HTML attributes
 * alone — a request that skips the browser (curl, a bot that fills the
 * DOM directly) must be validated exactly as strictly as a real submit.
 *
 * Field set is exactly what src/components/pages/ContactView.astro's
 * form already had (visual-only, pre-existing): name, email, phone
 * (optional), serviceType, date (optional), location (optional),
 * message. No new field — this brief wires a real backend onto the
 * existing form, it doesn't grow it.
 */
export interface ContactFormErrors {
  [field: string]: string;
}

export interface ParsedContactForm {
  name: string;
  email: string;
  phone: string | null;
  serviceType: string;
  date: string | null;
  location: string | null;
  message: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalField(formData: FormData, key: string): string | null {
  const value = stringField(formData, key);
  return value === "" ? null : value;
}

export interface ContactValidationCopy {
  nameRequired: string;
  emailRequired: string;
  emailInvalid: string;
  serviceTypeRequired: string;
  messageRequired: string;
}

/**
 * `copy` carries the exact field-error strings for the requesting
 * locale — this function never invents English text on a French
 * request or vice versa (see src/lib/contact/messages.ts, the single
 * source of truth for both).
 */
export function parseContactForm(
  formData: FormData,
  copy: ContactValidationCopy,
): { ok: true; data: ParsedContactForm } | { ok: false; errors: ContactFormErrors } {
  const errors: ContactFormErrors = {};

  const name = stringField(formData, "name");
  if (!name) errors.name = copy.nameRequired;

  const email = stringField(formData, "email");
  if (!email) {
    errors.email = copy.emailRequired;
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = copy.emailInvalid;
  }

  const serviceType = stringField(formData, "serviceType");
  if (!serviceType) errors.serviceType = copy.serviceTypeRequired;

  const message = stringField(formData, "message");
  if (!message) errors.message = copy.messageRequired;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      email,
      phone: optionalField(formData, "phone"),
      serviceType,
      date: optionalField(formData, "date"),
      location: optionalField(formData, "location"),
      message,
    },
  };
}
