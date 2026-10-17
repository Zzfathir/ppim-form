import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileText, LayoutTemplate, SearchX, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { listForms, type FormStatus } from "@/lib/forms/queries";
import { shareUrl } from "@/lib/forms/share";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { FormCard } from "@/components/forms/form-card";
import { FormFilters } from "@/components/forms/form-filters";
import { NewFormButton } from "@/components/forms/new-form-button";
import { cn } from "@/lib/utils";

export const metadata = { title: "My forms" };

const STATUSES: FormStatus[] = ["draft", "open", "closed", "archived"];

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const profile = await requireStaff();
  if (profile.role === "superadmin") redirect("/admin");

  const params = await searchParams;
  const scope = params.scope === "department" ? "department" : "mine";
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const status = STATUSES.find((s) => s === params.status);
  const filtered = Boolean(query || status);

  const t = await getTranslations("dashboard");
  const forms = await listForms({ profile, scope, query, status });
  const now = new Date().toISOString();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/templates">
              <LayoutTemplate aria-hidden />
              {t("fromTemplate")}
            </Link>
          </Button>
          <NewFormButton />
        </div>
      </div>

      <nav aria-label={t("title")} className="mt-6 flex gap-1 border-b">
        {(["mine", "department"] as const).map((s) => (
          <Link
            key={s}
            href={s === "mine" ? "/dashboard" : "/dashboard?scope=department"}
            aria-current={scope === s ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              scope === s ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "mine" ? t("tabMine") : t("tabDepartment")}
          </Link>
        ))}
      </nav>

      <div className="mt-4">
        <FormFilters />
      </div>

      {forms.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title={t("noResultsTitle")}
            body={t("noResultsBody")}
            className="mt-6"
            action={
              <Button variant="outline" asChild>
                <Link href={scope === "mine" ? "/dashboard" : "/dashboard?scope=department"}>{t("clearFilters")}</Link>
              </Button>
            }
          />
        ) : scope === "mine" ? (
          <EmptyState
            icon={FileText}
            title={t("emptyTitle")}
            body={t("emptyBody")}
            className="mt-6"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <NewFormButton />
                <Button variant="outline" asChild>
                  <Link href="/templates">{t("fromTemplate")}</Link>
                </Button>
              </div>
            }
          />
        ) : (
          <EmptyState icon={Users} title={t("emptyDepartmentTitle")} body={t("emptyDepartmentBody")} className="mt-6" />
        )
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <li key={form.id} className="flex">
              <div className="w-full [&>article]:h-full">
                <FormCard form={form} editable={scope === "mine" && profile.status !== "suspended"} shareUrl={shareUrl(form.share_slug)} now={now} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
