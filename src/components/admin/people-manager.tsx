"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRightLeft, Check, EllipsisVertical, Shield, ShieldOff, UserCheck, UserX, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { changePerson, setPersonDepartment, transferAllForms, type AdminResult } from "@/app/(app)/admin/actions";

type Person = {
  id: string;
  name: string;
  email: string;
  role: "respondent" | "admin" | "superadmin";
  status: "pending" | "active" | "suspended";
  departmentId: string | null;
  formsCount: number;
  openCount: number;
};
type Dept = { id: string; name: string; color?: string };

export function PeopleManager({ meId, people, departments }: { meId: string; people: Person[]; departments: Dept[] }) {
  const t = useTranslations("admin.people");
  const te = useTranslations("admin.errors");
  const tr = useTranslations("roles");
  const tc = useTranslations("common");
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [transferFrom, setTransferFrom] = useState<Person | null>(null);
  const [transferTo, setTransferTo] = useState("");

  const pending = people.filter((p) => p.status === "pending");
  const others = people.filter((p) => p.status !== "pending");

  function run(action: () => Promise<AdminResult>, success: string) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else toast.error(te(res.error));
    });
  }

  const deptSelect = (p: Person) => (
    <Select
      value={p.departmentId ?? ""}
      disabled={busy}
      onValueChange={(v) => run(() => setPersonDepartment(p.id, v), t("departmentChanged", { name: p.name }))}
    >
      <SelectTrigger aria-label={t("departmentFor", { name: p.name })} className="h-8 w-full min-w-40 bg-card text-xs sm:w-48">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {departments.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.color && <span className="size-2 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />}
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      {pending.length > 0 && (
        <section aria-labelledby="pending-heading" className="rounded-xl border border-brand/30 bg-brand-soft p-4 sm:p-5">
          <h2 id="pending-heading" className="font-semibold">
            {t("pendingTitle", { count: pending.length })}
          </h2>
          <ul className="mt-3 divide-y rounded-lg border bg-card">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                </div>
                <span className="text-sm text-muted-foreground">{departments.find((d) => d.id === p.departmentId)?.name ?? "—"}</span>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy} onClick={() => run(() => changePerson(p.id, "approve"), t("approved", { name: p.name }))}>
                    <Check aria-hidden />
                    {t("approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run(() => changePerson(p.id, "reject"), t("rejected", { name: p.name }))}
                  >
                    <X aria-hidden />
                    {t("reject")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {others.length === 0 ? (
        <EmptyState icon={Users} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">{t("colPerson")}</th>
                <th scope="col" className="px-3 py-2.5 font-medium">{t("colDepartment")}</th>
                <th scope="col" className="px-3 py-2.5 font-medium">{t("colRole")}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("colForms")}</th>
                <th scope="col" className="px-3 py-2.5">
                  <span className="sr-only">{t("colActions")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {others.map((p) => {
                const isMe = p.id === meId;
                return (
                  <tr key={p.id} className={cn(p.status === "suspended" && "bg-muted/40 text-muted-foreground")}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">
                        {p.name}
                        {isMe && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({t("you")})</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{p.email}</p>
                    </td>
                    <td className="px-3 py-2.5">{deptSelect(p)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={p.role === "superadmin" ? "default" : "outline"} className="text-[11px]">
                          {tr(p.role)}
                        </Badge>
                        {p.status === "suspended" && (
                          <Badge variant="outline" className="border-destructive/40 text-[11px] text-destructive">
                            {t("suspended")}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {p.formsCount}
                      {p.openCount > 0 && <span className="ml-1 text-xs text-muted-foreground">({t("openCount", { count: p.openCount })})</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {!isMe && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            disabled={busy}
                            aria-label={t("actionsFor", { name: p.name })}
                            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            <EllipsisVertical className="size-4" aria-hidden />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-60">
                            {p.status === "suspended" ? (
                              <DropdownMenuItem onSelect={() => run(() => changePerson(p.id, "restore"), t("restored", { name: p.name }))}>
                                <UserCheck aria-hidden />
                                {t("restore")}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => run(() => changePerson(p.id, "suspend"), t("suspendedToast", { name: p.name }))}>
                                <UserX aria-hidden />
                                {t("suspend")}
                              </DropdownMenuItem>
                            )}
                            {p.role === "superadmin" ? (
                              <DropdownMenuItem onSelect={() => run(() => changePerson(p.id, "demote"), t("demoted", { name: p.name }))}>
                                <ShieldOff aria-hidden />
                                {t("demote")}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => run(() => changePerson(p.id, "promote"), t("promoted", { name: p.name }))}>
                                <Shield aria-hidden />
                                {t("promote")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={p.formsCount === 0}
                              onSelect={() => {
                                setTransferTo("");
                                setTransferFrom(p);
                              }}
                            >
                              <ArrowRightLeft aria-hidden />
                              {t("transferAll")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={transferFrom !== null} onOpenChange={(open) => !open && setTransferFrom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("transferTitle", { name: transferFrom?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("transferBody", { count: transferFrom?.formsCount ?? 0 })}</DialogDescription>
          </DialogHeader>
          <Select value={transferTo} onValueChange={setTransferTo}>
            <SelectTrigger aria-label={t("transferTo")} className="w-full">
              <SelectValue placeholder={t("transferTo")} />
            </SelectTrigger>
            <SelectContent>
              {people
                .filter((p) => p.id !== transferFrom?.id && p.status !== "suspended")
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTransferFrom(null)}>
              {tc("cancel")}
            </Button>
            <Button
              disabled={busy || !transferTo}
              onClick={() =>
                startTransition(async () => {
                  const res = await transferAllForms(transferFrom!.id, transferTo);
                  if (res.ok) {
                    toast.success(t("transferred", { count: res.count }));
                    setTransferFrom(null);
                    router.refresh();
                  } else toast.error(te(res.error));
                })
              }
            >
              {t("transferButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
