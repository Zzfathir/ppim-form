"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import type { DraftQuestion } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";
import { getSummary, type Summary } from "@/app/(app)/forms/[id]/responses-actions";
import { ResponsesTable } from "./responses-table";
import { SummaryView } from "./summary-view";

/** The builder's Responses tab: Summary / table toggle and export. Loads when opened. */
export function ResponsesPanel({
  formId,
  questions,
  isDraft,
}: {
  formId: string;
  questions: DraftQuestion[];
  isDraft: boolean;
}) {
  const t = useTranslations("responses");
  const [view, setView] = useState<"summary" | "table">("summary");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getSummary(formId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setSummary(res.data);
        setError(false);
      } else setError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [formId, attempt]);

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm">
        <p>{t("loadError")}</p>
        <Button variant="outline" className="mt-3" onClick={() => setAttempt((n) => n + 1)}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (summary.total === 0) {
    return <EmptyState icon={Inbox} title={t("emptyTitle")} body={isDraft ? t("emptyDraftBody") : t("emptyBody")} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-5 py-4 shadow-xs">
        <h2 className="mr-auto font-heading text-xl font-bold">{t("count", { count: summary.total })}</h2>
        <div role="group" aria-label={t("viewLabel")} className="inline-flex rounded-lg border p-0.5 text-sm">
          {(["summary", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1 font-medium focus-visible:outline-2 focus-visible:outline-ring",
                view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "summary" ? t("viewSummary") : t("viewTable")}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download aria-hidden />
              {t("exportButton")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={`/api/forms/${formId}/export?format=csv`} download>
                {t("exportCsv")}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/api/forms/${formId}/export?format=xlsx`} download>
                {t("exportXlsx")}
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {view === "summary" ? (
        <SummaryView summary={summary} questions={questions} onShowTable={() => setView("table")} />
      ) : (
        <ResponsesTable formId={formId} />
      )}
    </div>
  );
}
