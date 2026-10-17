"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { errorCode, type ErrorCode } from "@/lib/action-errors";
import { draftQuestionSchema, LIMITS, toDraftQuestion, toTemplateQuestion } from "@/lib/forms/schema";
import { toJson } from "@/lib/questions";
import type { Database } from "@/lib/database.types";

/**
 * Secretary (superadmin) actions. Each checks the role here for a friendly
 * error, and runs as the signed-in user so RLS and the database triggers
 * enforce the same rules (and write the activity log).
 */

export type AdminResult<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode };

type FormStatus = Database["public"]["Enums"]["form_status"];
const id = z.uuid();
const fail = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });

async function superadminClient() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "superadmin" || profile.status === "suspended") return null;
  return { supabase: await createClient(), profile };
}

function done(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
  return { ok: true as const };
}

// --------------------------------------------------------------------------
// People
// --------------------------------------------------------------------------

type PersonChange = "approve" | "reject" | "suspend" | "restore" | "promote" | "demote";

const CHANGES: Record<PersonChange, Database["public"]["Tables"]["profiles"]["Update"]> = {
  approve: { status: "active" },
  reject: { role: "respondent", status: "active" },
  suspend: { status: "suspended" },
  restore: { status: "active" },
  promote: { role: "superadmin", status: "active" },
  demote: { role: "admin" },
};

export async function changePerson(personId: string, change: PersonChange): Promise<AdminResult> {
  if (!id.safeParse(personId).success || !(change in CHANGES)) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  if (personId === ctx.profile.id) return fail("cannot_change_own_access");
  const { data, error } = await ctx.supabase.from("profiles").update(CHANGES[change]).eq("id", personId).select("id");
  if (error) return fail(errorCode(error));
  if (!data?.length) return fail("invalid");
  return done("/admin/people", "/admin");
}

export async function setPersonDepartment(personId: string, departmentId: string): Promise<AdminResult> {
  if (!id.safeParse(personId).success || !id.safeParse(departmentId).success) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const { error } = await ctx.supabase.from("profiles").update({ department_id: departmentId }).eq("id", personId);
  if (error) return fail(errorCode(error));
  return done("/admin/people");
}

/** Hand every form of one person to another admin (PRD A6). */
export async function transferAllForms(fromId: string, toId: string): Promise<AdminResult<{ count: number }>> {
  if (!id.safeParse(fromId).success || !id.safeParse(toId).success) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const { data, error } = await ctx.supabase.rpc("transfer_forms", { p_from: fromId, p_to: toId });
  if (error) return fail(errorCode(error));
  done("/admin/people", "/admin/forms");
  return { ok: true, count: data ?? 0 };
}

// --------------------------------------------------------------------------
// Forms (registry / detail)
// --------------------------------------------------------------------------

/** Close, reopen, archive or restore an archived form. Open → archived closes first. */
export async function setFormStatus(formId: string, status: Exclude<FormStatus, "draft">): Promise<AdminResult> {
  if (!id.safeParse(formId).success || !["open", "closed", "archived"].includes(status)) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const { data: form } = await ctx.supabase.from("forms").select("status").eq("id", formId).maybeSingle();
  if (!form) return fail("form_not_found");

  if (status === "archived" && form.status === "open") {
    const close = await ctx.supabase.from("forms").update({ status: "closed" }).eq("id", formId);
    if (close.error) return fail(errorCode(close.error));
  }
  const { error } = await ctx.supabase.from("forms").update({ status }).eq("id", formId);
  if (error) return fail(errorCode(error));
  return done(`/admin/forms/${formId}`, "/admin/forms", "/admin");
}

const retagSchema = z.object({
  department_id: z.uuid(),
  category_id: z.uuid(),
  chapter_id: z.uuid().nullable(),
});

