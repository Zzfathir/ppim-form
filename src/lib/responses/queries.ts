import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isAnswerable } from "@/lib/questions";
import type { ResponseColumn, ResponseRow } from "./format";

type Db = SupabaseClient<Database>;

/**
 * Table/export columns in form order: current questions, plus deleted ones that
 * still hold answers (so old data is never silently dropped from exports).
 */
export async function getResponseColumns(db: Db, formId: string): Promise<ResponseColumn[]> {
  const [{ data: questions, error }, { data: answered }] = await Promise.all([
    db.from("questions").select("id, title, type, is_deleted").eq("form_id", formId).order("position"),
    db.rpc("answered_question_ids", { p_form_id: formId }),
  ]);
  if (error) throw new Error(`questions lookup failed: ${error.message}`);
  const answeredIds = new Set((answered ?? []) as string[]);
  return questions
    .filter((q) => isAnswerable(q) && (!q.is_deleted || answeredIds.has(q.id)))
    .map((q) => ({ id: q.id, title: q.title, type: q.type, deleted: q.is_deleted }));
}

/** Every response of a form, oldest first, fetched in pages (PostgREST caps rows per request). */
export async function fetchAllResponses(db: Db, formId: string): Promise<ResponseRow[]> {
  const pageSize = 1000;
  const rows: ResponseRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("responses")
      .select("id, submitted_at, respondent_name, respondent_email, answers")
      .eq("form_id", formId)
      .order("submitted_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`responses lookup failed: ${error.message}`);
    rows.push(...data.map((r) => ({ ...r, answers: (r.answers ?? {}) as Record<string, unknown> })));
    if (data.length < pageSize) return rows;
  }
}
