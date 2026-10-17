import { redirect } from "next/navigation";

/** Templates are edited at /templates/{id} (one editor for everyone). */
export default async function LegacyTemplateEditPage({ params }: PageProps<"/admin/templates/[id]">) {
  const { id } = await params;
  redirect(`/templates/${id}`);
}
