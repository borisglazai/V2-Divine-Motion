/**
 * Carries a rejected work-item form's field values + errors across a
 * redirect (POST -> GET), the same "no session, just query params"
 * pattern as flash.ts — so a validation failure redisplays what the
 * admin typed instead of an empty form.
 */
import type { WorkItemFormErrors } from "./validation";

export interface WorkItemFormValues {
  mediaId?: string;
  category?: string;
  position?: string;
  ratio?: string;
  captionFr?: string;
  captionEn?: string;
  altFr?: string;
  altEn?: string;
  focalX?: string;
  focalY?: string;
  isVisible?: string;
  featuredOnHome?: string;
}

const FIELDS: (keyof WorkItemFormValues)[] = [
  "mediaId",
  "category",
  "position",
  "ratio",
  "captionFr",
  "captionEn",
  "altFr",
  "altEn",
  "focalX",
  "focalY",
  "isVisible",
  "featuredOnHome",
];

export function buildFormRedirect(basePath: string, errors: WorkItemFormErrors, formData: FormData): string {
  const url = new URL(basePath, "https://placeholder.local");
  for (const [field, message] of Object.entries(errors)) {
    url.searchParams.set(`error_${field}`, message);
  }
  for (const field of FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string" && value !== "") url.searchParams.set(`value_${field}`, value);
  }
  return url.pathname + url.search;
}

export function readFormRedirect(url: URL): { errors: WorkItemFormErrors; values: WorkItemFormValues } {
  const errors: WorkItemFormErrors = {};
  const values: WorkItemFormValues = {};
  for (const [key, value] of url.searchParams) {
    if (key.startsWith("error_")) errors[key.slice("error_".length)] = value;
    if (key.startsWith("value_")) (values as Record<string, string>)[key.slice("value_".length)] = value;
  }
  return { errors, values };
}
