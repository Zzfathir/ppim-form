import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LayoutTemplate, Plus } from "lucide-react";
import { requireSuperadmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { TemplatePublishToggle } from "@/components/admin/template-publish-toggle";
import { createTemplate } from "../actions";

export const metadata = { title: "Manage templates" };

export default async function AdminTemplatesPage() {
  await requireSuperadmin();
  const supabase = await createClient();
  const [{ data: templates, error }, { data: usage }] = await Promise.all([
    supabase.from("templates").select("id, title, description, is_published, questions, categories(name)").order("created_at"),
    supabase.rpc("admin_usage"),
  ]);
  if (error) throw new Error("Failed to load templates");
  const counts = ((usage as { templates?: Record<string, { forms: number }> } | null)?.templates ?? {});
  const t = await getTranslations("admin.templates");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <form action={createTemplate}>
          <Button type="submit">
            <Plus aria-hidden />
            {t("new")}
          </Button>
        </form>
      </div>

      {templates.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {templates.map((tpl) => {
            const qCount = Array.isArray(tpl.questions) ? tpl.questions.length : 0;
            return (
              <li key={tpl.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/templates/${tpl.id}`} className="font-medium hover:underline">
                    {tpl.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {[tpl.categories?.name, t("questions", { count: qCount }), t("usage", { count: counts[tpl.id]?.forms ?? 0 })]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <TemplatePublishToggle id={tpl.id} published={tpl.is_published} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
