import "server-only";
import { publicEnv } from "@/lib/env";
import { googleSheetsConfig } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canEditForm } from "@/lib/forms/queries";
import { googleSheetsApi } from "./api";
import { syncFormSheet, type SheetLabels, type SyncDeps } from "./sync";

/** Cookie holding the signed OAuth state (state, PKCE verifier, form, person) during Google consent. */
export const STATE_COOKIE = "ppim_google_oauth";

/** Fixed English labels for background syncs (only used for header cells written outside a request). */
const DEFAULT_LABELS: SheetLabels = { timestamp: "Timestamp", name: "Name", email: "Email", deleted: "deleted question" };

export function sheetsEnabled(): boolean {
  return googleSheetsConfig() !== null;
}

export function sheetsDeps(labels: SheetLabels = DEFAULT_LABELS): SyncDeps | null {
  const cfg = googleSheetsConfig();
  if (!cfg) return null;
  return { db: createAdminClient(), api: googleSheetsApi(cfg.clientId, cfg.clientSecret), tokenKey: cfg.tokenKey, labels };
}

/** Google must redirect back to exactly this URL (also registered in Google Cloud). */
export function googleRedirectUri(): string {
  return `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/google/callback`;
}

/** The signed-in person, if they may edit this form (owner or superadmin, not suspended). */
export async function editorOf(formId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const supabase = await createClient();
  const { data: form } = await supabase.from("forms").select("id, title, owner_id, deleted_at").eq("id", formId).maybeSingle();
  if (!form || !canEditForm(profile, form)) return null;
  return { profile, form };
}

/** Fire-and-forget sync after a response is stored (no-op when the form isn't linked). */
export async function syncAfterSubmit(formId: string): Promise<void> {
  const deps = sheetsDeps();
  if (!deps) return;
  try {
    await syncFormSheet(deps, formId);
  } catch (err) {
    console.error("background sheet sync failed", formId, err);
  }
}
