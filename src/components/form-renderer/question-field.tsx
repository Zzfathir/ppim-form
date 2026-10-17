"use client";

import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SCALE } from "@/lib/questions";
import type { AnswerError } from "@/lib/forms/answers";
import { cn } from "@/lib/utils";
import { OTHER, type FieldValue, type RenderQuestion } from "./types";

const underline =
  "rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:border-b-2 focus-visible:border-[var(--form-accent)] focus-visible:ring-0";

export function QuestionField({
  question: q,
  field,
  error,
  onChange,
  disabled,
}: {
  question: RenderQuestion;
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

  return (
    <fieldset
      id={`q-${q.id}`}
      className={cn(
        "rounded-xl border bg-card p-5 shadow-xs transition-colors sm:p-6",
        error && "border-destructive/60 bg-destructive/[0.02]",
      )}
    >
      <legend className="sr-only">{q.title}</legend>
      <p id={titleId} className="text-base leading-snug font-medium whitespace-pre-wrap">
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
          <Input
            {...common}
            value={(field.value as string) ?? ""}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={t("yourAnswer")}
            maxLength={500}
            disabled={disabled}
            className={cn(underline, "max-w-md")}
          />
        )}

        {q.type === "paragraph" && (
          <Textarea
            {...common}
            value={(field.value as string) ?? ""}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={t("yourAnswer")}
            maxLength={5000}
            rows={2}
            disabled={disabled}
            className={cn(underline, "field-sizing-content min-h-10 resize-none")}
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
              className="gap-1"
            >
              {options.map((o, i) => (
                <label key={i} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 hover:bg-muted/60">
                  <RadioGroupItem value={o} />
                  <span className="text-sm">{o}</span>
                </label>
              ))}
              {allowOther && (
                <div className="flex min-h-11 items-center gap-3 px-1">
                  <RadioGroupItem value={OTHER} aria-label={t("otherInput")} />
                  <span className="shrink-0 text-sm">{t("other")}</span>
                  <Input
                    aria-label={t("otherInput")}
                    value={field.other ?? ""}
                    onChange={(e) => onChange({ value: undefined, other: e.target.value, otherSelected: true })}
                    maxLength={500}
                    disabled={disabled}
                    className={cn(underline, "h-8")}
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
          <div role="group" {...common} className="grid gap-1">
            {options.map((o, i) => {
              const selected = Array.isArray(field.value) && field.value.includes(o);
              return (
                <label key={i} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 hover:bg-muted/60">
                  <Checkbox
                    checked={selected}
                    disabled={disabled}
                    onCheckedChange={(checked) => {
                      const current = Array.isArray(field.value) ? field.value : [];
                      onChange({ ...field, value: checked ? [...current, o] : current.filter((v) => v !== o) });
                    }}
                  />
                  <span className="text-sm">{o}</span>
                </label>
              );
            })}
            {allowOther && (
              <div className="flex min-h-11 items-center gap-3 px-1">
                <Checkbox
                  aria-label={t("otherInput")}
                  checked={field.otherSelected ?? false}
                  disabled={disabled}
                  onCheckedChange={(checked) => onChange({ ...field, otherSelected: checked === true })}
                />
                <span className="shrink-0 text-sm">{t("other")}</span>
                <Input
                  aria-label={t("otherInput")}
                  value={field.other ?? ""}
                  onChange={(e) => onChange({ ...field, other: e.target.value, otherSelected: e.target.value !== "" || field.otherSelected })}
                  maxLength={500}
                  disabled={disabled}
                  className={cn(underline, "h-8")}
                />
              </div>
            )}
          </div>
        )}

        {q.type === "dropdown" && (
          <Select value={(field.value as string) ?? ""} onValueChange={(v) => onChange({ value: v })} disabled={disabled}>
            <SelectTrigger {...common} className="w-full max-w-xs">
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
          <Input
            {...common}
            type="date"
            value={(field.value as string) ?? ""}
            onChange={(e) => onChange({ value: e.target.value })}
            disabled={disabled}
            className={cn(underline, "w-auto")}
          />
        )}
      </div>

      {error && (
        <p id={errId} role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {t(`errors.${error}`)}
        </p>
      )}
    </fieldset>
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

  return (
    <div className="@container">
      <RadioGroup
        {...common}
        value={(field.value as string) ?? ""}
        onValueChange={(v) => onChange({ value: v })}
        disabled={disabled}
        className="flex flex-wrap items-end justify-between gap-y-3 @md:flex-nowrap"
      >
        {q.settings.min_label && (
          <span className="order-first basis-full text-xs text-muted-foreground @md:order-none @md:basis-auto @md:self-end @md:pb-1 @md:text-sm">
            {q.settings.min_label}
          </span>
        )}
        {values.map((v) => (
          <label key={v} className="flex min-w-9 flex-1 cursor-pointer flex-col items-center gap-2 py-1">
            <span className="text-sm">{v}</span>
            <RadioGroupItem value={v} />
          </label>
        ))}
        {q.settings.max_label && (
          <span className="basis-full text-right text-xs text-muted-foreground @md:basis-auto @md:self-end @md:pb-1 @md:text-sm">
            {q.settings.max_label}
          </span>
        )}
      </RadioGroup>
      {!q.required && field.value && (
        <ClearButton onClick={() => onChange({})} disabled={disabled} label={t("clearSelection")} />
      )}
    </div>
  );
}

function ClearButton({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <div className="mt-2 flex justify-end">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="rounded px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        {label}
      </button>
    </div>
  );
}
