/**
 * Maps DAL `DbErrorCode`s to admin-facing French messages (Implementation
 * Brief 013 §23) — never the raw SQL/D1 error text, never a stack trace.
 */
import type { DbError, DbErrorCode } from "@/lib/db/types";

const MESSAGES: Record<DbErrorCode, string> = {
  NOT_FOUND: "Cet élément n'existe pas ou n'est plus disponible.",
  DRAFT_ALREADY_EXISTS: "Un brouillon existe déjà pour cet élément.",
  NO_DRAFT: "Aucun brouillon à publier ou à supprimer pour cet élément.",
  PUBLICATION_RIGHTS_REQUIRED: "Publication impossible : les droits de publication du média ne sont pas confirmés.",
  MEDIA_IN_USE: "Ce média est encore utilisé ailleurs et ne peut pas être retiré.",
  VALIDATION_FAILED: "Certains champs ne sont pas valides. Vérifiez le formulaire.",
  INVALID_STATE: "Cette action n'est pas possible dans l'état actuel de cet élément.",
};

export function adminErrorMessage(error: DbError): string {
  return MESSAGES[error.code] ?? "Une erreur est survenue.";
}
