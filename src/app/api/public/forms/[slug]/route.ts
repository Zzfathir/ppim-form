import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRespondent } from "@/lib/public-form/request";
import { loadPublicForm } from "@/lib/public-form/service";

/** Public, read-only view of a form: only public-safe fields plus a `state`. */
export async function GET(_request: Request, ctx: RouteContext<"/api/public/forms/[slug]">) {
  const { slug } = await ctx.params;
  const form = await loadPublicForm(createAdminClient(), slug, await getRespondent());
  return NextResponse.json(form, {
    status: form.state === "not_found" ? 404 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
