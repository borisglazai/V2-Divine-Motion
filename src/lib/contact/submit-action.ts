/**
 * The real logic behind "submit the Contact form" (Production Readiness
 * — Step 1: Contact Form) — `db`/binding-free, everything it needs
 * passed in explicitly (`deps`), same convention as
 * src/lib/admin/work-slot-actions.ts's action functions: this is what
 * makes it testable under plain `node --test`, with the endpoint file
 * itself (`src/pages/contact/submit.ts`) staying the one place that
 * actually reads `cloudflare:workers`/D1/the request's IP.
 *
 * Order of checks, cheapest/most local first: validation (no network) ->
 * configuration present (no network) -> rate limit (KV, no external
 * network) -> Turnstile (network call to Cloudflare) -> email (network
 * call to Resend). Nothing after a failed check runs — in particular,
 * validation failing or Turnstile failing both stop before
 * sendContactEmail is ever called, so neither path can ever send an
 * email (the two explicit "no email if X fails" requirements).
 */
import type { Locale } from "@/i18n/routes";
import { t } from "@/i18n/ui";
import { parseContactForm, type ContactFormErrors } from "./validation";
import { verifyTurnstile } from "./turnstile";
import { sendContactEmail } from "./email";
import { checkContactRateLimit } from "./rate-limit";
import { CONTACT_EMAIL_COPY } from "./messages";
import type { TurnstileConfig, ResendConfig } from "./env";

export interface ContactSubmissionDeps {
  turnstileConfig: TurnstileConfig | null;
  resendConfig: ResendConfig | null;
  /** `site_settings.contact_email` — `null` when that row/column couldn't be read (D1 failure), never a fallback address. */
  recipientEmail: string | null;
  rateLimitKv: KVNamespace | undefined;
  fetchImpl?: typeof fetch;
}

export type ContactSubmissionResult =
  | { outcome: "success" }
  | { outcome: "validation_error"; errors: ContactFormErrors }
  | { outcome: "turnstile_error" }
  | { outcome: "rate_limited" }
  | { outcome: "config_error" }
  | { outcome: "email_error" };

export async function handleContactSubmission(
  formData: FormData,
  locale: Locale,
  remoteIp: string | undefined,
  deps: ContactSubmissionDeps,
): Promise<ContactSubmissionResult> {
  const copy = t(locale).contactForm;

  const parsed = parseContactForm(formData, copy.errors);
  if (!parsed.ok) return { outcome: "validation_error", errors: parsed.errors };

  if (!deps.turnstileConfig || !deps.resendConfig || !deps.recipientEmail) {
    return { outcome: "config_error" };
  }

  const rateLimit = await checkContactRateLimit(deps.rateLimitKv, remoteIp ?? "unknown");
  if (!rateLimit.allowed) return { outcome: "rate_limited" };

  const rawToken = formData.get("cf-turnstile-response");
  const turnstileToken = typeof rawToken === "string" ? rawToken : "";
  const turnstileResult = await verifyTurnstile(turnstileToken, deps.turnstileConfig.secretKey, remoteIp, deps.fetchImpl);
  if (!turnstileResult.success) return { outcome: "turnstile_error" };

  const sendResult = await sendContactEmail(
    parsed.data,
    { apiKey: deps.resendConfig.apiKey, from: deps.resendConfig.fromEmail, to: deps.recipientEmail },
    CONTACT_EMAIL_COPY[locale],
    deps.fetchImpl,
  );
  if (!sendResult.ok) return { outcome: "email_error" };

  return { outcome: "success" };
}
