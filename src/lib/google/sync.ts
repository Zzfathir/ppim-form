import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { exportCell, formatTimestamp } from "@/lib/responses/format";
import { getResponseColumns } from "@/lib/responses/queries";
import { decryptSecret } from "./crypto";
import { GoogleApiError, type Cell, type SheetsApi } from "./api";

/**
 * Live sync of a form's responses to a Google Sheet in the linking person's
 * Drive. Runs with the service role; callers check permissions first.
 *
 * Sheet layout: Timestamp | Name | Email | one column per question (form
 * order when linked; questions added later get new columns at the end).
 */

type Db = SupabaseClient<Database>;
export type SheetLabels = { timestamp: string; name: string; email: string; deleted: string };
export type SyncDeps = { db: Db; api: SheetsApi; tokenKey: Buffer; labels: SheetLabels };
export type SyncStatus = "ok" | "busy" | "not_linked" | "not_connected" | "access_revoked" | "not_found" | "quota" | "failed";

export const SHEET_TITLE = "Responses";
const FIXED_COLUMNS = 3;
const BATCH = 500;
const MAX_BATCHES = 20;

/** 1 → A, 27 → AA */
export function columnLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

async function accessTokenFor(deps: SyncDeps, profileId: string | null): Promise<string | null> {
  if (!profileId) return null;
  const { data } = await deps.db.from("google_connections").select("refresh_token_enc").eq("profile_id", profileId).maybeSingle();
  if (!data) return null;
  return deps.api.accessToken(decryptSecret(data.refresh_token_enc, deps.tokenKey));
}

async function columnTitles(deps: SyncDeps, formId: string) {
  const cols = await getResponseColumns(deps.db, formId);
  return new Map(cols.map((c) => [c.id, c]));
}

/** Create the spreadsheet in the linking person's Drive, write the header, then back-fill every response. */
export async function linkFormSheet(
  deps: SyncDeps,
  opts: { formId: string; formTitle: string; profileId: string; sheetName: string },
): Promise<{ status: SyncStatus; url?: string }> {
  const token = await accessTokenFor(deps, opts.profileId);
  if (!token) return { status: "not_connected" };

  const columns = await columnTitles(deps, opts.formId);
  const ids = [...columns.keys()];
  const sheet = await deps.api.createSpreadsheet(token, opts.sheetName, SHEET_TITLE);
  const header: Cell[] = [
    deps.labels.timestamp,
    deps.labels.name,
    deps.labels.email,
    ...ids.map((id) => {
      const c = columns.get(id)!;
      return c.deleted ? `${c.title} (${deps.labels.deleted})` : c.title;
    }),
  ];
  await deps.api.writeRange(token, sheet.id, `${SHEET_TITLE}!A1`, [header]);

  const { error } = await deps.db.from("form_sheets").upsert({
    form_id: opts.formId,
    spreadsheet_id: sheet.id,
    spreadsheet_url: sheet.url,
    columns: ids,
    linked_by: opts.profileId,
    status: "ok",
    last_error: null,
    last_synced_at: null,
    sync_lock_until: null,
  });
  if (error) throw new Error(`form_sheets upsert failed: ${error.message}`);
  // A fresh sheet: every response must be written again.
  await deps.db.from("responses").update({ sheet_synced_at: null }).eq("form_id", opts.formId);

  const result = await syncFormSheet(deps, opts.formId);
  return { status: result.status === "busy" ? "ok" : result.status, url: sheet.url };
}

/**
 * Append every response not yet in the sheet, oldest first, in batches. Only
 * one sync runs per form at a time (database lease); concurrent callers return
 * "busy" because the running sync picks up their rows too.
 */
export async function syncFormSheet(deps: SyncDeps, formId: string): Promise<{ status: SyncStatus; appended: number }> {
  const { data: sheet } = await deps.db.from("form_sheets").select("*").eq("form_id", formId).maybeSingle();
  if (!sheet) return { status: "not_linked", appended: 0 };

  const { data: claimed } = await deps.db.rpc("claim_sheet_sync", { p_form_id: formId, p_seconds: 120 });
  if (!claimed) return { status: "busy", appended: 0 };

  let appended = 0;
  try {
    const token = await accessTokenFor(deps, sheet.linked_by);
    if (!token) throw new GoogleApiError("no Google connection for the person who linked this sheet", 0, "access_revoked");

    // Questions added since linking get new columns at the end of the header.
    const known = (sheet.columns as string[]) ?? [];
    const columns = await columnTitles(deps, formId);
    const added = [...columns.keys()].filter((id) => !known.includes(id));
    let order = known;
    if (added.length > 0) {
      const start = columnLetter(FIXED_COLUMNS + known.length + 1);
      await deps.api.writeRange(token, sheet.spreadsheet_id, `${SHEET_TITLE}!${start}1`, [added.map((id) => columns.get(id)!.title)]);
      order = [...known, ...added];
      await deps.db.from("form_sheets").update({ columns: order }).eq("form_id", formId);
    }

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const { data: pending, error } = await deps.db
        .from("responses")
        .select("id, submitted_at, respondent_name, respondent_email, answers")
        .eq("form_id", formId)
        .is("sheet_synced_at", null)
        .order("submitted_at")
        .order("id")
        .limit(BATCH);
      if (error) throw new Error(`pending responses lookup failed: ${error.message}`);
      if (pending.length === 0) break;

      const rows: Cell[][] = pending.map((r) => {
        const answers = (r.answers ?? {}) as Record<string, unknown>;
        return [
          formatTimestamp(r.submitted_at),
          r.respondent_name ?? "",
          r.respondent_email ?? "",
          ...order.map((id) => {
            const col = columns.get(id);
            return col ? exportCell(col, answers[id]) : "";
          }),
        ];
      });
      await deps.api.appendRows(token, sheet.spreadsheet_id, SHEET_TITLE, rows);
      const { error: markError } = await deps.db
        .from("responses")
        .update({ sheet_synced_at: new Date().toISOString() })
        .in(
          "id",
          pending.map((r) => r.id),
        );
      if (markError) throw new Error(`marking synced rows failed: ${markError.message}`);
      appended += pending.length;
      if (pending.length < BATCH) break;
    }

    await deps.db.from("form_sheets").update({ status: "ok", last_error: null, last_synced_at: new Date().toISOString() }).eq("form_id", formId);
    return { status: "ok", appended };
  } catch (err) {
    const reason: SyncStatus = err instanceof GoogleApiError ? err.reason : "failed";
    await deps.db.from("form_sheets").update({ status: "error", last_error: reason }).eq("form_id", formId);
    if (!(err instanceof GoogleApiError)) console.error("sheet sync failed", formId, err);
    return { status: reason, appended };
  } finally {
    await deps.db.from("form_sheets").update({ sync_lock_until: null }).eq("form_id", formId);
  }
}
