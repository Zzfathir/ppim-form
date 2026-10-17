import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type Profile = Tables<"profiles">;

/** The verified signed-in user (checked with the auth server), or null. One call per request. */
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/** The caller's profile row (read through RLS), or null when signed out. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data;
});

export function needsOnboarding(profile: Profile): boolean {
  return profile.role === "respondent" || profile.department_id === null;
}

/**
 * Gate for app routes (admin + superadmin). Signed-out → /login,
 * respondents or staff without a department → /onboarding.
 */
export async function requireStaff(returnTo = "/dashboard"): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  if (needsOnboarding(profile)) redirect("/onboarding");
  return profile;
}

export async function requireSuperadmin(): Promise<Profile> {
  const profile = await requireStaff("/admin");
  if (profile.role !== "superadmin" || profile.status === "suspended") redirect("/dashboard");
  return profile;
}
