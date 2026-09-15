/**
 * Flash messages across a POST -> redirect -> GET cycle (Brief 013 §24:
 * "pas besoin d'un système global complexe"). No session/cookie — the
 * level+message travel as query params on the redirect target, read once
 * by the destination page and never re-appended when that page itself
 * navigates onward.
 */
export type FlashLevel = "success" | "warning" | "error";

export interface Flash {
  level: FlashLevel;
  message: string;
}

const LEVELS: FlashLevel[] = ["success", "warning", "error"];

/** Appends flash params to a redirect target path (e.g. "/admin/work"). */
export function withFlash(path: string, level: FlashLevel, message: string): string {
  const url = new URL(path, "https://placeholder.local");
  url.searchParams.set("flash", level);
  url.searchParams.set("flash_message", message);
  return url.pathname + url.search;
}

export function readFlash(url: URL): Flash | null {
  const level = url.searchParams.get("flash");
  const message = url.searchParams.get("flash_message");
  if (!level || !message || !LEVELS.includes(level as FlashLevel)) return null;
  return { level: level as FlashLevel, message };
}
