"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REGISTRY_STATUSES } from "@/lib/admin/registry";

type Opt = { id: string; name: string; color?: string };
const ALL = "__all__";

/** All registry filters in one row (wrapping on small screens), kept in the URL. */
export function RegistryFilters({
  departments,
  chapters,
  categories,
  owners,
}: {
  departments: Opt[];
  chapters: Opt[];
  categories: Opt[];
  owners: Opt[];
}) {
  const t = useTranslations("admin.registry");
  const ts = useTranslations("status");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");

  function set(next: Record<string, string | null>) {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    q.delete("page");
    startTransition(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    if (query === (params.get("q") ?? "")) return;
    const id = setTimeout(() => set({ q: query.trim() || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const select = (key: string, label: string, options: Opt[], extra: { value: string; label: string }[] = []) => (
    <Select value={params.get(key) ?? ALL} onValueChange={(v) => set({ [key]: v === ALL ? null : v })}>
      <SelectTrigger aria-label={label} className="w-full bg-card sm:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t("all", { label })}</SelectItem>
        {extra.map((e) => (
          <SelectItem key={e.value} value={e.value}>
            {e.label}
          </SelectItem>
        ))}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.color && <span className="size-2 rounded-full" style={{ backgroundColor: o.color }} aria-hidden />}
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const hasFilters = [...params.keys()].some((k) => !["sort", "dir", "page"].includes(k));

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="bg-card pl-9"
        />
        {pending && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {select("department", t("department"), departments)}
        {select("chapter", t("chapter"), chapters, [{ value: "none", label: t("noChapter") }])}
        {select("category", t("category"), categories)}
        {select(
          "status",
          t("status"),
          REGISTRY_STATUSES.map((s) => ({ id: s, name: s === "deleted" ? t("deleted") : ts(s) })),
        )}
        {select("owner", t("creator"), owners, [{ value: "me", label: t("me") }])}
        <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
          <Input
            type="date"
            aria-label={t("createdFrom")}
            value={params.get("from") ?? ""}
            onChange={(e) => set({ from: e.target.value || null })}
            className="w-full bg-card sm:w-auto"
          />
          <span className="text-sm text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label={t("createdTo")}
            value={params.get("to") ?? ""}
            onChange={(e) => set({ to: e.target.value || null })}
            className="w-full bg-card sm:w-auto"
          />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            <X aria-hidden />
            {t("clear")}
          </Button>
        )}
      </div>
    </div>
  );
}
