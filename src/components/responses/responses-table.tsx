"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Loader2, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { appConfig } from "@/config/app";
import { formatAnswer } from "@/lib/responses/format";
import { cn } from "@/lib/utils";
import { getResponsesPage, type ResponsesPage } from "@/app/(app)/forms/[id]/responses-actions";

type Params = { query: string; sort: string; desc: boolean; page: number };

export function ResponsesTable({ formId }: { formId: string }) {
  const t = useTranslations("responses");
  const format = useFormatter();
  const [params, setParams] = useState<Params>({ query: "", sort: "submitted_at", desc: true, page: 0 });
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ResponsesPage | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  // Debounced search → first page.
  useEffect(() => {
    const id = setTimeout(() => setParams((p) => (p.query === search.trim() ? p : { ...p, query: search.trim(), page: 0 })), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the request started below
    setLoading(true);
    getResponsesPage(formId, params).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setData(res.data);
        setError(false);
      } else setError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [formId, params, reload]);

  const toggleSort = (sort: string) =>
    setParams((p) => ({ ...p, sort, desc: p.sort === sort ? !p.desc : sort === "submitted_at", page: 0 }));

  if (error && !data) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm">
        <p>{t("loadError")}</p>
        <Button variant="outline" className="mt-3" onClick={() => setReload((n) => n + 1)}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  const hasName = data?.rows.some((r) => r.respondent_name) ?? false;
  const hasEmail = data?.rows.some((r) => r.respondent_email) ?? false;
  const columns = [
    { key: "submitted_at", label: t("submitted") },
    ...(hasName ? [{ key: "respondent_name", label: t("name") }] : []),
    ...(hasEmail ? [{ key: "respondent_email", label: t("email") }] : []),
    ...(data?.columns ?? []).map((c) => ({
      key: c.id,
      label: c.deleted ? `${c.title} (${t("deletedQuestion")})` : c.title,
    })),
  ];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? appConfig.responsesPageSize;
  const from = total === 0 ? 0 : params.page * pageSize + 1;
  const to = Math.min(total, (params.page + 1) * pageSize);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          maxLength={200}
          className="bg-card pl-9"
        />
        {loading && data && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
        )}
      </div>

      {!data ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : data.rows.length === 0 ? (
        <EmptyState icon={SearchX} title={t("noMatchesTitle")} body={t("noMatchesBody")} />
      ) : (
        <div className={cn("relative overflow-x-auto rounded-xl border bg-card shadow-xs transition-opacity", loading && "opacity-60")}>
          <table className="w-full min-w-max text-left text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                {columns.map((c, i) => {
                  const active = params.sort === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (params.desc ? "descending" : "ascending") : "none"}
                      className={cn("max-w-64 p-0 font-medium", i === 0 && "sticky left-0 z-10 bg-muted")}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        aria-label={t("sortBy", { column: c.label })}
                        className="flex w-full items-center gap-1 px-3 py-2.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      >
                        <span className="line-clamp-2">{c.label}</span>
                        {active &&
                          (params.desc ? (
                            <ArrowDown className="size-3.5 shrink-0" aria-hidden />
                          ) : (
                            <ArrowUp className="size-3.5 shrink-0" aria-hidden />
                          ))}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-muted/40">
                  <td className="sticky left-0 bg-card px-3 py-2 whitespace-nowrap tabular-nums">
                    {format.dateTime(new Date(r.submitted_at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: appConfig.timeZone,
                    })}
                  </td>
                  {hasName && <td className="max-w-64 px-3 py-2">{r.respondent_name}</td>}
                  {hasEmail && <td className="max-w-64 px-3 py-2">{r.respondent_email}</td>}
                  {data.columns.map((c) => {
                    const text = formatAnswer(r.answers[c.id]);
                    return (
                      <td key={c.id} className="max-w-64 px-3 py-2">
                        <span className="line-clamp-3 break-words" title={text.length > 80 ? text : undefined}>
                          {text}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && total > 0 && (
        <nav aria-label={t("viewTable")} className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground tabular-nums" aria-live="polite">
            {t("pageInfo", { from, to, total })}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("previous")}
            disabled={params.page === 0 || loading}
            onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("next")}
            disabled={to >= total || loading}
            onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))}
          >
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      )}
    </div>
  );
}
