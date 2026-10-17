"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2, UserRound } from "lucide-react";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { LineInput } from "@/components/ui/line-field";
import { ANSWER_LIMITS, validateAnswers, type AnswerError, type AnswerValue } from "@/lib/forms/answers";
import { FormSheet } from "./form-sheet";
import { FieldError, QuestionBlock, QuestionField } from "./question-field";
import { NAME_FIELD, type FieldValue, type RenderForm, type RenderQuestion } from "./types";

export type SubmitPayload = { answers: Record<string, AnswerValue>; name: string | null; website: string };
export type SubmitResult = { ok: true } | { ok: false; errors?: Record<string, AnswerError>; message?: string };

/** Turns UI field state into the stored answer shape (see lib/forms/answers.ts). */
function toAnswer(q: RenderQuestion, field: FieldValue | undefined): unknown {
  if (!field) return undefined;
  const other = field.otherSelected ? (field.other ?? "").trim() : "";
  if (q.type === "multiple_choice") {
    const values = Array.isArray(field.value) ? field.value : [];
    return field.otherSelected && other ? [...values, other] : values;
  }
  if (q.type === "single_choice" && field.otherSelected) return other;
  if (q.type === "scale" && typeof field.value === "string") return Number(field.value);
  return field.value;
}

/**
 * The respondent view: a single sheet with numbered questions. Used for the
 * builder preview (submit disabled) and the public /f/{slug} page.
 */
export function FormRenderer({
  form,
  questions,
  preview = false,
  onSubmit,
}: {
  form: RenderForm;
  questions: RenderQuestion[];
  preview?: boolean;
  onSubmit?: (payload: SubmitPayload) => Promise<SubmitResult>;
}) {
  const t = useTranslations("respond");
  const [fields, setFields] = useState<Record<string, FieldValue>>({});
  const [errors, setErrors] = useState<Record<string, AnswerError>>({});
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const showName = form.collectName && !form.requiresLogin;
  const nameRequired = showName && form.nameRequired;
  const hasRequired = nameRequired || questions.some((q) => q.required);

  function clearError(id: string) {
    if (errors[id])
      setErrors((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
  }

  function update(id: string, next: FieldValue) {
    setFields((f) => ({ ...f, [id]: next }));
    clearError(id);
  }

  function focusFirstError(errs: Record<string, AnswerError>) {
    const firstId = errs[NAME_FIELD] ? NAME_FIELD : questions.find((q) => errs[q.id])?.id;
    if (!firstId) return;
    const el = document.getElementById(firstId === NAME_FIELD ? "respondent-name-block" : `q-${firstId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLElement>("input, textarea, button, [role=radio], [role=checkbox], [role=combobox]")?.focus({
      preventScroll: true,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (preview || !onSubmit || submitting) return;
    setFormError(null);

    const raw = Object.fromEntries(questions.map((q) => [q.id, toAnswer(q, fields[q.id])]));
    const result = validateAnswers(questions, raw);
    const allErrors: Record<string, AnswerError> = { ...result.errors };
    if (nameRequired && name.trim() === "") allErrors[NAME_FIELD] = "required";
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      setFormError(t("fixErrors"));
      focusFirstError(allErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await onSubmit({ answers: result.clean, name: showName ? name.trim() || null : null, website });
      if (!res.ok) {
        if (res.errors) {
          setErrors(res.errors);
          focusFirstError(res.errors);
        }
        setFormError(res.message ?? t("fixErrors"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mx-auto w-full max-w-[720px]"
      style={{ "--form-accent": form.themeColor, "--line-accent": form.themeColor } as React.CSSProperties}
    >
      <FormSheet
        form={form}
        headerExtra={
          hasRequired ? (
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="text-destructive">*</span> {t("requiredNote")}
            </p>
          ) : null
        }
      >
        <ol className="divide-y border-t">
          {showName && (
            <QuestionBlock id="respondent-name-block" number={0} error={Boolean(errors[NAME_FIELD])}>
              <label htmlFor="respondent-name" className="flex items-center gap-1.5 text-base font-semibold">
                <UserRound className="size-4 text-muted-foreground" aria-hidden />
                {t("nameLabel")}
                {nameRequired ? (
                  <span className="text-destructive" aria-label={t("required")}>
                    *
                  </span>
                ) : (
                  <span className="text-sm font-normal text-muted-foreground">({t("nameHint")})</span>
                )}
              </label>
              <div className="mt-4">
                <LineInput
                  id="respondent-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearError(NAME_FIELD);
                  }}
                  maxLength={ANSWER_LIMITS.name}
                  autoComplete="name"
                  placeholder={t("yourAnswer")}
                  disabled={preview}
                  required={nameRequired}
                  aria-invalid={errors[NAME_FIELD] ? true : undefined}
                  aria-describedby={errors[NAME_FIELD] ? "respondent-name-error" : undefined}
                  wrapperClassName="max-w-md"
                />
              </div>
              {errors[NAME_FIELD] && <FieldError id="respondent-name-error" message={t(`errors.${errors[NAME_FIELD]}`)} />}
            </QuestionBlock>
          )}

          {questions.map((q, i) => (
            <QuestionField
              key={q.id}
              question={q}
              number={i + 1}
              field={fields[q.id] ?? {}}
              error={errors[q.id]}
              onChange={(next) => update(q.id, next)}
              disabled={submitting}
            />
          ))}
        </ol>

        {/* Honeypot: invisible to people, tempting to bots. Must stay empty. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
          </label>
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t px-5 py-6 sm:px-8">
          <Button
            type="submit"
            size="lg"
            disabled={preview || submitting}
            className="min-w-36 gap-2 bg-[var(--form-accent)] text-base hover:bg-[var(--form-accent)]/90"
          >
            {submitting && <Loader2 className="animate-spin" aria-hidden />}
            {submitting ? t("submitting") : t("submit")}
            {!submitting && <ArrowRight aria-hidden />}
          </Button>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </footer>
      </FormSheet>

      <p className="px-2 pt-4 pb-8 text-xs text-muted-foreground">{t("privacy", { org: brand.orgName })}</p>
    </form>
  );
}
