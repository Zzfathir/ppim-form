import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBootstrapSuperadmin } from "@/lib/env.server";
import { safeReturnTo } from "@/lib/safe-redirect";

/**
 * OAuth callback: exchanges the code for a session, applies the
 * SUPERADMIN_EMAILS bootstrap, then returns the user to where they started.
 * It never creates an admin: onboarding only happens when a respondent opens
 * an app route (PRD A7).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeReturnTo(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth&returnTo=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth&returnTo=${encodeURIComponent(next)}`);
  }

  const user = data.user;
  const viaGoogle = user.identities?.some((i) => i.provider === "google") ?? false;

  if (viaGoogle && isBootstrapSuperadmin(user.email)) {
    const admin = createAdminClient();
    const { data: promoted } = await admin
      .from("profiles")
      .update({ role: "superadmin", status: "active" })
      .eq("id", user.id)
      .neq("role", "superadmin")
      .select("id");
    if (promoted && promoted.length > 0) {
      await admin.from("activity_log").insert({
        actor_id: user.id,
        action: "superadmin_bootstrapped",
        entity_type: "profile",
        entity_id: user.id,
        meta: { source: "SUPERADMIN_EMAILS" },
      });
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
