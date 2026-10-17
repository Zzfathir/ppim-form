"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { errorCode, type ErrorCode } from "@/lib/action-errors";
import { draftQuestionSchema, LIMITS, toDraftQuestion, toTemplateQuestion } from "@/lib/forms/schema";
import { toJson, type TemplateQuestion } from "@/lib/questions";

/**
 * Templates for every admin (owner revision): create, edit own, copy, share.
 * The database decides visibility and edit rights (RLS + trigger); these
 * checks only produce friendly errors.
 */

export type TemplateResult<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode };
const id = z.uuid();
const fail = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });

async function staff() {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "superadmin"].includes(profile.role) || profile.status === "suspended") return null;
  return { profile, supabase: await createClient() };
}

function refresh() {
  revalidatePath("/templates");
  revalidatePath("/admin/templates");
}

/** "New template" on the Templates page: an empty template owned by me, visible to my department. */
export async function createMyTemplate(): Promise<void> {
  const ctx = await staff();
  if (!ctx) throw new Error("forbidden");
  const t = await getTranslations("templates");
  const { data, error } = await ctx.supabase
    .from("templates")
    .insert({ title: t("untitled"), questions: [], created_by: ctx.profile.id })
    .select("id")
    .single();
  if (error || !data) throw new Error(errorCode(error));
  refresh();
  redirect(`/templates/${data.id}`);
}

const templateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(LIMITS.formDescription).nullable(),
  category_id: z.uuid().nullable(),
  is_published: z.boolean(),
  questions: z.array(draftQuestionSchema).max(LIMITS.questions),
});

/** Autosave from the template editor. `is_published` only takes effect for superadmins (official templates). */
export async function saveTemplate(templateId: string, values: z.input<typeof templateSchema>): Promise<TemplateResult> {
  const parsed = templateSchema.safeParse(values);
  if (!id.safeParse(templateId).success || !parsed.success) return fail("invalid");
  const ctx = await staff();
  if (!ctx) return fail("forbidden");
  const { data, error } = await ctx.supabase
    .from("templates")
    .update({ ...parsed.data, questions: toJson(parsed.data.questions.map(toTemplateQuestion)) })
    .eq("id", templateId)
    .select("id");
  if (error) return fail(errorCode(error));
  if (!data?.length) return fail("forbidden");
  return { ok: true };
}

export async function deleteTemplate(templateId: string): Promise<TemplateResult> {
  if (!id.safeParse(templateId).success) return fail("invalid");
  const ctx = await staff();
  if (!ctx) return fail("forbidden");
  // Forms made from it keep working (template_id becomes null).
  const { data, error } = await ctx.supabase.from("templates").delete().eq("id", templateId).select("id");
  if (error) return fail(errorCode(error));
  if (!data?.length) return fail("forbidden");
  refresh();
  return { ok: true };
}

/** "Make a copy" of any template I can see: a new template owned by me, then open it. */
export async function copyTemplate(templateId: string): Promise<TemplateResult<{ id: string }>> {
  if (!id.safeParse(templateId).success) return fail("invalid");
  const ctx = await staff();
  if (!ctx) return fail("forbidden");
  const { data: src } = await ctx.supabase.from("templates").select("title, description, category_id, questions").eq("id", templateId).maybeSingle();
  if (!src) return fail("form_not_found");
  const t = await getTranslations("templates");
  const { data, error } = await ctx.supabase
    .from("templates")
    .insert({
      title: t("copyOf", { title: src.title }).slice(0, 200),
      description: src.description,
      category_id: src.category_id,
      questions: src.questions,
      created_by: ctx.profile.id,
    })
    .select("id")
    .single();
  if (error || !data) return fail(errorCode(error));
  refresh();
  return { ok: true, id: data.id };
}

