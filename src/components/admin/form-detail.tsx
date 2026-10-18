"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Archive, ArrowLeft, ExternalLink, LayoutTemplate, Lock, LockOpen, Pencil, RotateCcw, Trash2 } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormRenderer } from "@/components/form-renderer/form-renderer";
import { ResponsesPanel } from "@/components/responses/responses-panel";
import { StatusBadge } from "@/components/status-badge";
import type { Lookups } from "@/lib/forms/queries";
import type { DraftQuestion } from "@/lib/forms/schema";
import type { FormStatus } from "@/lib/admin/types";
import type { BannerStyle } from "@/lib/forms/banner";
import {
  deleteFormAdmin,
  restoreDeletedForm,
  retagForm,
  saveFormAsTemplate,
  setFormStatus,
  transferForm,
  type AdminResult,
} from "@/app/(app)/admin/actions";

type DetailForm = {
  id: string;
  title: string;
  description: string | null;
  status: FormStatus;
  department_id: string | null;
  category_id: string | null;
  chapter_id: string | null;
  requires_login: boolean;
  limit_one_response: boolean;
  collect_name: boolean;
  name_required: boolean;
  banner_url: string | null;
  banner_style: BannerStyle;
  created_at: string;
  published_at: string | null;
  closed_at: string | null;
  deleted_at: string | null;
  share_url: string;
};
type Person = { id: string; name: string; email: string };
const NONE = "__none__";

