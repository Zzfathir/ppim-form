import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { toDraftQuestion } from "./schema";

export type FormStatus = Database["public"]["Enums"]["form_status"];
export type Option = { id: string; name: string; color?: string; archived?: boolean };
export type Lookups = { departments: Option[]; categories: Option[]; chapters: Option[] };

/**
 * Departments, categories and chapters for pickers. Archived/inactive entries are
 * excluded unless they are currently selected (`keep`), so old forms still display.
 */
export async function getLookups(keep: (string | null | undefined)[] = []): Promise<Lookups> {
  const supabase = await createClient();
  const keepIds = new Set(keep.filter(Boolean) as string[]);
  const [d, c, ch] = await Promise.all([
    supabase.from("departments").select("id, name, color, is_archived").order("name"),
    supabase.from("categories").select("id, name, is_active").order("sort").order("name"),
    supabase.from("chapters").select("id, name, is_archived").order("name"),
  ]);
  if (d.error || c.error || ch.error) throw new Error("Failed to load lookups");
  return {
    departments: d.data
      .filter((x) => !x.is_archived || keepIds.has(x.id))
      .map((x) => ({ id: x.id, name: x.name, color: x.color, archived: x.is_archived })),
    categories: c.data
      .filter((x) => x.is_active || keepIds.has(x.id))
      .map((x) => ({ id: x.id, name: x.name, archived: !x.is_active })),
    chapters: ch.data
      .filter((x) => !x.is_archived || keepIds.has(x.id))
      .map((x) => ({ id: x.id, name: x.name, archived: x.is_archived })),
  };
}

export function canEditForm(profile: Profile, form: { owner_id: string; deleted_at: string | null }): boolean {
  if (form.deleted_at) return false;
  if (profile.status === "suspended") return false;
  return profile.role === "superadmin" || form.owner_id === profile.id;
}

/** Everything the builder needs; null when the form doesn't exist or isn't visible (RLS). */
export const getBuilderData = cache(async (formId: string) => {
  const supabase = await createClient();
  const { data: form } = await supabase.from("forms").select("*").eq("id", formId).is("deleted_at", null).maybeSingle();
  if (!form) return null;

  const [questions, answered, stats, owner] = await Promise.all([
    supabase.from("questions").select("*").eq("form_id", formId).eq("is_deleted", false).order("position"),
    supabase.rpc("answered_question_ids", { p_form_id: formId }),
    supabase.from("form_stats").select("response_count").eq("form_id", formId).maybeSingle(),
    supabase.from("department_members").select("full_name").eq("id", form.owner_id).maybeSingle(),
  ]);
  if (questions.error) throw new Error("Failed to load questions");

  return {
    form,
    questions: questions.data.map(toDraftQuestion),
    answeredIds: (answered.data ?? []) as string[],
    responseCount: stats.data?.response_count ?? 0,
    ownerName: owner.data?.full_name ?? null,
  };
});

export type FormListItem = {
  id: string;
  title: string;
  status: FormStatus;
  share_slug: string;
  updated_at: string;
  owner_id: string;
  department: Option | null;
  category: string | null;
  responseCount: number;
};

/** Forms for the admin dashboard: their own, or their department's (read-only). */
export async function listForms(opts: {
  profile: Profile;
  scope: "mine" | "department";
  query?: string;
  status?: FormStatus;
}): Promise<FormListItem[]> {
  const supabase = await createClient();
  let q = supabase
    .from("forms")
    .select("id, title, status, share_slug, updated_at, owner_id, departments(id, name, color), categories(name)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (opts.scope === "mine") q = q.eq("owner_id", opts.profile.id);
  else q = q.eq("department_id", opts.profile.department_id!).neq("owner_id", opts.profile.id);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.query) q = q.ilike("title", `%${opts.query.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);

  const { data, error } = await q;
  if (error) throw new Error("Failed to load forms");
  if (data.length === 0) return [];

  const { data: stats } = await supabase
    .from("form_stats")
    .select("form_id, response_count")
    .in("form_id", data.map((f) => f.id));
  const counts = new Map((stats ?? []).map((s) => [s.form_id, s.response_count ?? 0]));

  return data.map((f) => ({
    id: f.id,
    title: f.title,
    status: f.status,
    share_slug: f.share_slug,
    updated_at: f.updated_at,
    owner_id: f.owner_id,
    department: f.departments ? { id: f.departments.id, name: f.departments.name, color: f.departments.color } : null,
    category: f.categories?.name ?? null,
    responseCount: counts.get(f.id) ?? 0,
  }));
}
