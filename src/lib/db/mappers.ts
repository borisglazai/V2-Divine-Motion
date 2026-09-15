/**
 * Small, shared row-mapping helpers (Brief 011 §9) — kept deliberately
 * tiny. Not a mapping framework: each repository still writes its own SQL
 * and its own field lists; these are just the few genuinely repeated
 * conversions (D1 boolean-as-integer, FR/EN column pairs, "now").
 */
import type { Locale } from "./types";

export function toBool(value: 0 | 1): boolean {
  return value === 1;
}

export function toInt(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

export function nowMs(): number {
  return Date.now();
}

/**
 * Reads a locale-suffixed pair of columns (`${base}_fr` / `${base}_en`)
 * off a row. `base` is always a literal string chosen at the call site
 * (never user input), and `locale` is the closed `Locale` union — this is
 * the one sanctioned pattern for "locale changes which column", per
 * Brief 011 §11. Never used to build SQL; only to read an already-fetched
 * JS object.
 */
export function localeField<Row extends Record<string, unknown>>(
  row: Row,
  base: string,
  locale: Locale,
): string {
  const key = `${base}_${locale}` as keyof Row;
  return row[key] as string;
}
