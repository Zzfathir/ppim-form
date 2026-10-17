"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { editorOf, sheetsDeps, sheetsEnabled } from "@/lib/google/server";
import { syncFormSheet, type SyncStatus } from "@/lib/google/sync";

export type SheetState = {
  enabled: boolean;
  canEdit: boolean;
  sheet: { url: string; status: "ok" | "error"; lastError: string | null; lastSyncedAt: string | null } | null;
};

/** Link status for the Responses tab (anyone who can read the form sees it; RLS on form_sheets). */
export async function getSheetState(formId: string): Promise<SheetState | null> {
  if (!z.uuid().safeParse(formId).success) return null;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const supabase = await createClient();
  const [{ data: sheet }, editor] = await Promise.all([
    supabase.from("form_sheets").select("spreadsheet_url, status, last_error, last_synced_at").eq("form_id", formId).maybeSingle(),
    editorOf(formId),
  ]);
  return {
    enabled: sheetsEnabled(),
    canEdit: Boolean(editor),
    sheet: sheet
      ? { url: sheet.spreadsheet_url, status: sheet.status as "ok" | "error", lastError: sheet.last_error, lastSyncedAt: sheet.last_synced_at }
      : null,
  };
}

export async function syncSheetNow(formId: string): Promise<{ status: SyncStatus | "forbidden" }> {
  if (!z.uuid().safeParse(formId).success || !(await editorOf(formId))) return { status: "forbidden" };
  const deps = sheetsDeps();
  if (!deps) return { status: "failed" };
  return syncFormSheet(deps, formId);
}

/** Stop syncing. The spreadsheet stays in the owner's Drive with everything written so far. */
export async function unlinkSheet(formId: string): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(formId).success || !(await editorOf(formId))) return { ok: false };
  const deps = sheetsDeps();
  if (!deps) return { ok: false };
  const { error } = await deps.db.from("form_sheets").delete().eq("form_id", formId);
  return { ok: !error };
}