/** "Save as template" from the builder: copies a form I can read into a new template of mine. */
export async function saveFormAsMyTemplate(formId: string): Promise<TemplateResult<{ id: string }>> {
  if (!id.safeParse(formId).success) return fail("invalid");
  const ctx = await staff();
  if (!ctx) return fail("forbidden");
  const [{ data: form }, { data: questions }] = await Promise.all([
    ctx.supabase.from("forms").select("title, description, category_id").eq("id", formId).maybeSingle(),
    ctx.supabase.from("questions").select("*").eq("form_id", formId).eq("is_deleted", false).order("position"),
  ]);
  if (!form) return fail("form_not_found");
  const templateQuestions: TemplateQuestion[] = (questions ?? []).map((q) => toTemplateQuestion(toDraftQuestion(q)));
  const { data, error } = await ctx.supabase
    .from("templates")
    .insert({
      title: form.title,
      description: form.description,
      category_id: form.category_id,
      questions: toJson(templateQuestions),
      created_by: ctx.profile.id,
    })
    .select("id")
    .single();
  if (error || !data) return fail(errorCode(error));
  refresh();
  return { ok: true, id: data.id };
}

// --------------------------------------------------------------------------
// Sharing
// --------------------------------------------------------------------------

export type Share = { id: string; kind: "person" | "department"; targetId: string; label: string; detail: string | null };
export type ShareData = {
  shares: Share[];
  people: { id: string; name: string; department: string | null }[];
  departments: { id: string; name: string; color: string }[];
  ownDepartmentId: string | null;
};

export async function getShareData(templateId: string): Promise<TemplateResult<{ data: ShareData }>> {
  if (!id.safeParse(templateId).success) return fail("invalid");
  const ctx = await staff();
  if (!ctx) return fail("forbidden");
  const [{ data: template }, shares, people, departments] = await Promise.all([
    ctx.supabase.from("templates").select("department_id").eq("id", templateId).maybeSingle(),
    ctx.supabase.from("template_shares").select("id, profile_id, department_id").eq("template_id", templateId).order("created_at"),
    ctx.supabase.rpc("share_directory"),
    ctx.supabase.from("departments").select("id, name, color").eq("is_archived", false).order("name"),
  ]);
  if (!template || shares.error) return fail("forbidden");

  const personName = new Map((people.data ?? []).map((p) => [p.id, p]));
  const deptName = new Map((departments.data ?? []).map((d) => [d.id, d.name]));
  return {
    ok: true,
    data: {
      ownDepartmentId: template.department_id,
      shares: shares.data.map((s) =>
        s.profile_id
          ? {
              id: s.id,
              kind: "person" as const,
              targetId: s.profile_id,
              label: personName.get(s.profile_id)?.full_name ?? "—",
              detail: personName.get(s.profile_id)?.department_name ?? null,
            }
          : { id: s.id, kind: "department" as const, targetId: s.department_id!, label: deptName.get(s.department_id!) ?? "—", detail: null },
      ),
      people: (people.data ?? []).map((p) => ({ id: p.id, name: p.full_name, department: p.department_name })),
      departments: departments.data ?? [],
    },
  };
}

export async function addShare(templateId: string, target: { kind: "person" | "department"; id: string }): Promise<TemplateResult> {
  if (!id.safeParse(templateId).success || !id.safeParse(target.id).success) return fail("invalid");
  const ctx = await staff();
  if (!ctx) return fail("forbidden");
  const { error } = await ctx.supabase.from("template_shares").insert({
    template_id: templateId,
    created_by: ctx.profile.id,
    ...(target.kind === "person" ? { profile_id: target.id } : { department_id: target.id }),
  });
  if (error) return fail(error.code === "23505" ? "duplicate_name" : errorCode(error));
  refresh();
  return { ok: true };
}

export async function removeShare(shareId: string): Promise<TemplateResult> {
  if (!id.safeParse(shareId).success) return fail("invalid");
  const ctx = await staff();
  if (!ctx) return fail("forbidden");
  const { data, error } = await ctx.supabase.from("template_shares").delete().eq("id", shareId).select("id");
  if (error) return fail(errorCode(error));
  if (!data?.length) return fail("forbidden");
  refresh();
  return { ok: true };
}
