/**
 * Only same-origin relative paths are allowed as post-login destinations,
 * so ?returnTo= cannot be used as an open redirect.
 */
export function safeReturnTo(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(value)) return fallback;
  return value;
}

/** Public form pages: signing in from them must not trigger onboarding (PRD A7). */
export function isPublicFormPath(path: string): boolean {
  return path === "/f" || path.startsWith("/f/");
}
