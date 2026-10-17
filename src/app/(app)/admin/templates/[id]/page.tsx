import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/forms/queries";
import { toDraftQuestion } from "@/lib/forms/schema";
import type { TemplateQuestion } from "@/lib/questions";
import { TemplateEditor } from "@/components/admin/template-editor";

export const metadata = { title: "Edit template" };

export default async function TemplateEditPage({ params }: PageProps<"/admin/templates/[id]">) {
  await requireSuperadmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: tpl } = await supabase.from("templates").select("*").eq("id", id).maybeSingle();
  if (!tpl) notFound();
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
    />
  );
}
