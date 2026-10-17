import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/forms/queries";
import { toDraftQuestion } from "@/lib/forms/schema";
import type { TemplateQuestion } from "@/lib/questions";
import { TemplateEditor } from "@/components/templates/template-editor";

export const metadata = { title: "Edit template" };

/** Template editor for its creator (or a superadmin). Everyone else is sent back to the gallery. */
export default async function TemplateEditPage({ params }: PageProps<"/templates/[id]">) {
  const profile = await requireStaff("/templates");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: tpl } = await supabase.from("templates").select("*").eq("id", id).maybeSingle();
  if (!tpl) notFound();

  const isSuper = profile.role === "superadmin" && profile.status === "active";
  const canEdit = isSuper || (tpl.created_by === profile.id && !tpl.is_official);
  if (!canEdit) redirect("/templates");

  const lookups = await getLookups([tpl.category_id]);
  const questions = (Array.isArray(tpl.questions) ? (tpl.questions as TemplateQuestion[]) : []).map((q) =>
    // Template questions have no ids; give each a stable id for editing (dropped again on save).
    toDraftQuestion({ ...q, id: randomUUID() }),
  );

  return (
    <TemplateEditor
      id={tpl.id}
      initial={{
        title: tpl.title,
        description: tpl.description,
        category_id: tpl.category_id,
        is_published: tpl.is_published,
        questions,
      }}
      categories={lookups.categories}
      official={tpl.is_official}
      canShare={!tpl.is_official}
      backHref={tpl.is_official && isSuper ? "/admin/templates" : "/templates"}
    />
  );
}
