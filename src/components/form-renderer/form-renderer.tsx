"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Loader2, UserRound } from "lucide-react";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { LineInput } from "@/components/ui/line-field";
import { ANSWER_LIMITS, validateAnswers, type AnswerError, type AnswerValue } from "@/lib/forms/answers";
import { isAnswerable } from "@/lib/questions";
import { FormSheet } from "./form-sheet";
import { FieldError, ImageItem, QuestionBlock, QuestionField } from "./question-field";
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
 * The respondent view: a single sheet of questions. Used for the
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
  const formRef = useRef<HTMLFormElement>(null);

  // Pages start at each section; questions before the first section form page 1.
  const pages = useMemo(() => {
    const out: { section: RenderQuestion | null; items: RenderQuestion[] }[] = [];
    let current: { section: RenderQuestion | null; items: RenderQuestion[] } = { section: null, items: [] };
    for (const q of questions) {
      if (q.type === "section") {
        if (current.section || current.items.length > 0) out.push(current);
        current = { section: q, items: [] };
      } else current.items.push(q);
    }
    out.push(current);
    return out;
  }, [questions]);
  const answerable = useMemo(() => questions.filter(isAnswerable), [questions]);
  const [page, setPage] = useState(0);
  const isLast = page >= pages.length - 1;
  const current = pages[Math.min(page, pages.length - 1)];

  function pageOfError(errs: Record<string, AnswerError>): number {
    if (errs[NAME_FIELD]) return 0;
    const i = pages.findIndex((pg) => pg.items.some((q) => errs[q.id]));
    return i === -1 ? page : i;
  }

  function goTo(target: number) {
    setPage(target);
    setFormError(null);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  /** Validate only this page before moving on; the server re-checks everything on submit. */
  function next() {
    if (!preview) {
      const raw = Object.fromEntries(current.items.map((q) => [q.id, toAnswer(q, fields[q.id])]));
      const errs: Record<string, AnswerError> = { ...validateAnswers(current.items, raw).errors };
      if (page === 0 && nameRequired && name.trim() === "") errs[NAME_FIELD] = "required";
      if (Object.keys(errs).length > 0) {
        setErrors((e) => ({ ...e, ...errs }));
        setFormError(t("fixErrors"));
        focusFirstError(errs);
        return;
      }
    }
    goTo(page + 1);
  }

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
    const firstId = errs[NAME_FIELD] ? NAME_FIELD : answerable.find((q) => errs[q.id])?.id;
    if (!firstId) return;
    // The question may be on another page: let it render first, then focus.
    requestAnimationFrame(() => {
      const el = document.getElementById(firstId === NAME_FIELD ? "respondent-name-block" : `q-${firstId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input, textarea, button, [role=radio], [role=checkbox], [role=combobox]")?.focus({
        preventScroll: true,
      });
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
      setPage(pageOfError(allErrors));
      focusFirstError(allErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await onSubmit({ answers: result.clean, name: showName ? name.trim() || null : null, website });
      if (!res.ok) {
        if (res.errors) {
          setErrors(res.errors);
          setPage(pageOfError(res.errors));
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
      ref={formRef}
      onSubmit={(e) => {
        if (!isLast) {
          // Enter inside a field on an earlier page moves to the next page instead of submitting.
          e.preventDefault();
          next();
          return;
        }
        void handleSubmit(e);
      }}
      noValidate
      className="mx-auto w-full max-w-[720px] scroll-mt-4"
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
        {current.section && (
          <div className="border-t border-l-4 border-l-[var(--form-accent,var(--brand-accent))] bg-muted/40 px-5 py-5 sm:px-8">
            {current.section.title && <h2 className="text-lg font-bold">{current.section.title}</h2>}
            {current.section.description && (
              <p className="mt-1 text-sm whitespace-pre-wrap text-foreground/80">{current.section.description}</p>
            )}
          </div>
        )}
        <ul className="divide-y border-t">
          {showName && page === 0 && (
            <QuestionBlock id="respondent-name-block" error={Boolean(errors[NAME_FIELD])}>
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

          {current.items.map((q) =>
            q.type === "image" ? (
              <ImageItem key={q.id} question={q} />
            ) : (
              <QuestionField
                key={q.id}
                question={q}
                field={fields[q.id] ?? {}}
                error={errors[q.id]}
                onChange={(next) => update(q.id, next)}
                disabled={submitting}
              />
            ),
          )}
        </ul>

        {/* Honeypot: invisible to people, tempting to bots. Must stay empty. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
          </label>
        </div>

        <footer className="space-y-4 border-t px-5 py-6 sm:px-8">
          {pages.length > 1 && (
            <div className="flex items-center gap-3">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={pages.length}
                aria-valuenow={page + 1}
                aria-label={t("pageOf", { current: page + 1, total: pages.length })}
              >
                <div
                  className="h-full rounded-full bg-[var(--form-accent,var(--brand-accent))] transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${((page + 1) / pages.length) * 100}%` }}
                />
              </div>
              <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                {t("pageOf", { current: page + 1, total: pages.length })}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {page > 0 && (
              <Button type="button" variant="outline" size="lg" className="gap-2 text-base" onClick={() => goTo(page - 1)} disabled={submitting}>
                <ArrowLeft aria-hidden />
                {t("back")}
              </Button>
            )}
            {/* Distinct keys: React must replace Next with a new Submit element, not turn the clicked
                Next button into a submit button mid-click (which would submit the form). */}
            {isLast ? (
              <Button
                key="submit"
                type="submit"
                size="lg"
                disabled={preview || submitting}
                className="min-w-36 gap-2 bg-[var(--form-accent)] text-base hover:bg-[var(--form-accent)]/90"
              >
                {submitting && <Loader2 className="animate-spin" aria-hidden />}
                {submitting ? t("submitting") : t("submit")}
                {!submitting && <ArrowRight aria-hidden />}
              </Button>
            ) : (
              <Button key="next" type="button" size="lg" onClick={next} className="min-w-36 gap-2 bg-[var(--form-accent)] text-base hover:bg-[var(--form-accent)]/90">
                {t("next")}
                <ArrowRight aria-hidden />
              </Button>
            )}
          </div>
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
