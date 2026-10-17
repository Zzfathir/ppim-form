import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, getRespondent } from "@/lib/public-form/request";
import { submitPublicResponse } from "@/lib/public-form/service";
import { syncAfterSubmit } from "@/lib/google/server";

const MAX_BODY_BYTES = 256 * 1024;

/** Submit a response. The server re-checks everything (build prompt §7). */
export async function POST(request: Request, ctx: RouteContext<"/api/public/forms/[slug]/submit">) {
  const noStore = { "Cache-Control": "no-store" };

  // JSON only: browsers can't send this cross-site without a CORS preflight, which we never allow.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ ok: false, error: "unsupported_media_type" }, { status: 415, headers: noStore });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large" }, { status: 413, headers: noStore });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "too_large" }, { status: 413, headers: noStore });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400, headers: noStore });
  }

  const { slug } = await ctx.params;
  const outcome = await submitPublicResponse(createAdminClient(), {
    slug,
    body,
    user: await getRespondent(),
    ip: await getClientIp(),
  });
  // Linked Google Sheet: append the new row after the response is sent (never delays the respondent).
  if (outcome.status === 200 && outcome.formId) {
    const formId = outcome.formId;
    after(() => syncAfterSubmit(formId));
  }
  return NextResponse.json(outcome.body, { status: outcome.status, headers: noStore });
}
