"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CopyPlus, EllipsisVertical, ExternalLink, Link2, Lock, LockOpen, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/status-badge";
import { deleteForm, duplicateForm, setAcceptingResponses } from "@/app/(app)/forms/actions";
import type { FormListItem } from "@/lib/forms/queries";

export function FormCard({
  form,
  editable,
  shareUrl,
  now,
}: {
  form: FormListItem;
  editable: boolean;
  shareUrl: string;
  /** Server render time, so "Edited 5 minutes ago" is identical on server and client. */
  now: string;
}) {
  const t = useTranslations("dashboard");
  const tb = useTranslations("builder");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const live = form.status === "open" || form.status === "closed";

  const fail = (code: string) => {
    toast.error(tb(`errors.${["form_not_found", "forbidden"].includes(code) ? code : "unknown"}`));
  };

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t("linkCopied"));
    } catch {
      toast.error(tb("errors.unknown"));
    }
  }

  const run = (fn: () => Promise<void>) => startTransition(fn);

  return (
    <article className="group relative flex flex-col rounded-2xl border bg-card p-4 shadow-xs transition-shadow focus-within:shadow-md hover:shadow-md">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-base leading-snug font-semibold">
          <Link
            href={`/forms/${form.id}`}
            className="line-clamp-2 break-words after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
          >
            {form.title}
          </Link>
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            aria-label={t("actionsFor", { title: form.title })}
            className="relative z-10 -mt-1 -mr-1 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <EllipsisVertical className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link href={`/forms/${form.id}`}>
                <ExternalLink aria-hidden />
                {editable ? t("open") : t("view")}
              </Link>
            </DropdownMenuItem>
            {live && (
              <DropdownMenuItem onSelect={copyLink}>
                <Link2 aria-hidden />
                {t("copyLink")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() =>
                run(async () => {
                  const res = await duplicateForm(form.id);
                  if (!res.ok) return fail(res.error);
                  toast.success(t("duplicated"));
                  router.push(`/forms/${res.id}`);
                })
              }
            >
              <CopyPlus aria-hidden />
              {t("duplicate")}
            </DropdownMenuItem>
            {editable && live && (
              <DropdownMenuItem
                onSelect={() =>
                  run(async () => {
                    const open = form.status !== "open";
                    const res = await setAcceptingResponses(form.id, open);
                    if (!res.ok) {
                      if (res.problems?.length) return void toast.error(tb(`problems.${res.problems[0]}`));
                      return fail(res.error);
                    }
                    toast.success(open ? t("reopened") : t("closed"));
                    router.refresh();
                  })
                }
              >
                {form.status === "open" ? <Lock aria-hidden /> : <LockOpen aria-hidden />}
                {form.status === "open" ? t("close") : t("reopen")}
              </DropdownMenuItem>
            )}
            {editable && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 aria-hidden />
                  {t("delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={form.status} />
        {!editable && (
          <span className="rounded-md border px-1.5 text-[11px] leading-5 font-medium text-muted-foreground">
            {t("viewOnly")}
          </span>
        )}
      </div>

      <dl className="mt-auto space-y-1 pt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">{tb("department")}</dt>
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: form.department?.color ?? "var(--border)" }}
            aria-hidden
          />
          <dd className="truncate">
            {form.department?.name ?? t("noDepartment")}
            {form.category ? ` · ${form.category}` : ""}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dd className="font-medium text-foreground">
            {form.responseCount > 0 ? (
              <Link href={`/forms/${form.id}?tab=responses`} className="relative z-10 underline-offset-2 hover:underline">
                {t("responses", { count: form.responseCount })}
              </Link>
            ) : (
              t("responses", { count: form.responseCount })
            )}
          </dd>
          <dd>{t("edited", { date: format.relativeTime(new Date(form.updated_at), new Date(now)) })}</dd>
        </div>
      </dl>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody", { title: form.title })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                run(async () => {
                  const res = await deleteForm(form.id);
                  if (!res.ok) return fail(res.error);
                  toast.success(t("deleted"));
                  router.refresh();
                })
              }
            >
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
