import { getTranslations } from "next-intl/server";
import { FilePlus2, LayoutTemplate } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { NewFormButton } from "@/components/forms/new-form-button";
import type { TemplateQuestion } from "@/lib/questions";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  await requireStaff("/templates");
  const t = await getTranslations("templates");
  const supabase = await createClient();
  const { data: templates, error } = await supabase
    .from("templates")
    .select("id, title, description, questions, categories(name)")
    .eq("is_published", true)
    .order("created_at");
  if (error) throw new Error("Failed to load templates");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li className="flex flex-col rounded-2xl border border-dashed bg-card p-5">
          <div className="flex size-10 items-center justify-center rounded-full bg-brand-soft">
            <FilePlus2 className="size-5 text-brand" aria-hidden />
          </div>
          <h2 className="mt-3 text-base font-semibold">{t("blank")}</h2>
          <p className="mt-1 flex-1 text-sm text-muted-foreground">{t("blankDescription")}</p>
          <div className="mt-4">
            <NewFormButton variant="outline" />
          </div>
        </li>

        {templates.map((tpl) => {
          const questions = Array.isArray(tpl.questions) ? (tpl.questions as TemplateQuestion[]) : [];
          return (
            <li key={tpl.id} className="flex flex-col rounded-2xl border bg-card p-5 shadow-xs">
              {tpl.categories?.name && (
                <span className="self-start rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {tpl.categories.name}
                </span>
              )}
              <h2 className="mt-3 text-base font-semibold">{tpl.title}</h2>
              {tpl.description && <p className="mt-1 text-sm text-muted-foreground">{tpl.description}</p>}
              <ul className="mt-3 flex-1 space-y-1 text-sm text-muted-foreground" aria-label={t("questionCount", { count: questions.length })}>
                {questions.slice(0, 3).map((q, i) => (
                  <li key={i} className="truncate before:mr-2 before:text-border before:content-['—']">
                    {q.title}
                  </li>
                ))}
                {questions.length > 3 && <li className="text-xs">+{questions.length - 3}</li>}
              </ul>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{t("questionCount", { count: questions.length })}</span>
                <NewFormButton templateId={tpl.id} label={t("use")} />
              </div>
            </li>
          );
        })}
      </ul>

      {templates.length === 0 && (
        <EmptyState icon={LayoutTemplate} title={t("emptyTitle")} body={t("emptyBody")} className="mt-6" />
      )}
    </div>
  );
}