export async function retagForm(formId: string, tags: z.input<typeof retagSchema>): Promise<AdminResult> {
  const parsed = retagSchema.safeParse(tags);
  if (!id.safeParse(formId).success || !parsed.success) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const { error } = await ctx.supabase.from("forms").update(parsed.data).eq("id", formId);
  if (error) return fail(errorCode(error));
  return done(`/admin/forms/${formId}`, "/admin/forms", "/admin");
}

export async function transferForm(formId: string, ownerId: string): Promise<AdminResult> {
  if (!id.safeParse(formId).success || !id.safeParse(ownerId).success) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const { data: target } = await ctx.supabase.from("profiles").select("role, status").eq("id", ownerId).maybeSingle();
  if (!target || !["admin", "superadmin"].includes(target.role) || target.status === "suspended") return fail("invalid_target");
  const { error } = await ctx.supabase.from("forms").update({ owner_id: ownerId }).eq("id", formId);
  if (error) return fail(errorCode(error));
  return done(`/admin/forms/${formId}`, "/admin/forms");
}

export async function deleteFormAdmin(formId: string): Promise<AdminResult> {
  if (!id.safeParse(formId).success) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const { error } = await ctx.supabase.rpc("soft_delete_form", { p_form_id: formId });
  if (error) return fail(errorCode(error));
  return done(`/admin/forms/${formId}`, "/admin/forms", "/admin");
}

export async function restoreDeletedForm(formId: string): Promise<AdminResult> {
  if (!id.safeParse(formId).success) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const { error } = await ctx.supabase.from("forms").update({ deleted_at: null }).eq("id", formId);
  if (error) return fail(errorCode(error));
  return done(`/admin/forms/${formId}`, "/admin/forms", "/admin");
}

// --------------------------------------------------------------------------
// Departments, chapters, categories
// --------------------------------------------------------------------------

const lookupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  sort: z.number().int().min(0).max(1000).optional(),
});

type LookupTable = "departments" | "chapters" | "categories";
const LOOKUP_PATHS: Record<LookupTable, string> = {
  departments: "/admin/departments",
  chapters: "/admin/chapters",
  categories: "/admin/categories",
};

export async function saveLookup(table: LookupTable, lookupId: string | null, values: z.input<typeof lookupSchema>): Promise<AdminResult> {
  if (!(table in LOOKUP_PATHS)) return fail("invalid");
  const parsed = lookupSchema.safeParse(values);
  if (!parsed.success || (lookupId !== null && !id.safeParse(lookupId).success)) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");

  const row =
    table === "departments"
      ? { name: parsed.data.name, description: parsed.data.description || null, ...(parsed.data.color ? { color: parsed.data.color } : {}) }
      : table === "chapters"
        ? { name: parsed.data.name, description: parsed.data.description || null }
        : { name: parsed.data.name, ...(parsed.data.sort !== undefined ? { sort: parsed.data.sort } : {}) };

  const { error } = lookupId
    ? await ctx.supabase.from(table).update(row).eq("id", lookupId)
    : await ctx.supabase.from(table).insert(row as never);
  if (error) return fail(errorCode(error));
  return done(LOOKUP_PATHS[table]);
}

/** Archive/restore (departments, chapters) or deactivate/activate (categories). Never deletes data. */
export async function setLookupArchived(table: LookupTable, lookupId: string, archived: boolean): Promise<AdminResult> {
  if (!(table in LOOKUP_PATHS) || !id.safeParse(lookupId).success) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const { error } =
    table === "categories"
      ? await ctx.supabase.from("categories").update({ is_active: !archived }).eq("id", lookupId)
      : await ctx.supabase.from(table).update({ is_archived: archived }).eq("id", lookupId);
  if (error) return fail(errorCode(error));
  return done(LOOKUP_PATHS[table]);
}