export function AdminFormDetail({
  form,
  questions,
  responseCount,
  lastResponseAt,
  owner,
  people,
  lookups,
}: {
  form: DetailForm;
  questions: DraftQuestion[];
  responseCount: number;
  lastResponseAt: string | null;
  owner: (Person & { status: string }) | null;
  people: Person[];
  lookups: Lookups;
}) {
  const t = useTranslations("admin.detail");
  const te = useTranslations("admin.errors");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [tags, setTags] = useState({ department_id: form.department_id, category_id: form.category_id, chapter_id: form.chapter_id });
  const [newOwner, setNewOwner] = useState<string>("");
  const [confirm, setConfirm] = useState<null | "delete" | "archive">(null);
  const deleted = Boolean(form.deleted_at);

  const department = lookups.departments.find((d) => d.id === form.department_id);
  const category = lookups.categories.find((c) => c.id === form.category_id);
  const chapter = lookups.chapters.find((c) => c.id === form.chapter_id);
  const date = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "—");

  function run(action: () => Promise<AdminResult>, success: string) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else toast.error(te(res.error));
    });
  }

  const tagsChanged =
    tags.department_id !== form.department_id || tags.category_id !== form.category_id || tags.chapter_id !== form.chapter_id;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/forms" aria-label={t("back")}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight break-words">{form.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {deleted ? (
              <span className="rounded-md border border-destructive/30 px-1.5 text-[11px] font-medium text-destructive">{t("deleted")}</span>
            ) : (
              <StatusBadge status={form.status} />
            )}
            {department && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: department.color }} aria-hidden />
                {department.name}
              </span>
            )}
            {category && <span>· {category.name}</span>}
            {chapter && <span>· {chapter.name}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!deleted && (
            <Button variant="outline" asChild>
              <Link href={`/forms/${form.id}`}>
                <Pencil aria-hidden />
                {t("openBuilder")}
              </Link>
            </Button>
          )}
          {(form.status === "open" || form.status === "closed") && !deleted && (
            <Button variant="outline" asChild>
              <a href={form.share_url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
                {t("openPublic")}
              </a>
            </Button>
          )}
        </div>
      </div>

      {deleted && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {t("deletedNotice", { date: date(form.deleted_at) })}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => restoreDeletedForm(form.id), t("restoredDeleted"))}>
              <RotateCcw aria-hidden />
              {t("restoreDeleted")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList>
          <TabsTrigger value="overview">{t("tabOverview")}</TabsTrigger>
          <TabsTrigger value="questions">{t("tabQuestions")}</TabsTrigger>
          <TabsTrigger value="responses">
            {t("tabResponses")}
            <span className="ml-1 rounded-full bg-brand-soft px-1.5 text-xs font-semibold text-foreground">{responseCount}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <section className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
            <h2 className="text-base font-semibold">{t("details")}</h2>
            <dl className="mt-4 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">{t("owner")}</dt>
              <dd className="break-words">
                {owner ? (
                  <>
                    {owner.name} <span className="text-muted-foreground">({owner.email})</span>
                    {owner.status !== "active" && <span className="ml-1 text-xs text-destructive">· {t(`ownerStatus.${owner.status}`)}</span>}
                  </>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted-foreground">{t("responses")}</dt>
              <dd className="tabular-nums">{responseCount}</dd>
              <dt className="text-muted-foreground">{t("lastResponse")}</dt>
              <dd>{date(lastResponseAt)}</dd>
              <dt className="text-muted-foreground">{t("created")}</dt>
              <dd>{date(form.created_at)}</dd>
              <dt className="text-muted-foreground">{t("published")}</dt>
              <dd>{date(form.published_at)}</dd>
              <dt className="text-muted-foreground">{t("closed")}</dt>
              <dd>{date(form.closed_at)}</dd>
              <dt className="text-muted-foreground">{t("link")}</dt>
              <dd className="truncate font-mono text-xs">{form.status === "draft" ? "—" : form.share_url}</dd>
              <dt className="text-muted-foreground">{t("settings")}</dt>
              <dd>
                {form.requires_login
                  ? form.limit_one_response
                    ? t("settingLoginOnce")
                    : t("settingLogin")
                  : form.collect_name
                    ? form.name_required
                      ? t("settingNameRequired")
                      : t("settingAnonymousName")
                    : t("settingAnonymous")}
              </dd>
            </dl>
          </section>

          <div className="space-y-4">
            {!deleted && (
              <section className="space-y-3 rounded-xl border bg-card p-5 shadow-xs">
                <h2 className="text-base font-semibold">{t("statusActions")}</h2>
                <div className="flex flex-wrap gap-2">
                  {form.status === "open" && (
                    <Button variant="outline" disabled={busy} onClick={() => run(() => setFormStatus(form.id, "closed"), t("closedToast"))}>
                      <Lock aria-hidden />
                      {t("close")}
                    </Button>
                  )}
                  {form.status === "closed" && (
                    <Button variant="outline" disabled={busy} onClick={() => run(() => setFormStatus(form.id, "open"), t("reopenedToast"))}>
                      <LockOpen aria-hidden />
                      {t("reopen")}
                    </Button>
                  )}
                  {(form.status === "open" || form.status === "closed") && (
                    <Button variant="outline" disabled={busy} onClick={() => setConfirm("archive")}>
                      <Archive aria-hidden />
                      {t("archive")}
                    </Button>
                  )}
                  {form.status === "archived" && (
                    <Button variant="outline" disabled={busy} onClick={() => run(() => setFormStatus(form.id, "closed"), t("restoredToast"))}>
                      <RotateCcw aria-hidden />
                      {t("restoreArchived")}
                    </Button>
                  )}
                  {form.status === "draft" && <p className="text-sm text-muted-foreground">{t("draftNote")}</p>}
                </div>
              </section>
            )}

            {!deleted && (
              <section className="space-y-3 rounded-xl border bg-card p-5 shadow-xs">
                <h2 className="text-base font-semibold">{t("tags")}</h2>
                <TagSelect
                  id="detail-department"
                  label={t("department")}
                  value={tags.department_id}
                  options={lookups.departments}
                  onChange={(v) => setTags((s) => ({ ...s, department_id: v }))}
                />
                <TagSelect
                  id="detail-category"
                  label={t("category")}
                  value={tags.category_id}
                  options={lookups.categories}
                  onChange={(v) => setTags((s) => ({ ...s, category_id: v }))}
                />
                <TagSelect
                  id="detail-chapter"
                  label={t("chapter")}
                  value={tags.chapter_id}
                  options={lookups.chapters}
                  noneLabel={t("noChapter")}
                  onChange={(v) => setTags((s) => ({ ...s, chapter_id: v }))}
                />
                <Button
                  disabled={busy || !tagsChanged || !tags.department_id || !tags.category_id}
                  onClick={() =>
                    run(
                      () => retagForm(form.id, { department_id: tags.department_id!, category_id: tags.category_id!, chapter_id: tags.chapter_id }),
                      t("retagged"),
                    )
                  }
                >
                  {t("saveTags")}
                </Button>
              </section>
            )}

            {!deleted && (
              <section className="space-y-3 rounded-xl border bg-card p-5 shadow-xs">
                <h2 className="text-base font-semibold">{t("transfer")}</h2>
                <p className="text-sm text-muted-foreground">{t("transferHint")}</p>
                <Select value={newOwner} onValueChange={setNewOwner}>
                  <SelectTrigger aria-label={t("newOwner")} className="w-full">
                    <SelectValue placeholder={t("chooseOwner")} />
                  </SelectTrigger>
                  <SelectContent>
                    {people
                      .filter((p) => p.id !== owner?.id)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  disabled={busy || !newOwner}
                  onClick={() => run(() => transferForm(form.id, newOwner), t("transferred"))}
                >
                  {t("transferButton")}
                </Button>
              </section>
            )}

            {!deleted && (
              <section className="flex flex-wrap gap-2 rounded-xl border bg-card p-5 shadow-xs">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await saveFormAsTemplate(form.id);
                      if (res.ok) router.push(`/templates/${res.id}`);
                      else toast.error(te(res.error));
                    })
                  }
                >
                  <LayoutTemplate aria-hidden />
                  {t("saveAsTemplate")}
                </Button>
                <Button variant="outline" className="text-destructive" disabled={busy} onClick={() => setConfirm("delete")}>
                  <Trash2 aria-hidden />
                  {t("delete")}
                </Button>
              </section>
            )}
          </div>
        </TabsContent>

        <TabsContent value="questions">
          <FormRenderer
            preview
            form={{
              title: form.title,
              description: form.description,
              departmentName: department?.name ?? null,
              departmentColor: department?.color ?? null,
              bannerUrl: form.banner_url,
              bannerStyle: form.banner_style,
              themeColor: "var(--brand-accent)",
              collectName: form.collect_name,
              nameRequired: form.name_required,
              requiresLogin: form.requires_login,
            }}
            questions={questions}
          />
        </TabsContent>

        <TabsContent value="responses">
          <ResponsesPanel formId={form.id} questions={questions} isDraft={form.status === "draft"} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? t("deleteTitle") : t("archiveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{confirm === "delete" ? t("deleteBody") : t("archiveBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={confirm === "delete" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              onClick={() =>
                confirm === "delete"
                  ? run(() => deleteFormAdmin(form.id), t("deletedToast"))
                  : run(() => setFormStatus(form.id, "archived"), t("archivedToast"))
              }
            >
              {confirm === "delete" ? t("delete") : t("archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TagSelect({
  id,
  label,
  value,
  options,
  onChange,
  noneLabel,
}: {
  id: string;
  label: string;
  value: string | null;
  options: { id: string; name: string; color?: string }[];
  onChange: (v: string | null) => void;
  noneLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? (noneLabel ? NONE : "")} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.color && <span className="size-2 rounded-full" style={{ backgroundColor: o.color }} aria-hidden />}
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
