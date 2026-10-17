"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveFormSchema, toDraftQuestion, type SaveFormPayload } from "@/lib/forms/schema";
import { toJson, type TemplateQuestion } from "@/lib/questions";
import { errorCode } from "@/lib/action-errors";

/**
 * Server actions for the builder and form lists. Each one runs as the signed-in
 * user, so RLS and the database triggers enforce who may do what; the checks
 * here only exist to return friendly error codes.
 */

export type PublishProblem =
  | "owner_not_active"
  | "department_required"
  | "category_required"
  | "no_questions"
  | "question_untitled"
  | "choice_needs_options"
  | "publish_requires_active_account";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; problems?: PublishProblem[] };

const formId = z.uuid();

async function requireEditor() {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "superadmin"].includes(profile.role)) throw new Error("forbidden");
  return profile;
}

/** "New form" (blank) or "Use this template": creates a draft and opens the builder. */
export async function createForm(formData: FormData) {
  const profile = await requireEditor();
  const templateId = z.uuid().nullable().catch(null).parse(formData.get("templateId") || null);
  const supabase = await createClient();
  const t = await getTranslations("builder");

  let title = t("untitledForm");
  let description: string | null = null;
  let categoryId: string | null = null;
  let questions: TemplateQuestion[] = [{ type: "short_text", title: "", required: false }];

  if (templateId) {
    const { data: template } = await supabase
      .from("templates")
      .select("title, description, category_id, questions")
      .eq("id", templateId)
      .maybeSingle();
    if (template) {
      title = template.title;
      description = template.description;
      categoryId = template.category_id;
      const parsed = Array.isArray(template.questions) ? (template.questions as TemplateQuestion[]) : [];
      if (parsed.length > 0) questions = parsed;
    }
  }

  const { data: form, error } = await supabase
    .from("forms")
    .insert({
      owner_id: profile.id,
      department_id: profile.department_id,
      chapter_id: profile.chapter_id,
      category_id: categoryId,
      template_id: templateId,
      title,
      description,
      confirmation_message: t("defaultConfirmation"),
    })
    .select("id")
    .single();
  if (error || !form) throw new Error(errorCode(error));

  const rows = questions.map((q, position) => {
    const draft = toDraftQuestion({ ...q, id: randomUUID() });
    return {
      id: draft.id,
      form_id: form.id,
      position,
      type: draft.type,
      title: draft.title,
      description: draft.description,
      required: draft.required,
      options: draft.options,
      settings: toJson(draft.settings),
    };
  });
  const { error: qError } = await supabase.from("questions").insert(rows);
  if (qError) throw new Error(errorCode(qError));

  redirect(`/forms/${form.id}`);
}

/** Autosave: the form's editable fields and its full ordered question list. */
export async function saveForm(id: string, payload: SaveFormPayload): Promise<ActionResult<{ savedAt: string }>> {
  if (!formId.safeParse(id).success) return { ok: false, error: "form_not_found" };
  const parsed = saveFormSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_form", {
    p_form_id: id,
    p_form: toJson(parsed.data.form),
    p_questions: toJson(parsed.data.questions),
  });
  if (error) return { ok: false, error: errorCode(error) };
  return { ok: true, savedAt: data ?? new Date().toISOString() };
}

async function openForm(id: string, from: "draft" | "closed"): Promise<ActionResult<{ slug: string }>> {
  const supabase = await createClient();
  const { data: problems } = await supabase.rpc("publish_check", { p_form_id: id });
  if (problems === null) return { ok: false, error: "form_not_found" };
  if (problems.length > 0) return { ok: false, error: "publish_blocked", problems: problems as PublishProblem[] };

  const { data, error } = await supabase
    .from("forms")
    .update({ status: "open" })
    .eq("id", id)
    .eq("status", from)
    .select("share_slug")
    .maybeSingle();
  if (error) {
    const code = errorCode(error);
    const details = error.details?.split(",").filter(Boolean) as PublishProblem[] | undefined;
    if (code === "publish_requires_active_account") return { ok: false, error: code, problems: [code] };
    return { ok: false, error: code, problems: details };
  }
  if (!data) return { ok: false, error: "form_not_found" };
  revalidatePath("/dashboard");
  return { ok: true, slug: data.share_slug };
}

export async function publishForm(id: string): Promise<ActionResult<{ slug: string }>> {
  if (!formId.safeParse(id).success) return { ok: false, error: "form_not_found" };
  return openForm(id, "draft");
}

/** Close/reopen toggle ("Accepting responses"). */
export async function setAcceptingResponses(id: string, accepting: boolean): Promise<ActionResult<{ slug?: string }>> {
  if (!formId.safeParse(id).success) return { ok: false, error: "form_not_found" };
  if (accepting) return openForm(id, "closed");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .update({ status: "closed" })
    .eq("id", id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: errorCode(error) };
  if (!data) return { ok: false, error: "form_not_found" };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function duplicateForm(id: string): Promise<ActionResult<{ id: string }>> {
  if (!formId.safeParse(id).success) return { ok: false, error: "form_not_found" };
  await requireEditor();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_form", { p_form_id: id });
  if (error || !data) return { ok: false, error: errorCode(error) };
  revalidatePath("/dashboard");
  return { ok: true, id: data };
}

export async function deleteForm(id: string): Promise<ActionResult> {
  if (!formId.safeParse(id).success) return { ok: false, error: "form_not_found" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_form", { p_form_id: id });
  if (error) return { ok: false, error: errorCode(error) };
  revalidatePath("/dashboard");
  return { ok: true };
}
