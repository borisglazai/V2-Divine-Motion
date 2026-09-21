/**
 * Sends the Contact form's one transactional email via Resend's HTTP API
 * (Production Readiness — Step 1: Contact Form). Deliberately no SDK
 * (`resend` npm package) — a single `fetch()` POST, same "no dependency
 * for what one HTTP call can do" philosophy already used for R2's S3 API
 * (`aws4fetch`, not the full AWS SDK) and Cloudflare Access (`jose`
 * alone, not a full OIDC client). Pure — API key and `fetch` are explicit
 * parameters, testable under plain `node --test` with a stub.
 *
 * ADR-015 (no D1 storage of contact submissions) stays intact: this
 * function neither reads from nor writes to D1. The message exists only
 * as this one outbound email; if the send fails, nothing else in this
 * codebase retains it (see submit-action.ts's own doc comment on that
 * consequence).
 */
import type { ParsedContactForm } from "./validation";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ContactEmailCopy {
  subject: string;
  labels: {
    name: string;
    email: string;
    phone: string;
    serviceType: string;
    date: string;
    location: string;
    message: string;
  };
  /** e.g. "Non fourni" / "Not provided" — never an empty cell for an optional field left blank. */
  notProvided: string;
}

export type SendContactEmailResult = { ok: true } | { ok: false; error: string };

function textBody(input: ParsedContactForm, copy: ContactEmailCopy): string {
  const line = (label: string, value: string | null) => `${label} : ${value ?? copy.notProvided}`;
  return [
    line(copy.labels.name, input.name),
    line(copy.labels.email, input.email),
    line(copy.labels.phone, input.phone),
    line(copy.labels.serviceType, input.serviceType),
    line(copy.labels.date, input.date),
    line(copy.labels.location, input.location),
    "",
    copy.labels.message + " :",
    input.message,
  ].join("\n");
}

/**
 * `from`/`to` are both plain email addresses, resolved by the caller
 * (`from` = `CONTACT_FROM_EMAIL`, an explicit configured/verified sender
 * — never guessed; `to` = `site_settings.contact_email`, the existing
 * DAL-backed recipient). Deliberately no IP address, user-agent, or any
 * other request metadata in the body — only the 7 form fields
 * (`src/lib/contact/validation.ts`'s own field set), exactly what the
 * visitor typed.
 */
export async function sendContactEmail(
  input: ParsedContactForm,
  config: { apiKey: string; from: string; to: string },
  copy: ContactEmailCopy,
  fetchImpl: typeof fetch = fetch,
): Promise<SendContactEmailResult> {
  try {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [config.to],
        reply_to: input.email,
        subject: copy.subject,
        text: textBody(input, copy),
      }),
    });
    if (!response.ok) {
      return { ok: false, error: `resend-http-${response.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "resend-request-failed" };
  }
}
