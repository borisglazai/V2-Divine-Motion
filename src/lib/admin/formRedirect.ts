/**
 * Carries a rejected admin form's field values + errors across a
 * redirect (POST -> GET), the same "no session, just query params"
 * pattern as flash.ts — so a validation failure redisplays what the
 * admin typed instead of an empty form. Generic across CMS modules (the
 * caller passes its own field list) — originally Work-item-specific,
 * generalized for Services CMS to avoid a near-identical duplicate file.
 */
export interface FormErrors {
  [field: string]: string;
}

export interface FormValues {
  [field: string]: string;
}

export function buildFormRedirect(basePath: string, errors: FormErrors, formData: FormData, fields: readonly string[]): string {
  const url = new URL(basePath, "https://placeholder.local");
  for (const [field, message] of Object.entries(errors)) {
    url.searchParams.set(`error_${field}`, message);
  }
  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value === "string" && value !== "") url.searchParams.set(`value_${field}`, value);
  }
  return url.pathname + url.search;
}

export function readFormRedirect(url: URL): { errors: FormErrors; values: FormValues } {
  const errors: FormErrors = {};
  const values: FormValues = {};
  for (const [key, value] of url.searchParams) {
    if (key.startsWith("error_")) errors[key.slice("error_".length)] = value;
    if (key.startsWith("value_")) values[key.slice("value_".length)] = value;
  }
  return { errors, values };
}
