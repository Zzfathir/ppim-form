import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { googleSheetsConfig } from "@/lib/env.server";
import { authUrl } from "@/lib/google/api";
import { signPayload } from "@/lib/google/crypto";
import { editorOf, googleRedirectUri, sheetsDeps, STATE_COOKIE } from "@/lib/google/server";
import { linkFormSheet } from "@/lib/google/sync";

/**
 * POST /api/google/link (form field `formId`): link a form to a new Google Sheet.
 * If the editor already granted access, the sheet is created right away;
 * otherwise they're sent to Google's consent screen first (drive.file only).
 * POST + SameSite=Lax cookies keep other sites from triggering it.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const formId = z.uuid().safeParse(form?.get("formId")).data;
  const back = (status: string) =>
    NextResponse.redirect(new URL(`/forms/${formId ?? ""}?tab=responses&sheets=${status}`, request.url), { status: 303 });
  if (!formId) return NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });

  const cfg = googleSheetsConfig();
  const deps = sheetsDeps();
  if (!cfg || !deps) return back("not_configured");
  const editor = await editorOf(formId);
  if (!editor) return back("forbidden");

  const { data: connection } = await deps.db.from("google_connections").select("profile_id").eq("profile_id", editor.profile.id).maybeSingle();
  if (connection) {
    const t = await getTranslations("sheets");
    const result = await linkFormSheet(
      { ...deps, labels: { timestamp: t("colTimestamp"), name: t("colName"), email: t("colEmail"), deleted: t("colDeleted") } },
      { formId, formTitle: editor.form.title, profileId: editor.profile.id, sheetName: t("spreadsheetName", { title: editor.form.title }) },
    ).catch(() => ({ status: "failed" as const }));
    // An expired/revoked grant falls through to a fresh consent.
    if (result.status !== "access_revoked" && result.status !== "not_connected") return back(result.status === "ok" ? "linked" : result.status);
  }

  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const response = NextResponse.redirect(
    authUrl({ clientId: cfg.clientId, redirectUri: googleRedirectUri(), state, codeChallenge: challenge, loginHint: editor.profile.email }),
    { status: 303 },
  );
  response.cookies.set(STATE_COOKIE, signPayload({ state, verifier, formId, profileId: editor.profile.id, exp: Date.now() + 10 * 60_000 }, cfg.tokenKey), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/api/google",
    maxAge: 600,
  });
  return response;
}