/** Hard delete, only for entries nothing points to (the database refuses otherwise → "in_use"). */
export async function deleteLookup(table: LookupTable, lookupId: string): Promise<AdminResult> {
  if (!(table in LOOKUP_PATHS) || !id.safeParse(lookupId).success) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const { data: usage } = await ctx.supabase.rpc("admin_usage");
  const counts = (usage as Record<string, Record<string, Record<string, number>>> | null)?.[table]?.[lookupId];
  if (counts && Object.values(counts).some((n) => n > 0)) return fail("in_use");
  const { error } = await ctx.supabase.from(table).delete().eq("id", lookupId);
  if (error) return fail(errorCode(error));
  return done(LOOKUP_PATHS[table]);
}

// --------------------------------------------------------------------------
// Templates
// --------------------------------------------------------------------------

const templateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(LIMITS.formDescription).nullable(),
  category_id: z.uuid().nullable(),
  is_published: z.boolean(),
  questions: z.array(draftQuestionSchema).max(LIMITS.questions),
});

export async function createTemplate(): Promise<void> {
  const ctx = await superadminClient();
  if (!ctx) throw new Error("forbidden");
  const { data, error } = await ctx.supabase
    .from("templates")
    .insert({ title: "Untitled template", is_published: false, created_by: ctx.profile.id, questions: [] })
    .select("id")
    .single();
  if (error || !data) throw new Error(errorCode(error));
  redirect(`/admin/templates/${data.id}`);
}

export async function saveTemplate(templateId: string, values: z.input<typeof templateSchema>): Promise<AdminResult> {
  const parsed = templateSchema.safeParse(values);
  if (!id.safeParse(templateId).success || !parsed.success) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const questions = parsed.data.questions.map(toTemplateQuestion);
  const { error } = await ctx.supabase
    .from("templates")
    .update({ ...parsed.data, questions: toJson(questions) })
    .eq("id", templateId);
  if (error) return fail(errorCode(error));
  revalidatePath("/admin/templates");
  revalidatePath("/templates");
  return { ok: true };
}

export async function setTemplatePublished(templateId: string, published: boolean): Promise<AdminResult> {
  if (!id.safeParse(templateId).success) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const { error } = await ctx.supabase.from("templates").update({ is_published: published }).eq("id", templateId);
  if (error) return fail(errorCode(error));
  return done("/admin/templates", "/templates");
}

export async function deleteTemplate(templateId: string): Promise<AdminResult> {
  if (!id.safeParse(templateId).success) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  // Forms keep working: forms.template_id is set to null (usage history for this template is lost).
  const { error } = await ctx.supabase.from("templates").delete().eq("id", templateId);
  if (error) return fail(errorCode(error));
  return done("/admin/templates", "/templates");
}

/** "Save this form as a template" (O9): copies title, description, category and questions, unpublished. */
export async function saveFormAsTemplate(formId: string): Promise<AdminResult<{ id: string }>> {
  if (!id.safeParse(formId).success) return fail("invalid");
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const [{ data: form }, { data: questions }] = await Promise.all([
    ctx.supabase.from("forms").select("title, description, category_id").eq("id", formId).maybeSingle(),
    ctx.supabase.from("questions").select("*").eq("form_id", formId).eq("is_deleted", false).order("position"),
  ]);
  if (!form) return fail("form_not_found");
  const templateQuestions = (questions ?? []).map((q) => toTemplateQuestion(toDraftQuestion(q)));
  const { data, error } = await ctx.supabase
    .from("templates")
    .insert({
      title: form.title,
      description: form.description,
      category_id: form.category_id,
      questions: toJson(templateQuestions),
      is_published: false,
      created_by: ctx.profile.id,
    })
    .select("id")
    .single();
  if (error || !data) return fail(errorCode(error));
  revalidatePath("/admin/templates");
  return { ok: true, id: data.id };
}

// --------------------------------------------------------------------------
// Settings
// --------------------------------------------------------------------------

export async function setRequireApproval(value: boolean): Promise<AdminResult> {
  const ctx = await superadminClient();
  if (!ctx) return fail("forbidden");
  const { error } = await ctx.supabase.from("app_settings").update({ require_admin_approval: value }).eq("id", true);
  if (error) return fail(errorCode(error));
  return done("/admin/settings");
}
