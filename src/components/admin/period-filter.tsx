"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PeriodKey } from "@/lib/admin/period";
import { cn } from "@/lib/utils";

const KEYS: PeriodKey[] = ["7d", "30d", "semester", "custom"];

/** Period filter for the overview, kept in the URL (?period=…&from=…&to=…). */
export function PeriodFilter({ current, fromDate, toDate }: { current: PeriodKey; fromDate: string; toDate: string }) {
  const t = useTranslations("admin.period");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(current === "custom");
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);

  function go(next: Record<string, string | null>) {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    startTransition(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <div role="group" aria-label={t("label")} className="flex w-full rounded-lg border bg-card p-0.5 text-sm sm:inline-flex sm:w-auto">
        {KEYS.map((key) => {
          const active = key === "custom" ? showCustom : current === key && !showCustom;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (key === "custom") return setShowCustom(true);
                setShowCustom(false);
                go({ period: key === "30d" ? null : key, from: null, to: null });
              }}
              className={cn(
                "flex-1 rounded-md px-2 py-1 font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring sm:flex-none sm:px-3",
                active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(key)}
            </button>
          );
        })}
      </div>
      {showCustom && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) go({ period: "custom", from, to });
          }}
        >
          <Input type="date" aria-label={t("from")} value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto bg-card" required />
          <span className="text-sm text-muted-foreground">–</span>
          <Input type="date" aria-label={t("to")} value={to} onChange={(e) => setTo(e.target.value)} className="w-auto bg-card" required />
          <Button type="submit" variant="outline">
            {t("apply")}
          </Button>
        </form>
      )}
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t("loading")} />}
    </div>
  );
}
