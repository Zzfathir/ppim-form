import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/forms/queries";
import { toDraftQuestion } from "@/lib/forms/schema";
import { shareUrl } from "@/lib/forms/share";
import { bannerUrl, type BannerStyle } from "@/lib/forms/banner";
import { AdminFormDetail } from "@/components/admin/form-detail";

export const metadata: Metadata = { title: "Form" };

export default async function AdminFormPage({ params }: PageProps<"/admin/forms/[id]">) {
  await requireSuperadmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  // Superadmins see every form, including soft-deleted ones (so they can restore them).
  const { data: form } = await supabase.from("forms").select("*").eq("id", id).maybeSingle();
  if (!form) notFound();

  const [questions, stats, owner, people, lookups] = await Promise.all([
    supabase.from("questions").select("*").eq("form_id", id).eq("is_deleted", false).order("position"),
    supabase.from("form_stats").select("response_count, last_response_at").eq("form_id", id).maybeSingle(),
    supabase.from("profiles").select("id, full_name, email, status").eq("id", form.owner_id).maybeSingle(),
    supabase.rpc("admin_people"),
    getLookups([form.department_id, form.category_id, form.chapter_id]),
  ]);

  return (
    <AdminFormDetail
      form={{
        id: form.id,
        title: form.title,
        description: form.description,
        status: form.status,
        department_id: form.department_id,
        category_id: form.category_id,
        chapter_id: form.chapter_id,
        requires_login: form.requires_login,
        limit_one_response: form.limit_one_response,
        collect_name: form.collect_name,
        name_required: form.name_required,
        banner_url: bannerUrl(form.banner_path),
        banner_style: form.banner_style as BannerStyle,
        created_at: form.created_at,
        published_at: form.published_at,
        closed_at: form.closed_at,
        deleted_at: form.deleted_at,
        share_url: shareUrl(form.share_slug),
      }}
      questions={(questions.data ?? []).map(toDraftQuestion)}
      responseCount={stats.data?.response_count ?? 0}
      lastResponseAt={stats.data?.last_response_at ?? null}
      owner={owner.data ? { id: owner.data.id, name: owner.data.full_name ?? owner.data.email, email: owner.data.email, status: owner.data.status } : null}
      people={(people.data ?? [])
        .filter((p) => p.status !== "suspended")
        .map((p) => ({ id: p.id, name: p.full_name ?? p.email, email: p.email }))}
      lookups={lookups}
    />
  );
}
