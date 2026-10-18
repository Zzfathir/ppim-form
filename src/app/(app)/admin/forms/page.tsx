import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, ExternalLink, SearchX } from "lucide-react";
import { appConfig } from "@/config/app";
import { requireSuperadmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/forms/queries";
import { sharePath } from "@/lib/forms/share";
import { parseRegistryParams, registryQuery, registryRpcArgs, type RegistryParams } from "@/lib/admin/registry";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { NewFormButton } from "@/components/forms/new-form-button";
import { RegistryFilters } from "@/components/admin/registry-filters";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("allForms");

export default async function RegistryPage({ searchParams }: PageProps<"/admin/forms">) {
  const profile = await requireSuperadmin();
  const params = parseRegistryParams(await searchParams);
  const supabase = await createClient();

  const [lookups, people, result] = await Promise.all([
    getLookups(),
    supabase.rpc("admin_people"),
    supabase.rpc("admin_forms", registryRpcArgs(params, profile.id)),
  ]);
  if (result.error) throw new Error("Failed to load forms");

  const t = await getTranslations("admin.registry");
  const format = await getFormatter();
  const rows = result.data;
  const total = Number(rows[0]?.total_count ?? 0);
  const pageSize = appConfig.registryPageSize;
  const from = total === 0 ? 0 : params.page * pageSize + 1;
  const to = Math.min(total, (params.page + 1) * pageSize);

  const columns: { key: RegistryParams["sort"]; label: string; align?: "right" }[] = [
    { key: "title", label: t("colTitle") },
    { key: "department", label: t("colDepartment") },
    { key: "chapter", label: t("colChapter") },
    { key: "owner", label: t("colCreator") },
    { key: "category", label: t("colCategory") },
    { key: "status", label: t("colStatus") },
    { key: "created_at", label: t("colCreated") },
    { key: "last_response_at", label: t("colLastResponse") },
    { key: "response_count", label: t("colResponses"), align: "right" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("count", { count: total })}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/admin/forms/export?${registryQuery(params, { page: 0 })}`} download>
              <Download aria-hidden />
              {t("exportCsv")}
            </a>
          </Button>
          <NewFormButton />
        </div>
      </div>

      <RegistryFilters
        departments={lookups.departments.map((d) => ({ id: d.id, name: d.name, color: d.color }))}
        chapters={lookups.chapters}
        categories={lookups.categories}
        owners={(people.data ?? []).map((p) => ({ id: p.id, name: p.full_name ?? p.email }))}
      />

      {rows.length === 0 ? (
        <EmptyState icon={SearchX} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {columns.map((c) => {
                  const active = params.sort === c.key;
                  const nextDesc = active ? !params.desc : c.key === "created_at" || c.key === "last_response_at" || c.key === "response_count";
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (params.desc ? "descending" : "ascending") : "none"}
                      className={cn("p-0 font-medium", c.align === "right" && "text-right")}
                    >
                      <Link
                        href={`/admin/forms?${registryQuery(params, { sort: c.key, desc: nextDesc, page: 0 })}`}
                        scroll={false}
                        className={cn(
                          "flex items-center gap-1 px-3 py-2.5 hover:text-foreground",
                          c.align === "right" && "justify-end",
                          active && "text-foreground",
                        )}
                      >
                        {c.label}
                        {active && (params.desc ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden />)}
                      </Link>
                    </th>
                  );
                })}
                <th scope="col" className="px-3 py-2.5">
                  <span className="sr-only">{t("colLink")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className={cn("hover:bg-muted/40", r.deleted_at && "text-muted-foreground")}>
                  <td className="max-w-72 min-w-48 px-3 py-2">
                    <Link href={`/admin/forms/${r.id}`} className="line-clamp-2 font-medium text-foreground hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {r.department_name ? (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className="size-2 rounded-full" style={{ backgroundColor: r.department_color ?? undefined }} aria-hidden />
                        {r.department_name}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.chapter_name ?? "—"}</td>
                  <td className="max-w-48 min-w-36 px-3 py-2">
                    <span className="line-clamp-1" title={r.owner_email ?? undefined}>
                      {r.owner_name ?? r.owner_email}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.category_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.deleted_at ? (
                      <span className="rounded-md border border-destructive/30 px-1.5 text-[11px] font-medium text-destructive">{t("deleted")}</span>
                    ) : (
                      <StatusBadge status={r.status} />
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{format.dateTime(new Date(r.created_at), { dateStyle: "medium" })}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {r.last_response_at ? format.dateTime(new Date(r.last_response_at), { dateStyle: "medium" }) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{r.response_count}</td>
                  <td className="px-3 py-2">
                    {(r.status === "open" || r.status === "closed") && !r.deleted_at && (
                      <a
                        href={sharePath(r.share_slug)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t("openPublic", { title: r.title })}
                        className="inline-flex rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <ExternalLink className="size-4" aria-hidden />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <nav aria-label={t("pagination")} className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground tabular-nums">{t("pageInfo", { from, to, total })}</span>
          <PageLink disabled={params.page === 0} href={`/admin/forms?${registryQuery(params, { page: params.page - 1 })}`} label={t("previous")}>
            <ChevronLeft aria-hidden />
          </PageLink>
          <PageLink disabled={to >= total} href={`/admin/forms?${registryQuery(params, { page: params.page + 1 })}`} label={t("next")}>
            <ChevronRight aria-hidden />
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  return disabled ? (
    <Button variant="outline" size="icon" disabled aria-label={label}>
      {children}
    </Button>
  ) : (
    <Button variant="outline" size="icon" asChild>
      <Link href={href} aria-label={label}>
        {children}
      </Link>
    </Button>
  );
}
