"use client";

import { useCallback, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AlertCircle, ArrowLeft, BetweenHorizontalStart, Check, CloudOff, CopyPlus, Eye, ImagePlus, LayoutTemplate, Loader2, Plus, Send, Share2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/empty-state";
import { ResponsesPanel } from "@/components/responses/responses-panel";
import { StatusBadge } from "@/components/status-badge";
import { FormRenderer } from "@/components/form-renderer/form-renderer";
import type { RenderForm } from "@/components/form-renderer/types";
import { duplicateForm, publishForm, saveForm, setAcceptingResponses, type PublishProblem } from "@/app/(app)/forms/actions";
import { saveFormAsMyTemplate } from "@/app/(app)/templates/actions";
import type { Lookups, FormStatus, Option } from "@/lib/forms/queries";
import { LIMITS, type DraftForm, type DraftQuestion, type SaveFormPayload } from "@/lib/forms/schema";
import { bannerUrl } from "@/lib/forms/banner";
import { isAnswerable } from "@/lib/questions";
import { cn } from "@/lib/utils";
import { BannerPicker } from "./banner-picker";
import { PreviewDialog } from "./preview-dialog";
import { QuestionCard } from "./question-card";
import { ImageCard } from "./image-card";
import { SectionCard } from "./section-card";
import { localProblems } from "./question-meta";
import { SettingRow, SettingsPanel } from "./settings-panel";
import { ShareDialog } from "./share-dialog";
import { useAutosave, type SaveStatus } from "./use-autosave";

export type FormEditorProps = {
  formId: string;
  initialForm: DraftForm;
  initialQuestions: DraftQuestion[];
  initialStatus: FormStatus;
  shareUrl: string;
  lookups: Lookups;
  readOnly: boolean;
  accountActive: boolean;
  answeredIds: string[];
  responseCount: number;
  ownerName: string | null;
  backHref: string;
  initialTab?: "questions" | "responses" | "settings";
  /** Any admin can save a form they can read as their own template (owner revision). */
  canSaveTemplate?: boolean;
};

export function FormEditor(props: FormEditorProps) {
  const { formId, lookups, readOnly, accountActive, shareUrl } = props;
  const t = useTranslations("builder");
  const router = useRouter();

  const [form, setForm] = useState(props.initialForm);
  const [questions, setQuestions] = useState(props.initialQuestions);
  const [status, setStatus] = useState(props.initialStatus);
  const [activeId, setActiveId] = useState<string | null>(props.initialQuestions[0]?.id ?? null);
  const [tab, setTab] = useState<string>(props.initialTab ?? "questions");
  const [showProblems, setShowProblems] = useState(false);
  const [serverProblems, setServerProblems] = useState<PublishProblem[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const answered = useMemo(() => new Set(props.answeredIds), [props.answeredIds]);
  // Stable id so dnd-kit's accessibility attributes match between server and client render.
  const dndId = useId();

  // ---- autosave -----------------------------------------------------------
  const payload = useMemo<SaveFormPayload>(() => ({ form, questions }), [form, questions]);
  const save = useCallback((p: SaveFormPayload) => saveForm(formId, p), [formId]);
  const { status: saveStatus, errorCode, flush } = useAutosave(payload, save, { enabled: !readOnly });

  // ---- publish checks (inline) ---------------------------------------------
  const local = useMemo(() => localProblems(form, questions), [form, questions]);
  const problemCodes = useMemo(() => {
    const codes = new Set<string>([...local.codes, ...serverProblems.filter((p) => !local.codes.includes(p) && isAccountProblem(p))]);
    return [...codes];
  }, [local.codes, serverProblems]);

  // ---- edits ---------------------------------------------------------------
  const patchForm = (patch: Partial<DraftForm>) => setForm((f) => ({ ...f, ...patch }));
  const patchQuestion = (id: string, patch: Partial<DraftQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const replaceQuestion = (q: DraftQuestion) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? q : x)));

  function insertAfterActive(q: DraftQuestion) {
    setQuestions((qs) => {
      const at = activeId ? qs.findIndex((x) => x.id === activeId) + 1 : qs.length;
      const next = [...qs];
      next.splice(at > 0 ? at : qs.length, 0, q);
      return next;
    });
    setActiveId(q.id);
    requestAnimationFrame(() =>
      document.getElementById(`question-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }

  function addQuestion() {
    if (questions.length >= LIMITS.questions) return;
    insertAfterActive({
      id: crypto.randomUUID(),
      type: "single_choice",
      title: "",
      description: null,
      required: false,
      options: [t("option", { n: 1 })],
      settings: {},
    });
  }

  function addSection() {
    if (questions.length >= LIMITS.questions) return;
    insertAfterActive({
      id: crypto.randomUUID(),
      type: "section",
      title: "",
      description: null,
      required: false,
      options: null,
      settings: {},
    });
  }

  function addImage() {
    if (questions.length >= LIMITS.questions) return;
    insertAfterActive({
      id: crypto.randomUUID(),
      type: "image",
      title: "",
      description: null,
      required: false,
      options: null,
      settings: {},
    });
  }

  // Page numbers for section cards: a page starts at each section (items before the first one form page 1).
  const pageInfo = useMemo(() => {
    const pageOf = new Map<string, number>();
    const numberOf = new Map<string, number>();
    let page = questions.length > 0 && questions[0].type === "section" ? 0 : 1;
    let n = 0;
    for (const q of questions) {
      if (q.type === "section") {
        page += 1;
        pageOf.set(q.id, page);
      } else if (isAnswerable(q)) numberOf.set(q.id, n++);
    }
    return { pageOf, numberOf, pages: Math.max(1, page) };
  }, [questions]);

  function duplicateQuestion(q: DraftQuestion) {
    if (questions.length >= LIMITS.questions) return;
    setActiveId(q.id);
    insertAfterActive({ ...structuredClone(q), id: crypto.randomUUID() });
  }

  function deleteQuestion(id: string) {
    setQuestions((qs) => {
      const i = qs.findIndex((q) => q.id === id);
      const next = qs.filter((q) => q.id !== id);
      setActiveId(next[Math.min(i, next.length - 1)]?.id ?? null);
      return next;
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    setQuestions((qs) => {
      const from = qs.findIndex((q) => q.id === active.id);
      const to = qs.findIndex((q) => q.id === over.id);
      return arrayMove(qs, from, to);
    });
  }

  // ---- status actions -------------------------------------------------------
  function reportError(code: string) {
    const key = ["form_not_found", "forbidden", "invalid_status_transition"].includes(code) ? code : "unknown";
    toast.error(t(`errors.${key}`));
  }

  function publish() {
    startTransition(async () => {
      setShowProblems(true);
      if (local.codes.length > 0) {
        setTab("questions");
        toast.error(t("problemsTitle"));
        return;
      }
      if (!(await flush())) return reportError("unknown");
      const res = await publishForm(formId);
      if (res.ok) {
        setStatus("open");
        setServerProblems([]);
        setShowProblems(false);
        setJustPublished(true);
        setShareOpen(true);
        router.refresh();
      } else if (res.problems?.length) {
        setServerProblems(res.problems);
        setTab("questions");
        toast.error(t("problemsTitle"));
      } else reportError(res.error);
    });
  }

  function toggleAccepting(accepting: boolean) {
    startTransition(async () => {
      if (accepting && !(await flush())) return reportError("unknown");
      const res = await setAcceptingResponses(formId, accepting);
      if (res.ok) {
        setStatus(accepting ? "open" : "closed");
        router.refresh();
      } else if (res.problems?.length) {
        setServerProblems(res.problems);
        setShowProblems(true);
        setTab("questions");
        toast.error(t("problemsTitle"));
      } else reportError(res.error);
    });
  }

  function duplicateToMine() {
    startTransition(async () => {
      const res = await duplicateForm(formId);
      if (res.ok) router.push(`/forms/${res.id}`);
      else reportError(res.error);
    });
  }

  // ---- render helpers --------------------------------------------------------
  const departmentOption = lookups.departments.find((d) => d.id === form.department_id);
  const renderForm: RenderForm = {
    title: form.title,
    description: form.description,
    departmentName: departmentOption?.name ?? null,
    departmentColor: departmentOption?.color ?? null,
    bannerUrl: bannerUrl(form.banner_path),
    bannerStyle: form.banner_style,
    themeColor: "var(--brand-accent)",
    collectName: form.collect_name,
    nameRequired: form.name_required,
    requiresLogin: form.requires_login,
  };
  const renderQuestions = questions.map((q) => (isAnswerable(q) ? { ...q, title: q.title || t("questionPlaceholder") } : q));
  const isLive = status === "open" || status === "closed";

  const acceptingToggle = isLive && !readOnly && (
    <section className="rounded-xl border bg-card px-5 shadow-xs sm:px-6">
      <SettingRow
        id="accepting"
        label={t("accepting")}
        hint={t("acceptingHint")}
        checked={status === "open"}
        disabled={busy}
        onChange={toggleAccepting}
      />
    </section>
  );

  return (
    <div className="-mx-4 -mt-6 md:-mx-8">
      {/* Builder bar */}
      <div className="sticky top-14 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2 md:px-6">
          <Button variant="ghost" size="icon" asChild>
            <Link href={props.backHref} aria-label={t("back")}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-base font-semibold">{form.title || t("untitledForm")}</p>
            <div className="flex items-center gap-2">
              <StatusBadge status={status} />
              {!readOnly && <SaveIndicator status={saveStatus} errorCode={errorCode} />}
            </div>
          </div>

          {props.canSaveTemplate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("saveAsTemplate")}
                  disabled={busy}
                  onClick={() =>
                    startTransition(async () => {
                      await flush();
                      const res = await saveFormAsMyTemplate(formId);
                      if (res.ok) router.push(`/templates/${res.id}`);
                      else reportError(res.error);
                    })
                  }
                >
                  <LayoutTemplate aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("saveAsTemplate")}</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setPreviewOpen(true)} aria-label={t("preview")}>
                <Eye aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("preview")}</TooltipContent>
          </Tooltip>

          {readOnly ? (
            <Button onClick={duplicateToMine} disabled={busy} aria-label={t("duplicateToMine")}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <CopyPlus aria-hidden />}
              <span className="hidden sm:inline">{t("duplicateToMine")}</span>
            </Button>
          ) : status === "draft" ? (
            accountActive ? (
              <Button onClick={publish} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                {busy ? t("publishing") : t("publish")}
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="rounded-md focus-visible:outline-2 focus-visible:outline-ring">
                    <Button disabled aria-describedby="publish-pending-hint">
                      <Send aria-hidden />
                      {t("publish")}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent id="publish-pending-hint">{t("publishPending")}</TooltipContent>
              </Tooltip>
            )
          ) : (
            <>
              {/* Archived forms are restored by a superadmin, not reopened here. */}
              {isLive && (
                <div className="hidden items-center gap-2 md:flex">
                  <Label htmlFor="accepting-bar" className="text-sm font-normal text-muted-foreground">
                    {t("accepting")}
                  </Label>
                  <Switch id="accepting-bar" checked={status === "open"} onCheckedChange={toggleAccepting} disabled={busy} />
                </div>
              )}
              <Button
                aria-label={t("share")}
                onClick={() => {
                  setJustPublished(false);
                  setShareOpen(true);
                }}
              >
                <Share2 aria-hidden />
                <span className="hidden sm:inline">{t("share")}</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mx-auto max-w-3xl gap-0 px-4 pt-4 pb-28 md:px-6">
        <TabsList className="mx-auto mb-4">
          <TabsTrigger value="questions">{t("tabQuestions")}</TabsTrigger>
          <TabsTrigger value="responses">
            {t("tabResponses")}
            {props.responseCount > 0 && (
              <span className="ml-1 rounded-full bg-brand-soft px-1.5 text-xs font-semibold text-foreground">
                {props.responseCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">{t("tabSettings")}</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="space-y-3">
          {readOnly && (
            <Alert>
              <AlertDescription>
                {props.ownerName ? t("readOnly", { owner: props.ownerName }) : t("readOnlyNoOwner")}
              </AlertDescription>
            </Alert>
          )}

          {!readOnly && showProblems && problemCodes.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden />
              <AlertTitle>{t("problemsTitle")}</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {problemCodes.map((code) => (
                    <li key={code}>{t(`problems.${code}`)}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {readOnly ? (
            <FormRenderer form={renderForm} questions={renderQuestions} preview />
          ) : (
            <>
              <HeaderCard
                formId={formId}
                form={form}
                lookups={lookups}
                onChange={patchForm}
                highlight={showProblems ? local.codes : []}
              />

              {questions.length === 0 ? (
                <EmptyState
                  icon={Plus}
                  title={t("emptyQuestionsTitle")}
                  body={t("emptyQuestionsBody")}
                  action={
                    <Button onClick={addQuestion}>
                      <Plus aria-hidden />
                      {t("addQuestion")}
                    </Button>
                  }
                />
              ) : (
                <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {questions.map((q, i) => (
                        <div key={q.id} id={`question-${q.id}`} className="scroll-mt-32">
                          {q.type === "section" ? (
                            <SectionCard
                              question={q}
                              page={pageInfo.pageOf.get(q.id) ?? 1}
                              pages={pageInfo.pages}
                              active={activeId === q.id}
                              onActivate={() => setActiveId(q.id)}
                              onChange={(patch) => patchQuestion(q.id, patch)}
                              onDelete={() => deleteQuestion(q.id)}
                            />
                          ) : q.type === "image" ? (
                            <ImageCard
                              question={q}
                              active={activeId === q.id}
                              imageFolder={formId}
                              issue={showProblems ? local.issues[q.id] : undefined}
                              onActivate={() => setActiveId(q.id)}
                              onChange={(patch) => patchQuestion(q.id, patch)}
                              onDuplicate={() => duplicateQuestion(q)}
                              onDelete={() => deleteQuestion(q.id)}
                            />
                          ) : (
                            <QuestionCard
                              question={q}
                              index={pageInfo.numberOf.get(q.id) ?? i}
                              active={activeId === q.id}
                              typeLocked={answered.has(q.id)}
                              imageFolder={formId}
                              issue={showProblems ? local.issues[q.id] : undefined}
                              onActivate={() => setActiveId(q.id)}
                              onChange={(patch) => patchQuestion(q.id, patch)}
                              onReplace={replaceQuestion}
                              onDuplicate={() => duplicateQuestion(q)}
                              onDelete={() => deleteQuestion(q.id)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {questions.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <Button variant="outline" onClick={addQuestion}>
                    <Plus aria-hidden />
                    {t("addQuestion")}
                  </Button>
                  <Button variant="outline" onClick={addImage}>
                    <ImagePlus aria-hidden />
                    {t("addImage")}
                  </Button>
                  <Button variant="outline" onClick={addSection}>
                    <BetweenHorizontalStart aria-hidden />
                    {t("addSection")}
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="responses">
          <ResponsesPanel formId={formId} questions={questions} isDraft={status === "draft"} />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsPanel form={form} onChange={patchForm} readOnly={readOnly} acceptingToggle={acceptingToggle} />
        </TabsContent>
      </Tabs>

      {/* Floating "Add question" (above the mobile bottom nav). */}
      {!readOnly && tab === "questions" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              onClick={addQuestion}
              aria-label={t("addQuestion")}
              className="fixed right-4 bottom-20 z-30 size-14 rounded-full shadow-lg md:right-8 md:bottom-8"
            >
              <Plus className="size-6" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{t("addQuestion")}</TooltipContent>
        </Tooltip>
      )}

      <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} form={renderForm} questions={renderQuestions} />
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={shareUrl}
        justPublished={justPublished}
        closed={status === "closed"}
      />
    </div>
  );
}

function isAccountProblem(p: string) {
  return p === "owner_not_active" || p === "publish_requires_active_account";
}

function HeaderCard({
  formId,
  form,
  lookups,
  onChange,
  highlight,
}: {
  formId: string;
  form: DraftForm;
  lookups: Lookups;
  onChange: (patch: Partial<DraftForm>) => void;
  highlight: string[];
}) {
  const t = useTranslations("builder");
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs" aria-label={t("formTitle")}>
      <div className="h-2.5 bg-brand" aria-hidden />
      <div className="space-y-3 p-4 sm:p-6">
        <BannerPicker
          formId={formId}
          path={form.banner_path}
          style={form.banner_style}
          onChange={onChange}
          title={form.title}
          department={(() => {
            const d = lookups.departments.find((x) => x.id === form.department_id);
            return d ? { name: d.name, color: d.color ?? null } : null;
          })()}
        />
        <Textarea
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
          aria-label={t("formTitle")}
          maxLength={LIMITS.formTitle}
          rows={1}
          className="field-sizing-content min-h-12 resize-none rounded-none border-0 border-b px-0 font-heading text-2xl font-bold shadow-none focus-visible:border-b-2 focus-visible:border-brand focus-visible:ring-0 sm:text-3xl md:text-3xl"
        />
        <Textarea
          value={form.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value || null })}
          placeholder={t("descriptionPlaceholder")}
          aria-label={t("formDescription")}
          maxLength={LIMITS.formDescription}
          rows={1}
          className="field-sizing-content min-h-9 resize-none rounded-none border-0 border-b px-0 text-sm shadow-none focus-visible:border-b-2 focus-visible:border-brand focus-visible:ring-0"
        />

        {/* Tracking tags: pre-filled, required only to publish (PRD B7). */}
        <div className={cn("grid gap-3 pt-2", lookups.chapters.length > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          <LookupSelect
            id="department"
            label={t("department")}
            placeholder={t("selectDepartment")}
            value={form.department_id}
            options={lookups.departments}
            invalid={highlight.includes("department_required")}
            onChange={(v) => onChange({ department_id: v })}
          />
          <LookupSelect
            id="category"
            label={t("category")}
            placeholder={t("selectCategory")}
            value={form.category_id}
            options={lookups.categories}
            invalid={highlight.includes("category_required")}
            onChange={(v) => onChange({ category_id: v })}
          />
          {lookups.chapters.length > 0 && (
            <LookupSelect
              id="chapter"
              label={t("chapter")}
              placeholder={t("chapterNone")}
              value={form.chapter_id}
              options={lookups.chapters}
              noneLabel={t("chapterNone")}
              onChange={(v) => onChange({ chapter_id: v })}
            />
          )}
        </div>
      </div>
    </section>
  );
}

const NONE = "__none__";

function LookupSelect({
  id,
  label,
  placeholder,
  value,
  options,
  onChange,
  invalid,
  noneLabel,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string | null;
  options: Option[];
  onChange: (value: string | null) => void;
  invalid?: boolean;
  noneLabel?: string;
}) {
  const t = useTranslations("builder");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? (noneLabel ? NONE : "")} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: o.color }} aria-hidden />}
              {o.archived ? t("archivedSuffix", { name: o.name }) : o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SaveIndicator({ status, errorCode }: { status: SaveStatus; errorCode: string | null }) {
  const t = useTranslations("builder");
  const content: Record<SaveStatus, React.ReactNode> = {
    saved: (
      <>
        <Check className="size-3.5" aria-hidden />
        {t("saved")}
      </>
    ),
    dirty: t("unsaved"),
    saving: (
      <>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {t("saving")}
      </>
    ),
    offline: (
      <>
        <CloudOff className="size-3.5" aria-hidden />
        {t("offline")}
      </>
    ),
    error: (
      <>
        <AlertCircle className="size-3.5" aria-hidden />
        {errorCode === "answered_question_type_locked" ? t("saveErrorTypeLocked") : t("saveError")}
      </>
    ),
  };
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-w-0 items-center gap-1 truncate text-xs",
        status === "error" || status === "offline" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {content[status]}
    </span>
  );
}
