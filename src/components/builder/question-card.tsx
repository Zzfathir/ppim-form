"use client";

import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, Calendar, Circle, Copy, GripHorizontal, Lock, Square, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { convertQuestion, LIMITS, SCALE_MAX_VALUES, SCALE_MIN_VALUES, type DraftQuestion } from "@/lib/forms/schema";
import { DEFAULT_SCALE, type QuestionType } from "@/lib/questions";
import { cn } from "@/lib/utils";
import { OptionsEditor } from "./options-editor";
import { QUESTION_ICONS, QUESTION_TYPE_GROUPS, type QuestionIssue } from "./question-meta";

type Props = {
  question: DraftQuestion;
  index: number;
  active: boolean;
  typeLocked: boolean;
  issue?: QuestionIssue;
  onActivate: () => void;
  onChange: (patch: Partial<DraftQuestion>) => void;
  onReplace: (q: DraftQuestion) => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function QuestionCard(props: Props) {
  const { question: q, index, active, issue, onActivate } = props;
  const t = useTranslations("builder");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: q.id,
  });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={t("questionNumber", { n: index + 1 })}
      onFocusCapture={onActivate}
      onClick={onActivate}
      className={cn(
        "relative rounded-xl border bg-card shadow-xs",
        active && "shadow-md",
        isDragging && "z-10 opacity-90 shadow-lg",
        issue && !active && "border-destructive/60",
      )}
    >
      {active && <div className="absolute inset-y-0 left-0 w-1.5 rounded-l-xl bg-brand" aria-hidden />}
      <div className="flex justify-center">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("dragHandle", { n: index + 1 })}
          className="cursor-grab touch-none rounded px-4 pt-1 text-muted-foreground/60 hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
        >
          <GripHorizontal className="size-5" aria-hidden />
        </button>
      </div>
      <div className="px-4 pb-4 sm:px-6">{active ? <ActiveBody {...props} /> : <InactiveBody {...props} />}</div>
      {issue && (
        <p className="flex items-center gap-1.5 border-t px-4 py-2 text-sm text-destructive sm:px-6">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {t(`problems.${issue}`)}
        </p>
      )}
    </section>
  );
}

/** Collapsed card: a quiet preview of the question, like Google Forms. */
function InactiveBody({ question: q }: Props) {
  const t = useTranslations("builder");
  const options = (q.options ?? []).filter(Boolean);
  return (
    <div className="cursor-pointer">
      <p className={cn("text-base whitespace-pre-wrap", !q.title && "text-muted-foreground")}>
        {q.title || t("questionPlaceholder")}
        {q.required && <span className="ml-1 text-destructive">*</span>}
      </p>
      {q.description && <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{q.description}</p>}
      <div className="mt-3 text-sm text-muted-foreground">
        {q.type === "short_text" && <p className="w-1/2 border-b border-dotted pb-1">{t("shortAnswerText")}</p>}
        {q.type === "paragraph" && <p className="w-3/4 border-b border-dotted pb-1">{t("longAnswerText")}</p>}
        {(q.type === "single_choice" || q.type === "multiple_choice" || q.type === "dropdown") && (
          <ul className="space-y-2">
            {options.map((o, i) => (
              <li key={i} className="flex items-center gap-3">
                {q.type === "single_choice" && <Circle className="size-4" aria-hidden />}
                {q.type === "multiple_choice" && <Square className="size-4" aria-hidden />}
                {q.type === "dropdown" && <span className="w-4 text-right">{i + 1}.</span>}
                <span className="text-foreground">{o}</span>
              </li>
            ))}
            {q.type !== "dropdown" && q.settings.allow_other && (
              <li className="flex items-center gap-3">
                {q.type === "single_choice" ? <Circle className="size-4" aria-hidden /> : <Square className="size-4" aria-hidden />}
                {t("other")}
              </li>
            )}
          </ul>
        )}
        {q.type === "scale" && (
          <p>
            {q.settings.min ?? DEFAULT_SCALE.min} – {q.settings.max ?? DEFAULT_SCALE.max}
          </p>
        )}
        {q.type === "date" && (
          <p className="flex w-48 items-center justify-between border-b border-dotted pb-1">
            {t("datePlaceholder")} <Calendar className="size-4" aria-hidden />
          </p>
        )}
      </div>
    </div>
  );
}

