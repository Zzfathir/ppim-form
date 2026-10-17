import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { googleSheetsConfig } from "@/lib/env.server";
import { exchangeCode, SHEETS_SCOPE } from "@/lib/google/api";
import { encryptSecret, verifyPayload } from "@/lib/google/crypto";
import { editorOf, googleRedirectUri, sheetsDeps, STATE_COOKIE } from "@/lib/google/server";
import { linkFormSheet } from "@/lib/google/sync";

type State = { state: string; verifier: string; formId: string; profileId: string; exp: number };

/** Google sends the editor back here after consent: store the grant, create the sheet, return to the form. */
export async function GET(request: NextRequest) {
  const cfg = googleSheetsConfig();
  const deps = sheetsDeps();
  const saved = cfg ? verifyPayload<State>(request.cookies.get(STATE_COOKIE)?.value, cfg.tokenKey) : null;
  const back = (formId: string | undefined, status: string) => {
    const res = NextResponse.redirect(new URL(formId ? `/forms/${formId}?tab=responses&sheets=${status}` : "/dashboard", request.url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
    return res;
  };

  const params = request.nextUrl.searchParams;
  if (!cfg || !deps || !saved || saved.exp < Date.now() || params.get("state") !== saved.state) return back(saved?.formId, "failed");
  if (params.get("error")) return back(saved.formId, "cancelled");

  // The person coming back must still be the one who started, and still allowed to edit the form.
  const editor = await editorOf(saved.formId);
  if (!editor || editor.profile.id !== saved.profileId) return back(saved.formId, "forbidden");

  try {
    const grant = await exchangeCode({
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      redirectUri: googleRedirectUri(),
      code: params.get("code") ?? "",
      codeVerifier: saved.verifier,
    });
    if (!grant.refreshToken || !grant.scope.includes(SHEETS_SCOPE)) return back(saved.formId, "scope_missing");

    await deps.db.from("google_connections").upsert({
      profile_id: editor.profile.id,
      google_email: grant.email,
      refresh_token_enc: encryptSecret(grant.refreshToken, cfg.tokenKey),
      scopes: grant.scope,
      updated_at: new Date().toISOString(),
    });

    const t = await getTranslations("sheets");
    const result = await linkFormSheet(
      { ...deps, labels: { timestamp: t("colTimestamp"), name: t("colName"), email: t("colEmail"), deleted: t("colDeleted") } },
      { formId: saved.formId, formTitle: editor.form.title, profileId: editor.profile.id, sheetName: t("spreadsheetName", { title: editor.form.title }) },
    );
    return back(saved.formId, result.status === "ok" ? "linked" : result.status);
  } catch (err) {
    console.error("google link failed", err);
    return back(saved.formId, "failed");
  }
}
