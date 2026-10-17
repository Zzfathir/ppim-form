"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CopyPlus, EllipsisVertical, Pencil, Share2, Trash2, Users } from "lucide-react";
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
import { NewFormButton } from "@/components/forms/new-form-button";
import { copyTemplate, deleteTemplate } from "@/app/(app)/templates/actions";
import { ShareDialog } from "./share-dialog";

export type TemplateCardData = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  department: { name: string; color: string } | null;
  questions: string[];
  creatorName: string | null;
  shareCount: number;
};

/** official / mine / department / shared: decides the badge and which actions appear. */
export function TemplateCard({ template: tpl, kind }: { template: TemplateCardData; kind: "official" | "mine" | "department" | "shared" }) {
  const t = useTranslations("templates");
  const te = useTranslations("admin.errors");
  const tc = useTranslations("common");
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [sharing, setSharing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const own = kind === "mine";

  const origin =
    kind === "official"
      ? t("badgeOfficial")
      : kind === "mine"
        ? tpl.shareCount > 0
          ? t("sharedCount", { count: tpl.shareCount })
          : t("badgeDepartmentOnly")
        : [tpl.creatorName, tpl.department?.name].filter(Boolean).join(" · ");

  return (
    <li className="flex flex-col rounded-2xl border bg-card p-5 shadow-xs">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {tpl.category && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{tpl.category}</span>}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {kind !== "official" && tpl.department && (
                <span className="size-2 rounded-full" style={{ backgroundColor: tpl.department.color }} aria-hidden />
              )}
              {origin}
            </span>
          </div>
          <h3 className="mt-2 text-base font-semibold break-words">{tpl.title}</h3>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            aria-label={t("actionsFor", { title: tpl.title })}
            className="-mt-1 -mr-1 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <EllipsisVertical className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {own && (
              <>
                <DropdownMenuItem asChild>
                  <Link href={`/templates/${tpl.id}`}>
                    <Pencil aria-hidden />
                    {t("edit")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSharing(true)}>
                  <Share2 aria-hidden />
                  {t("share")}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  const res = await copyTemplate(tpl.id);
                  if (res.ok) router.push(`/templates/${res.id}`);
                  else toast.error(te(res.error));
                })
              }
            >
              <CopyPlus aria-hidden />
              {t("copy")}
            </DropdownMenuItem>
            {own && (
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

      {tpl.description && <p className="mt-1 text-sm text-muted-foreground">{tpl.description}</p>}
      <ul className="mt-3 flex-1 space-y-1 text-sm text-muted-foreground" aria-label={t("questionCount", { count: tpl.questions.length })}>
        {tpl.questions.slice(0, 3).map((q, i) => (
          <li key={i} className="truncate before:mr-2 before:text-border before:content-['—']">
            {q}
          </li>
        ))}
        {tpl.questions.length > 3 && <li className="text-xs">+{tpl.questions.length - 3}</li>}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {own && tpl.shareCount > 0 && <Users className="size-3.5" aria-hidden />}
          {t("questionCount", { count: tpl.questions.length })}
        </span>
        <NewFormButton templateId={tpl.id} label={t("use")} />
      </div>

      {own && <ShareDialog templateId={tpl.id} title={tpl.title} open={sharing} onOpenChange={setSharing} />}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody", { title: tpl.title })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteTemplate(tpl.id);
                  if (res.ok) {
                    toast.success(t("deleted"));
                    router.refresh();
                  } else toast.error(te(res.error));
                })
              }
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