function ActiveBody({ question: q, index, typeLocked, onChange, onReplace, onDuplicate, onDelete }: Props) {
  const t = useTranslations("builder");
  const tt = useTranslations("questionTypes");
  const hasDescription = q.description !== null;

  const typeSelect = (
    <Select
      value={q.type}
      disabled={typeLocked}
      onValueChange={(type) => onReplace(convertQuestion(q, type as QuestionType, (n) => t("option", { n })))}
    >
      <SelectTrigger aria-label={t("type")} className="w-full sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {QUESTION_TYPE_GROUPS.map((group, gi) => (
          <SelectGroup key={gi}>
            {gi > 0 && <SelectSeparator />}
            {group.map((type) => {
              const Icon = QUESTION_ICONS[type];
              return (
                <SelectItem key={type} value={type}>
                  <Icon aria-hidden />
                  {tt(type)}
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Textarea
          value={q.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={t("questionPlaceholder")}
          aria-label={t("questionNumber", { n: index + 1 })}
          maxLength={LIMITS.questionTitle}
          rows={1}
          autoFocus={q.title === ""}
          className="field-sizing-content min-h-12 flex-1 resize-none rounded-none border-0 border-b bg-muted/60 px-3 py-3 text-base shadow-none focus-visible:border-b-2 focus-visible:border-brand focus-visible:ring-0"
        />
        {typeLocked ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                {typeSelect}
                <Lock className="size-4 shrink-0 text-muted-foreground" aria-label={t("typeLocked")} />
              </div>
            </TooltipTrigger>
            <TooltipContent>{t("typeLocked")}</TooltipContent>
          </Tooltip>
        ) : (
          typeSelect
        )}
      </div>

      {hasDescription && (
        <Textarea
          value={q.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={t("questionDescription")}
          aria-label={t("questionDescription")}
          maxLength={LIMITS.questionDescription}
          rows={1}
          className="field-sizing-content min-h-9 resize-none rounded-none border-0 border-b px-0 text-sm shadow-none focus-visible:border-b-2 focus-visible:border-brand focus-visible:ring-0"
        />
      )}

      {(q.type === "single_choice" || q.type === "multiple_choice" || q.type === "dropdown") && (
        <OptionsEditor question={q} onChange={onChange} />
      )}
      {q.type === "short_text" && (
        <p className="w-1/2 border-b border-dotted pb-1 text-sm text-muted-foreground">{t("shortAnswerText")}</p>
      )}
      {q.type === "paragraph" && (
        <p className="w-3/4 border-b border-dotted pb-1 text-sm text-muted-foreground">{t("longAnswerText")}</p>
      )}
      {q.type === "date" && (
        <p className="flex w-48 items-center justify-between border-b border-dotted pb-1 text-sm text-muted-foreground">
          {t("datePlaceholder")} <Calendar className="size-4" aria-hidden />
        </p>
      )}
      {q.type === "scale" && <ScaleEditor q={q} onChange={onChange} />}

      <div className="flex flex-wrap items-center justify-end gap-1 border-t pt-3">
        <button
          type="button"
          onClick={() => onChange({ description: hasDescription ? null : "" })}
          className="mr-auto rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {hasDescription ? t("removeDescription") : t("addDescription")}
        </button>
        <IconAction label={t("duplicateQuestion")} onClick={onDuplicate}>
          <Copy className="size-5" aria-hidden />
        </IconAction>
        <IconAction label={t("deleteQuestion")} onClick={onDelete}>
          <Trash2 className="size-5" aria-hidden />
        </IconAction>
        <span className="mx-2 h-8 w-px bg-border" aria-hidden />
        <Label htmlFor={`required-${q.id}`} className="cursor-pointer text-sm font-normal">
          {t("required")}
        </Label>
        <Switch id={`required-${q.id}`} checked={q.required} onCheckedChange={(required) => onChange({ required })} />
      </div>
    </div>
  );
}

function ScaleEditor({ q, onChange }: { q: DraftQuestion; onChange: (patch: Partial<DraftQuestion>) => void }) {
  const t = useTranslations("builder");
  const min = q.settings.min ?? DEFAULT_SCALE.min;
  const max = q.settings.max ?? DEFAULT_SCALE.max;
  const setSettings = (patch: Partial<DraftQuestion["settings"]>) => onChange({ settings: { ...q.settings, ...patch } });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <Select value={String(min)} onValueChange={(v) => setSettings({ min: Number(v) as 0 | 1 })}>
          <SelectTrigger aria-label={t("scaleFrom")} className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCALE_MIN_VALUES.map((v) => (
              <SelectItem key={v} value={String(v)}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">{t("scaleTo")}</span>
        <Select value={String(max)} onValueChange={(v) => setSettings({ max: Number(v) })}>
          <SelectTrigger aria-label={t("scaleTo")} className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCALE_MAX_VALUES.map((v) => (
              <SelectItem key={v} value={String(v)}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {(["min_label", "max_label"] as const).map((key) => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-5 text-right text-sm text-muted-foreground">{key === "min_label" ? min : max}</span>
          <Input
            value={q.settings[key] ?? ""}
            onChange={(e) => setSettings({ [key]: e.target.value || undefined })}
            placeholder={t("scaleLabel")}
            aria-label={`${key === "min_label" ? min : max} — ${t("scaleLabel")}`}
            maxLength={LIMITS.scaleLabel}
            className="max-w-xs rounded-none border-0 border-b px-0 shadow-none focus-visible:border-b-2 focus-visible:border-brand focus-visible:ring-0"
          />
        </div>
      ))}
    </div>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="rounded-full p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
