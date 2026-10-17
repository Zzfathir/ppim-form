import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeReturnTo } from "@/lib/safe-redirect";

/** POST only. An optional `returnTo` form field sends the user back (e.g. "Switch account" on a form). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const form = await request.formData().catch(() => null);
  const returnTo = form?.get("returnTo");
  const target =
    typeof returnTo === "string" && returnTo
      ? `/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`
      : "/login";
  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}
