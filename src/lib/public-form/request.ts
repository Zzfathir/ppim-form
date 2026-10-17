import "server-only";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import type { Respondent } from "./service";

/** The signed-in Google user (any role), as a respondent identity. Never creates or upgrades a profile. */
export async function getRespondent(): Promise<Respondent> {
  const user = await getSessionUser();
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const name = (meta.full_name ?? meta.name ?? null) as string | null;
  return { id: user.id, email: user.email ?? null, name };
}

/**
 * Client IP for rate limiting. Behind a reverse proxy (Vercel, nginx, cPanel's
 * Passenger) the first X-Forwarded-For entry is the client; the proxy must set it.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}
