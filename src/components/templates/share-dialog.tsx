"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2, Loader2, Plus, Search, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addShare, getShareData, removeShare, type ShareData } from "@/app/(app)/templates/actions";

/** Share a template with specific admins and/or whole departments. Own department always sees it. */
export function ShareDialog({
  templateId,
  title,
  open,
  onOpenChange,
}: {
  templateId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("templates.shareDialog");
  const te = useTranslations("admin.errors");
  const router = useRouter();
  const [data, setData] = useState<ShareData | null>(null);
  const [query, setQuery] = useState("");
  const [busy, startTransition] = useTransition();

  function load() {
    getShareData(templateId).then((res) => {
      if (res.ok) setData(res.data);
      else toast.error(te(res.error));
    });
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templateId]);

  const sharedPeople = useMemo(() => new Set(data?.shares.filter((s) => s.kind === "person").map((s) => s.targetId)), [data]);
  const sharedDepts = useMemo(() => new Set(data?.shares.filter((s) => s.kind === "department").map((s) => s.targetId)), [data]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.people ?? [])
      .filter((p) => !sharedPeople.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.department ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [data, query, sharedPeople]);

  function act(action: () => Promise<{ ok: true } | { ok: false; error: Parameters<typeof te>[0] }>) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) toast.error(te(res.error));
      load();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title", { title })}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label={t("loading")} />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium">{t("current")}</h3>
              {data.shares.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">{t("none")}</p>
              ) : (
                <ul className="mt-2 divide-y rounded-lg border">
                  {data.shares.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      {s.kind === "person" ? (
                        <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {s.label}
                        {s.detail && <span className="text-muted-foreground"> · {s.detail}</span>}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        aria-label={t("remove", { name: s.label })}
                        onClick={() => act(() => removeShare(s.id))}
                      >
                        <X aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Tabs defaultValue="people" className="gap-3">
              <TabsList>
                <TabsTrigger value="people">{t("people")}</TabsTrigger>
                <TabsTrigger value="departments">{t("departments")}</TabsTrigger>
              </TabsList>
              <TabsContent value="people" className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("searchPeople")}
                    aria-label={t("searchPeople")}
                    className="pl-9"
                  />
                </div>
                <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                  {matches.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">{t("noPeople")}</li>}
                  {matches.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {p.name}
                        {p.department && <span className="text-muted-foreground"> · {p.department}</span>}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        aria-label={t("shareWith", { name: p.name })}
                        onClick={() => act(() => addShare(templateId, { kind: "person", id: p.id }))}
                      >
                        <Plus aria-hidden />
                        {t("add")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </TabsContent>
              <TabsContent value="departments">
                <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                  {data.departments
                    .filter((d) => d.id !== data.ownDepartmentId)
                    .map((d) => (
                      <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{d.name}</span>
                        {sharedDepts.has(d.id) ? (
                          <span className="text-xs text-muted-foreground">{t("alreadyShared")}</span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            aria-label={t("shareWith", { name: d.name })}
                            onClick={() => act(() => addShare(templateId, { kind: "department", id: d.id }))}
                          >
                            <Plus aria-hidden />
                            {t("add")}
                          </Button>
                        )}
                      </li>
                    ))}
                </ul>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
