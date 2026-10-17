"use client";

import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { LineInput, LineTextarea } from "@/components/ui/line-field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_SCALE } from "@/lib/questions";
import type { AnswerError } from "@/lib/forms/answers";
import { cn } from "@/lib/utils";
import { OTHER, type FieldValue, type RenderQuestion } from "./types";

/**
 * One numbered question on the sheet. No card of its own: questions are
 * separated by the sheet's dividers; errors tint the block and the number.
 */
export function QuestionField({
  question: q,
  number,
  field,
  error,
  onChange,
  disabled,
}: {
  question: RenderQuestion;
  number: number;
  field: FieldValue;
  error?: AnswerError;
  onChange: (next: FieldValue) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("respond");
  const titleId = `q-${q.id}-title`;
  const descId = `q-${q.id}-desc`;
  const errId = `q-${q.id}-error`;
  const describedBy = [q.description ? descId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  const options = (q.options ?? []).filter((o) => o.trim() !== "");
  const allowOther = q.type !== "dropdown" && q.settings.allow_other === true;
  const common = { "aria-labelledby": titleId, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined };
  const choiceRow = "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 -mx-2 transition-colors hover:bg-muted/70";

  return (
    <QuestionBlock id={`q-${q.id}`} number={number} error={Boolean(error)}>
      <fieldset>
        <legend className="sr-only">{q.title}</legend>
        <p id={titleId} className="text-base leading-snug font-semibold whitespace-pre-wrap">
          {q.title}
          {q.required && (
            <span className="ml-1 text-destructive" aria-label={t("required")}>
              *
            </span>
          )}
        </p>
        {q.description && (
          <p id={descId} className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
            {q.description}
          </p>
        )}

        <div className="mt-4">
          {q.type === "short_text" && (
            <LineInput
              {...common}
              value={(field.value as string) ?? ""}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder={t("yourAnswer")}
              maxLength={500}
              disabled={disabled}
              wrapperClassName="max-w-md"
            />
          )}

          {q.type === "paragraph" && (
            <LineTextarea
              {...common}
              value={(field.value as string) ?? ""}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder={t("yourAnswer")}
              maxLength={5000}
              rows={2}
              disabled={disabled}
            />
          )}

          {q.type === "single_choice" && (
            <div>
              <RadioGroup
                {...common}
                value={field.otherSelected ? OTHER : ((field.value as string) ?? "")}
                onValueChange={(v) =>
                  onChange(v === OTHER ? { ...field, value: undefined, otherSelected: true } : { value: v, other: field.other })
                }
                disabled={disabled}
                className="gap-0.5"
              >
                {options.map((o, i) => (
                  <label key={i} className={choiceRow}>
                    <RadioGroupItem value={o} />
                    <span className="text-[15px]">{o}</span>
                  </label>
                ))}
                {allowOther && (
                  <div className="-mx-2 flex min-h-11 items-center gap-3 px-2">
                    <RadioGroupItem value={OTHER} aria-label={t("otherInput")} />
                    <span className="shrink-0 text-[15px]">{t("other")}</span>
                    <LineInput
                      aria-label={t("otherInput")}
                      value={field.other ?? ""}
                      onChange={(e) => onChange({ value: undefined, other: e.target.value, otherSelected: true })}
                      maxLength={500}
                      disabled={disabled}
                      className="h-9 py-1"
                      wrapperClassName="flex-1"
                    />
                  </div>
                )}
              </RadioGroup>
              {!q.required && (field.value || field.otherSelected) && (
                <ClearButton onClick={() => onChange({})} disabled={disabled} label={t("clearSelection")} />
              )}
            </div>
          )}

          {q.type === "multiple_choice" && (
            <div role="group" {...common} className="grid gap-0.5">
              {options.map((o, i) => {
                const selected = Array.isArray(field.value) && field.value.includes(o);
                return (
                  <label key={i} className={choiceRow}>
                    <Checkbox
                      checked={selected}
                      disabled={disabled}
                      onCheckedChange={(checked) => {
                        const current = Array.isArray(field.value) ? field.value : [];
                        onChange({ ...field, value: checked ? [...current, o] : current.filter((v) => v !== o) });
                      }}
                    />
                    <span className="text-[15px]">{o}</span>
                  </label>
                );
              })}
              {allowOther && (
                <div className="-mx-2 flex min-h-11 items-center gap-3 px-2">
                  <Checkbox
                    aria-label={t("otherInput")}
                    checked={field.otherSelected ?? false}
                    disabled={disabled}
                    onCheckedChange={(checked) => onChange({ ...field, otherSelected: checked === true })}
                  />
                  <span className="shrink-0 text-[15px]">{t("other")}</span>
                  <LineInput
                    aria-label={t("otherInput")}
                    value={field.other ?? ""}
                    onChange={(e) => onChange({ ...field, other: e.target.value, otherSelected: e.target.value !== "" || field.otherSelected })}
                    maxLength={500}
                    disabled={disabled}
                    className="h-9 py-1"
                    wrapperClassName="flex-1"
                  />
                </div>
              )}
            </div>
          )}

          {q.type === "dropdown" && (
            <Select value={(field.value as string) ?? ""} onValueChange={(v) => onChange({ value: v })} disabled={disabled}>
              <SelectTrigger {...common} className="h-10 w-full max-w-xs">
                <SelectValue placeholder={t("choose")} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o, i) => (
                  <SelectItem key={i} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {q.type === "scale" && <ScaleField q={q} field={field} onChange={onChange} disabled={disabled} common={common} />}

          {q.type === "date" && (
            <LineInput
              {...common}
              type="date"
              value={(field.value as string) ?? ""}
              onChange={(e) => onChange({ value: e.target.value })}
              disabled={disabled}
              wrapperClassName="inline-block w-auto"
              className="w-auto"
            />
          )}
        </div>

        {error && <FieldError id={errId} message={t(`errors.${error}`)} />}
      </fieldset>
    </QuestionBlock>
  );
}

/** Numbered row on the sheet ("01", "02", …). `number = 0` renders an unnumbered row. */
export function QuestionBlock({
  id,
  number,
  error,
  children,
}: {
  id?: string;
  number: number;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      id={id}
      className={cn(
        "grid scroll-mt-24 grid-cols-[2rem_minmax(0,1fr)] gap-x-2 px-5 py-6 transition-colors sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:px-8",
        error && "bg-destructive/[0.035]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pt-0.5 font-heading text-sm font-bold tabular-nums",
          error ? "text-destructive" : number > 0 ? "text-[var(--form-accent,var(--brand-accent))]" : "text-muted-foreground/60",
        )}
      >
        {number > 0 ? String(number).padStart(2, "0") : "—"}
      </span>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

export function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

function ScaleField({
  q,
  field,
  onChange,
  disabled,
  common,
}: {
  q: RenderQuestion;
  field: FieldValue;
  onChange: (next: FieldValue) => void;
  disabled?: boolean;
  common: Record<string, unknown>;
}) {
  const t = useTranslations("respond");
  const min = q.settings.min ?? DEFAULT_SCALE.min;
  const max = q.settings.max ?? DEFAULT_SCALE.max;
  const values = Array.from({ length: max - min + 1 }, (_, i) => String(min + i));
  const selected = (field.value as string) ?? "";

  return (
    <div>
      <RadioGroup
        {...common}
        value={selected}
        onValueChange={(v) => onChange({ value: v })}
        disabled={disabled}
        className="flex flex-wrap gap-2"
      >
        {values.map((v) => (
          <label
            key={v}
            className={cn(
              "relative flex size-11 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold tabular-nums transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              selected === v
                ? "border-[var(--form-accent,var(--brand-accent))] bg-[var(--form-accent,var(--brand-accent))] text-white"
                : "hover:border-foreground/40 hover:bg-muted/60",
            )}
          >
            {/* The real radio covers the pill invisibly: clickable, focusable and announced as "4". */}
            <RadioGroupItem value={v} className="absolute inset-0 size-full cursor-pointer rounded-md border-0 opacity-0" />
            {v}
          </label>
        ))}
      </RadioGroup>
      {(q.settings.min_label || q.settings.max_label) && (
        <p className="mt-2 flex justify-between gap-4 text-xs text-muted-foreground">
          {q.settings.min_label && (
            <span>
              {min} = {q.settings.min_label}
            </span>
          )}
          {q.settings.max_label && (
            <span className="ml-auto text-right">
              {max} = {q.settings.max_label}
            </span>
          )}
        </p>
      )}
      {!q.required && field.value && <ClearButton onClick={() => onChange({})} disabled={disabled} label={t("clearSelection")} />}
    </div>
  );
}

function ClearButton({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="rounded px-1 py-1 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {label}
      </button>
    </div>
  );
}
