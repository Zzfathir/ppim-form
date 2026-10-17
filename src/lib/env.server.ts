import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPERADMIN_EMAILS: z.string().default(""),
});

let cached: z.infer<typeof serverSchema> | undefined;

/** Server-only secrets. Parsed lazily so a missing key fails loudly where it is used. */
export function serverEnv() {
  cached ??= serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPERADMIN_EMAILS: process.env.SUPERADMIN_EMAILS,
  });
  return cached;
}

export function parseEmailList(value: string): string[] {
  return value
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapSuperadmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseEmailList(serverEnv().SUPERADMIN_EMAILS).includes(email.trim().toLowerCase());
}
