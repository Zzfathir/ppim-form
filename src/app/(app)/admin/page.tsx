import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { requireSuperadmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolvePeriod } from "@/lib/admin/period";
import type { Overview } from "@/lib/admin/types";
import { KpiCard } from "@/components/admin/kpi-card";
import { PeriodFilter } from "@/components/admin/period-filter";
import { BarList } from "@/components/charts/bar-list";
import { TimeSeriesChart } from "@/components/charts/time-series";
import { StatusBadge } from "@/components/status-badge";

export const metadata = { title: "Overview" };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  // Layouts are not re-run on client navigation, so every admin page checks too.
  await requireSuperadmin();
  const sp = await searchParams;
  const period = resolvePeriod({ period: first(sp.period), from: first(sp.from), to: first(sp.to) });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_overview", {
    p_from: period.from.toISOString(),
    p_to: period.to.toISOString(),
  });
  if (error || !data) throw new Error("Failed to load overview");
  const o = data as unknown as Overview;

  const t = await getTranslations("admin.overview");
  const tp = await getTranslations("admin.period");
  const format = await getFormatter();
  const range = `${format.dateTime(new Date(`${period.fromDate}T00:00:00`), { dateStyle: "medium" })} – ${format.dateTime(new Date(`${period.toDate}T00:00:00`), { dateStyle: "medium" })}`;
  const registry = (q: Record<string, string>) =>
    `/admin/forms?${new URLSearchParams({ from: period.fromDate, to: period.toDate, ...q }).toString()}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tp("showing", { range })}</p>
        </div>
        <PeriodFilter current={period.key} fromDate={period.fromDate} toDate={period.toDate} />
      </div>

      <section aria-label={t("kpis")} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label={t("totalForms")} value={o.kpis.total_forms} href="/admin/forms" />
        <KpiCard label={t("openForms")} value={o.kpis.open_forms} href="/admin/forms?status=open" />
        <KpiCard label={t("totalResponses")} value={o.kpis.total_responses} hint={t("inPeriodHint", { count: o.kpis.responses_in_period })} />
        <KpiCard label={t("formsInPeriod")} value={o.kpis.forms_in_period} href={registry({})} />
        <KpiCard label={t("departmentsActive")} value={o.kpis.departments_active} hint={t("ofDepartments", { count: o.departments.length })} />
        <KpiCard
          label={t("pendingApprovals")}
          value={o.kpis.pending_approvals}
          href="/admin/people"
          highlight={o.kpis.pending_approvals > 0}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("responsesOverTime")} subtitle={o.bucket === "week" ? t("perWeek") : t("perDay")}>
          <TimeSeriesChart data={o.responses_series} bucket={o.bucket} label={t("responsesOverTime")} valueLabel={t("responsesUnit")} />
        </Panel>
        <Panel title={t("formsOverTime")} subtitle={o.bucket === "week" ? t("perWeek") : t("perDay")}>
          <TimeSeriesChart data={o.forms_series} bucket={o.bucket} label={t("formsOverTime")} valueLabel={t("formsUnit")} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={t("formsPerDepartment")} subtitle={t("createdInPeriod")}>
          <BarList
            emptyLabel={t("noFormsInPeriod")}
            items={[...o.departments]
              .sort((a, b) => b.forms_in_period - a.forms_in_period || a.name.localeCompare(b.name))
              .map((d) => ({ key: d.id, label: d.name, value: d.forms_in_period, dotColor: d.color, href: registry({ department: d.id }) }))}
          />
        </Panel>
        <Panel title={t("formsPerCategory")} subtitle={t("createdInPeriod")}>
          <BarList
            emptyLabel={t("noFormsInPeriod")}
            items={o.categories.map((c) => ({ key: c.id, label: c.name, value: c.count, href: registry({ category: c.id }) }))}
          />
        </Panel>
        <Panel title={t("formsPerChapter")} subtitle={t("createdInPeriod")}>
          <BarList
            emptyLabel={t("noFormsInPeriod")}
            items={o.chapters.map((c) => ({
              key: c.id ?? "none",
              label: c.name ?? t("noChapter"),
              value: c.count,
              href: registry(c.id ? { chapter: c.id } : { chapter: "none" }),
            }))}
          />
        </Panel>
      </div>

      <Panel title={t("departmentTable")} subtitle={t("departmentTableHint")}>
        <div className="relative -mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-y bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-2 font-medium sm:px-6">{t("colDepartment")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("colFormsInPeriod")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("colFormsTotal")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("colOpen")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("colResponses")}</th>
                <th scope="col" className="px-5 py-2 font-medium sm:px-6">{t("colLastActivity")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {o.departments.map((d) => (
                <tr key={d.id} className={d.forms_total === 0 ? "text-muted-foreground" : undefined}>
                  <th scope="row" className="px-5 py-2 font-medium sm:px-6">
                    <Link href={`/admin/forms?department=${d.id}`} className="inline-flex items-center gap-2 hover:underline">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />
                      {d.name}
                      {d.is_archived && <span className="text-xs font-normal">({t("archived")})</span>}
                    </Link>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{d.forms_in_period}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.forms_total}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.open_now}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.responses_in_period}</td>
                  <td className="px-5 py-2 sm:px-6">
                    {d.last_activity ? format.dateTime(new Date(d.last_activity), { dateStyle: "medium" }) : t("noActivity")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={t("recentForms")}>
        {o.recent_forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noForms")}</p>
        ) : (
          <ul className="divide-y">
            {o.recent_forms.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <Link href={`/admin/forms/${f.id}`} className="min-w-0 basis-full truncate font-medium hover:underline sm:flex-1 sm:basis-auto">
                  {f.title}
                </Link>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {f.department_color && <span className="size-2 rounded-full" style={{ backgroundColor: f.department_color }} aria-hidden />}
                  {f.department_name ?? "—"}
                </span>
                <StatusBadge status={f.status} />
                <time className="ml-auto text-right text-xs text-muted-foreground sm:ml-0 sm:w-28" dateTime={f.created_at}>
                  {format.dateTime(new Date(f.created_at), { dateStyle: "medium" })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
