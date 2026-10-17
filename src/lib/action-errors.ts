/** Stable error codes raised by our SQL functions/triggers, mapped for the UI. */
const KNOWN = [
  "form_not_found",
  "publish_blocked",
  "publish_requires_active_account",
  "invalid_status_transition",
  "answered_question_type_locked",
  "new_forms_are_drafts",
  "not_allowed",
  "only_superadmin_can_transfer",
  "cannot_change_own_access",
  "last_superadmin",
  "invalid_target",
  "same_person",
  "forbidden",
] as const;

export type ErrorCode = (typeof KNOWN)[number] | "duplicate_name" | "in_use" | "invalid" | "unknown";

/** Maps a PostgREST / trigger error to a stable code. */
export function errorCode(error: { message?: string; code?: string } | null | undefined): ErrorCode {
  if (!error) return "unknown";
  const known = KNOWN.find((k) => error.message?.includes(k));
  if (known) return known;
  if (error.code === "23505") return "duplicate_name";
  if (error.code === "23503") return "in_use";
  if (error.code === "42501") return "forbidden";
  return "unknown";
}
