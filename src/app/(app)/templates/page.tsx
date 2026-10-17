import { getTranslations } from "next-intl/server";
import { FilePlus2, Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { NewFormButton } from "@/components/forms/new-form-button";
import { TemplateCard, type TemplateCardData } from "@/components/templates/template-card";
import type { TemplateQuestion } from "@/lib/questions";
import { createMyTemplate } from "./actions";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const profile = await requireStaff("/templates");
  const t = await getTranslations("templates");
  const supabase = await createClient();

  // RLS returns exactly the templates this person may see.
  const [{ data: rows, error }, { data: shares }, { data: people }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, title, description, questions, is_official, is_published, created_by, department_id, created_at, categories(name), departments(name, color)")
      .order("created_at"),
    supabase.from("template_shares").select("template_id, profile_id, department_id"),
    supabase.rpc("share_directory"),
  ]);
  if (error) throw new Error("Failed to load templates");

  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const shareCount = new Map<string, number>();
  for (const s of shares ?? []) shareCount.set(s.template_id, (shareCount.get(s.template_id) ?? 0) + 1);
  // Superadmins can read every share; for them "shared with me" means shares that target them.
  const sharedWithMe = new Set(
    (shares ?? []).filter((s) => s.profile_id === profile.id || (s.department_id && s.department_id === profile.department_id)).map((s) => s.template_id),
  );

  const toCard = (r: NonNullable<typeof rows>[number]): TemplateCardData => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.categories?.name ?? null,
    department: r.departments ? { name: r.departments.name, color: r.departments.color } : null,
    questions: Array.isArray(r.questions)
      ? (r.questions as TemplateQuestion[]).filter((q) => q.type !== "section").map((q) => q.title)
      : [],
    creatorName: r.created_by ? (names.get(r.created_by) ?? null) : null,
    shareCount: shareCount.get(r.id) ?? 0,
  });

  const all = rows ?? [];
  const official = all.filter((r) => r.is_official && r.is_published);
  const mine = all.filter((r) => !r.is_official && r.created_by === profile.id);
  const department = all.filter(
    (r) => !r.is_official && r.created_by !== profile.id && r.department_id !== null && r.department_id === profile.department_id,
  );
  const shared = all.filter(
    (r) =>
      !r.is_official &&
      r.created_by !== profile.id &&
      r.department_id !== profile.department_id &&
      (profile.role !== "superadmin" || sharedWithMe.has(r.id)),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <form action={createMyTemplate}>
          <Button type="submit" variant="outline">
            <Plus aria-hidden />
            {t("new")}
          </Button>
        </form>
      </div>

      <Section title={t("sectionOfficial")} hint={t("sectionOfficialHint")}>
        <li className="flex flex-col rounded-2xl border border-dashed bg-card p-5">
          <div className="flex size-10 items-center justify-center rounded-full bg-brand-soft">
            <FilePlus2 className="size-5 text-brand" aria-hidden />
          </div>
          <h3 className="mt-3 text-base font-semibold">{t("blank")}</h3>
          <p className="mt-1 flex-1 text-sm text-muted-foreground">{t("blankDescription")}</p>
          <div className="mt-4">
            <NewFormButton variant="outline" />
          </div>
        </li>
        {official.map((r) => (
          <TemplateCard key={r.id} template={toCard(r)} kind="official" />
        ))}
      </Section>

      <Section title={t("sectionMine")} hint={t("sectionMineHint")} empty={mine.length === 0 ? t("emptyMine") : undefined}>
        {mine.map((r) => (
          <TemplateCard key={r.id} template={toCard(r)} kind="mine" />
        ))}
      </Section>

      <Section title={t("sectionDepartment")} hint={t("sectionDepartmentHint")} empty={department.length === 0 ? t("emptyDepartment") : undefined}>
        {department.map((r) => (
          <TemplateCard key={r.id} template={toCard(r)} kind="department" />
        ))}
      </Section>

      <Section title={t("sectionShared")} hint={t("sectionSharedHint")} empty={shared.length === 0 ? t("emptyShared") : undefined}>
        {shared.map((r) => (
          <TemplateCard key={r.id} template={toCard(r)} kind="shared" />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, hint, empty, children }: { title: string; hint: string; empty?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{hint}</p>
      {empty ? (
        <p className="mt-4 rounded-xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
      )}
    </section>
  );
}
