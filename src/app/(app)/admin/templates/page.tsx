import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LayoutTemplate, Plus } from "lucide-react";
import { requireSuperadmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { TemplatePublishToggle } from "@/components/admin/template-publish-toggle";
import { createTemplate } from "../actions";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("manageTemplates");

/** Oversight of every template: official ones (publish toggle) and each department's own. */
export default async function AdminTemplatesPage() {
  await requireSuperadmin();
  const supabase = await createClient();
  const [{ data: templates, error }, { data: usage }, { data: people }, { data: shares }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, title, is_official, is_published, questions, created_by, categories(name), departments(name, color)")
      .order("is_official", { ascending: false })
      .order("created_at"),
    supabase.rpc("admin_usage"),
    supabase.rpc("admin_people"),
    supabase.from("template_shares").select("template_id"),
  ]);
  if (error) throw new Error("Failed to load templates");
  const counts = (usage as { templates?: Record<string, { forms: number }> } | null)?.templates ?? {};
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email]));
  const shareCount = new Map<string, number>();
  for (const s of shares ?? []) shareCount.set(s.template_id, (shareCount.get(s.template_id) ?? 0) + 1);
  const t = await getTranslations("admin.templates");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
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
            const scope = tpl.is_official ? t("official") : (tpl.departments?.name ?? "—");
            const creator = tpl.created_by ? names.get(tpl.created_by) : null;
            return (
              <li key={tpl.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/templates/${tpl.id}`} className="font-medium hover:underline">
                    {tpl.title}
                  </Link>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                      {!tpl.is_official && tpl.departments && (
                        <span className="size-2 rounded-full" style={{ backgroundColor: tpl.departments.color }} aria-hidden />
                      )}
                      {scope}
                    </span>
                    {[
                      creator && !tpl.is_official ? t("by", { name: creator }) : null,
                      tpl.categories?.name,
                      t("questions", { count: qCount }),
                      t("usage", { count: counts[tpl.id]?.forms ?? 0 }),
                      !tpl.is_official && shareCount.get(tpl.id) ? t("shares", { count: shareCount.get(tpl.id)! }) : null,
                    ]
                      .filter(Boolean)
                      .map((part, i) => (
                        <span key={i}>· {part}</span>
                      ))}
                  </p>
                </div>
                {tpl.is_official && <TemplatePublishToggle id={tpl.id} published={tpl.is_published} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
