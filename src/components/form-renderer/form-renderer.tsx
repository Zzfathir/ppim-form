"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ANSWER_LIMITS, validateAnswers, type AnswerError, type AnswerValue } from "@/lib/forms/answers";
import { cn } from "@/lib/utils";
import { QuestionField } from "./question-field";
import type { FieldValue, RenderForm, RenderQuestion } from "./types";

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
 * The respondent view of a form (Google Forms layout). Used for the builder
 * preview (submit disabled) and the public /f/{slug} page.
 */
export function FormRenderer({
  form,
  questions,
  preview = false,
  onSubmit,
  header,
}: {
  form: RenderForm;
  questions: RenderQuestion[];
  preview?: boolean;
  onSubmit?: (payload: SubmitPayload) => Promise<SubmitResult>;
  header?: React.ReactNode;
}) {
  const t = useTranslations("respond");
  const [fields, setFields] = useState<Record<string, FieldValue>>({});
  const [errors, setErrors] = useState<Record<string, AnswerError>>({});
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const hasRequired = questions.some((q) => q.required);
  const showName = form.collectName && !form.requiresLogin;

  function update(id: string, next: FieldValue) {
    setFields((f) => ({ ...f, [id]: next }));
    if (errors[id])
      setErrors((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
  }

  function focusFirstError(errs: Record<string, AnswerError>) {
    const first = questions.find((q) => errs[q.id]);
    if (!first) return;
    const el = document.getElementById(`q-${first.id}`);
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
    if (!result.ok) {
      setErrors(result.errors);
      setFormError(t("fixErrors"));
      focusFirstError(result.errors);
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
      className="mx-auto w-full max-w-[720px] space-y-3"
      style={{ "--form-accent": form.themeColor } as React.CSSProperties}
    >
      {header}
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="h-2.5" style={{ backgroundColor: "var(--form-accent)" }} aria-hidden />
        <div className="p-5 sm:p-6">
          {form.departmentName && (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: form.departmentColor ?? "var(--form-accent)" }}
                aria-hidden
              />
              {t("badge", { department: form.departmentName, org: brand.orgName })}
            </p>
          )}
          <h1 className="text-2xl leading-tight font-bold break-words sm:text-3xl">{form.title}</h1>
          {form.description && (
            <p className="mt-3 text-sm whitespace-pre-wrap text-foreground/80">{form.description}</p>
          )}
          {hasRequired && (
            <p className="mt-4 border-t pt-3 text-sm text-destructive">* {t("requiredNote")}</p>
          )}
        </div>
      </div>

      {showName && (
        <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
          <label htmlFor="respondent-name" className="text-base font-medium">
            {t("nameLabel")} <span className="text-sm font-normal text-muted-foreground">({t("nameHint")})</span>
          </label>
          <Input
            id="respondent-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={ANSWER_LIMITS.name}
            autoComplete="name"
            placeholder={t("yourAnswer")}
            disabled={preview}
            className="mt-4 max-w-md rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:border-b-2 focus-visible:border-[var(--form-accent)] focus-visible:ring-0"
          />
        </div>
      )}

      {questions.map((q) => (
        <QuestionField
          key={q.id}
          question={q}
          field={fields[q.id] ?? {}}
          error={errors[q.id]}
          onChange={(next) => update(q.id, next)}
          disabled={submitting}
        />
      ))}

      {/* Honeypot: invisible to people, tempting to bots. Must stay empty. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
        </label>
      </div>

      {formError && (
        <p role="alert" className="px-1 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <Button
          type="submit"
          size="lg"
          disabled={preview || submitting}
          className={cn("min-w-28", !preview && "bg-[var(--form-accent)] hover:bg-[var(--form-accent)]/90")}
        >
          {submitting && <Loader2 className="animate-spin" aria-hidden />}
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </div>

      <p className="px-1 pt-4 pb-8 text-xs text-muted-foreground">{t("privacy", { org: brand.orgName })}</p>
    </form>
  );
}
