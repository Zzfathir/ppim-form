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
import { AlertCircle, ArrowLeft, Check, Loader2, Plus, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { QuestionCard } from "@/components/builder/question-card";
import { useAutosave } from "@/components/builder/use-autosave";
import { LIMITS, type DraftQuestion } from "@/lib/forms/schema";
import type { Option } from "@/lib/forms/queries";
import { deleteTemplate, saveTemplate } from "@/app/(app)/templates/actions";
import { ShareDialog } from "@/components/templates/share-dialog";

type TemplateDraft = {
  title: string;
  description: string | null;
  category_id: string | null;
  is_published: boolean;
  questions: DraftQuestion[];
};

/** Template editing reuses the builder's question cards, drag-and-drop and autosave. */
export function TemplateEditor({
  id,
  initial,
  categories,
  official,
  canShare,
  backHref,
}: {
  id: string;
  initial: TemplateDraft;
  categories: Option[];
  /** Official (secretariat) templates have a "Published" switch; department templates don't. */
  official: boolean;
  canShare: boolean;
  backHref: string;
}) {
  const t = useTranslations("templates.editor");
  const tb = useTranslations("builder");
  const te = useTranslations("admin.errors");
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(initial.questions[0]?.id ?? null);
  const [busy, startTransition] = useTransition();
  const [sharing, setSharing] = useState(false);
  const dndId = useId();

  const save = useCallback(
    async (d: TemplateDraft) => {
      if (!d.title.trim()) return { ok: false as const, error: "invalid" };
      return saveTemplate(id, d);
    },
    [id],
  );
  const { status } = useAutosave(draft, save);

  const patch = (p: Partial<TemplateDraft>) => setDraft((d) => ({ ...d, ...p }));
  const setQuestions = (fn: (qs: DraftQuestion[]) => DraftQuestion[]) => setDraft((d) => ({ ...d, questions: fn(d.questions) }));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setQuestions((qs) => arrayMove(qs, qs.findIndex((q) => q.id === active.id), qs.findIndex((q) => q.id === over.id)));
  };

  function insertAfter(afterId: string | null, q: DraftQuestion) {
    setQuestions((qs) => {
      const at = afterId ? qs.findIndex((x) => x.id === afterId) + 1 : qs.length;
      const next = [...qs];
      next.splice(at > 0 ? at : qs.length, 0, q);
      return next;
    });
    setActiveId(q.id);
  }

  const issues = useMemo(() => !draft.title.trim(), [draft.title]);

  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href={backHref} aria-label={t("back")}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{draft.title || t("untitled")}</h1>
        <span role="status" aria-live="polite" className="flex items-center gap-1 text-xs text-muted-foreground">
          {status === "saving" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {status === "saved" && <Check className="size-3.5" aria-hidden />}
          {status === "error" && <AlertCircle className="size-3.5 text-destructive" aria-hidden />}
          {status === "saved" ? tb("saved") : status === "saving" ? tb("saving") : status === "error" ? tb("saveError") : status === "offline" ? tb("offline") : tb("unsaved")}
        </span>
        {canShare && (
          <Button variant="outline" onClick={() => setSharing(true)}>
            <Share2 aria-hidden />
            {t("share")}
          </Button>
        )}
        <Button
          variant="ghost"
          className="text-destructive"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              if (!window.confirm(t("deleteConfirm"))) return;
              const res = await deleteTemplate(id);
              if (res.ok) router.push(backHref);
              else toast.error(te(res.error));
            })
          }
        >
          <Trash2 aria-hidden />
          {t("delete")}
        </Button>
      </div>

      <section className="space-y-3 overflow-hidden rounded-xl border bg-card p-4 shadow-xs sm:p-6">
        <Textarea
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          aria-label={t("titleLabel")}
          aria-invalid={issues || undefined}
          maxLength={200}
          rows={1}
          className="field-sizing-content min-h-12 resize-none rounded-none border-0 border-b px-0 font-heading text-2xl font-bold shadow-none focus-visible:border-b-2 focus-visible:border-brand focus-visible:ring-0"
        />
        <Textarea
          value={draft.description ?? ""}
          onChange={(e) => patch({ description: e.target.value || null })}
          placeholder={tb("descriptionPlaceholder")}
          aria-label={tb("formDescription")}
          maxLength={LIMITS.formDescription}
          rows={1}
          className="field-sizing-content min-h-9 resize-none rounded-none border-0 border-b px-0 text-sm shadow-none focus-visible:border-b-2 focus-visible:border-brand focus-visible:ring-0"
        />
        <div className="flex flex-wrap items-end gap-4 pt-2">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="template-category" className="text-xs text-muted-foreground">
              {t("category")}
            </Label>
            <Select value={draft.category_id ?? ""} onValueChange={(v) => patch({ category_id: v })}>
              <SelectTrigger id="template-category" className="w-full">
                <SelectValue placeholder={tb("selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {official && (
            <div className="flex items-center gap-2 pb-2">
              <Label htmlFor="template-published" className="text-sm font-normal">
                {t("published")}
              </Label>
              <Switch id="template-published" checked={draft.is_published} onCheckedChange={(v) => patch({ is_published: v })} />
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{official ? t("publishedHint") : t("visibilityHint")}</p>
      </section>

      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={draft.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {draft.questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={i}
                active={activeId === q.id}
                typeLocked={false}
                onActivate={() => setActiveId(q.id)}
                onChange={(p) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, ...p } : x)))}
                onReplace={(nq) => setQuestions((qs) => qs.map((x) => (x.id === nq.id ? nq : x)))}
                onDuplicate={() => insertAfter(q.id, { ...structuredClone(q), id: crypto.randomUUID() })}
                onDelete={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex justify-center pt-2">
        <Button
          variant="outline"
          onClick={() =>
            insertAfter(activeId, {
              id: crypto.randomUUID(),
              type: "single_choice",
              title: "",
              description: null,
              required: false,
              options: [tb("option", { n: 1 })],
              settings: {},
            })
          }
        >
          <Plus aria-hidden />
          {tb("addQuestion")}
        </Button>
      </div>
      {canShare && <ShareDialog templateId={id} title={draft.title} open={sharing} onOpenChange={setSharing} />}
    </div>
  );
}
