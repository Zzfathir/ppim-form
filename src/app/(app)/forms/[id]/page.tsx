import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { canEditForm, getBuilderData, getLookups } from "@/lib/forms/queries";
import { shareUrl } from "@/lib/forms/share";
import { FormEditor } from "@/components/builder/form-editor";

export async function generateMetadata({ params }: PageProps<"/forms/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return {};
  const data = await getBuilderData(id);
  return { title: data?.form.title };
}

export default async function FormBuilderPage({ params }: PageProps<"/forms/[id]">) {
  const profile = await requireStaff();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  // RLS decides visibility: owner, same department (read-only) or superadmin.
  const data = await getBuilderData(id);
  if (!data) notFound();
  const { form } = data;

  const lookups = await getLookups([form.department_id, form.category_id, form.chapter_id]);
  const editable = canEditForm(profile, form);

  return (
    <FormEditor
      key={form.id}
      formId={form.id}
      initialForm={{
        title: form.title,
        description: form.description,
        department_id: form.department_id,
        category_id: form.category_id,
        chapter_id: form.chapter_id,
        requires_login: form.requires_login,
        limit_one_response: form.limit_one_response,
        collect_name: form.collect_name,
        confirmation_message: form.confirmation_message,
      }}
      initialQuestions={data.questions}
      initialStatus={form.status}
      shareUrl={shareUrl(form.share_slug)}
      lookups={lookups}
      readOnly={!editable}
      accountActive={profile.status === "active"}
      answeredIds={data.answeredIds}
      responseCount={data.responseCount}
      ownerName={data.ownerName}
      backHref={profile.role === "superadmin" ? "/admin/forms" : "/dashboard"}
    />
  );
}
