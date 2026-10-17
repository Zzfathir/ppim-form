"use server";

import { z } from "zod";
import { appConfig } from "@/config/app";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getResponseColumns } from "@/lib/responses/queries";
import type { ResponseColumn, ResponseRow } from "@/lib/responses/format";

/**
 * Read-only data for the Responses tab. Runs as the signed-in user: RLS limits
 * it to the owner, same-department admins and superadmins.
 */

export type ChoiceStats = { question_id: string; answered: number; counts: Record<string, number> };
export type ScaleStats = { question_id: string; answered: number; average: number | null; counts: Record<string, number> };
export type DateStats = { question_id: string; answered: number; dates: { value: string; count: number }[] };
export type TextStats = { question_id: string; answered: number; latest: string[] };
export type QuestionStats = ChoiceStats | ScaleStats | DateStats | TextStats;
export type Summary = { total: number; questions: QuestionStats[] };

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function staffClient() {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "superadmin"].includes(profile.role)) return null;
  return createClient();
}

export async function getSummary(formId: string): Promise<Result<Summary>> {
  if (!z.uuid().safeParse(formId).success) return { ok: false, error: "form_not_found" };
  const supabase = await staffClient();
  if (!supabase) return { ok: false, error: "forbidden" };
  const { data, error } = await supabase.rpc("form_summary", { p_form_id: formId });
  if (error) return { ok: false, error: error.message.includes("form_not_found") ? "form_not_found" : "unknown" };
  return { ok: true, data: data as unknown as Summary };
}

const pageSchema = z.object({
  query: z.string().trim().max(200).optional(),
  sort: z.union([z.enum(["submitted_at", "respondent_name", "respondent_email"]), z.uuid()]).default("submitted_at"),
  desc: z.boolean().default(true),
  page: z.number().int().min(0).max(100_000).default(0),
});

export type ResponsesPage = { columns: ResponseColumn[]; rows: ResponseRow[]; total: number; pageSize: number };

export async function getResponsesPage(formId: string, params: z.input<typeof pageSchema>): Promise<Result<ResponsesPage>> {
  if (!z.uuid().safeParse(formId).success) return { ok: false, error: "form_not_found" };
  const parsed = pageSchema.safeParse(params);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await staffClient();
  if (!supabase) return { ok: false, error: "forbidden" };

  const pageSize = appConfig.responsesPageSize;
  const [columns, page] = await Promise.all([
    getResponseColumns(supabase, formId),
    supabase.rpc("responses_page", {
      p_form_id: formId,
      p_query: parsed.data.query || undefined,
      p_sort: parsed.data.sort,
      p_desc: parsed.data.desc,
      p_limit: pageSize,
      p_offset: parsed.data.page * pageSize,
    }),
  ]);
  if (page.error) return { ok: false, error: "unknown" };

  return {
    ok: true,
    data: {
      columns,
      rows: page.data.map((r) => ({
        id: r.id,
        submitted_at: r.submitted_at,
        respondent_name: r.respondent_name,
        respondent_email: r.respondent_email,
        answers: (r.answers ?? {}) as Record<string, unknown>,
      })),
      total: Number(page.data[0]?.total_count ?? 0),
      pageSize,
    },
  };
}
