import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPERADMIN_EMAILS: z.string().default(""),
  // Google Sheets sync (optional; the feature is hidden until all three are set).
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_TOKEN_KEY: z.string().optional(),
});

let cached: z.infer<typeof serverSchema> | undefined;

/** Server-only secrets. Parsed lazily so a missing key fails loudly where it is used. */
export function serverEnv() {
  cached ??= serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPERADMIN_EMAILS: process.env.SUPERADMIN_EMAILS,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
    GOOGLE_TOKEN_KEY: process.env.GOOGLE_TOKEN_KEY || undefined,
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

/** Google Sheets sync settings, or null when the feature isn't configured. */
export function googleSheetsConfig(): { clientId: string; clientSecret: string; tokenKey: Buffer } | null {
  const env = serverEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.GOOGLE_TOKEN_KEY) return null;
  const tokenKey = Buffer.from(env.GOOGLE_TOKEN_KEY, "base64");
  if (tokenKey.length !== 32) throw new Error("GOOGLE_TOKEN_KEY must be 32 bytes, base64-encoded");
  return { clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET, tokenKey };
}
