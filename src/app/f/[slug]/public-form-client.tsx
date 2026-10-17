"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { FormRenderer, type SubmitPayload, type SubmitResult } from "@/components/form-renderer/form-renderer";
import { FormSheet } from "@/components/form-renderer/form-sheet";
import type { RenderForm, RenderQuestion } from "@/components/form-renderer/types";

type Done = { kind: "thanks"; message: string | null } | { kind: "already" } | { kind: "closed" };

export function PublicFormClient({
  slug,
  form,
  questions,
  accountLine,
  allowAnother,
}: {
  slug: string;
  form: RenderForm;
  questions: RenderQuestion[];
  accountLine: React.ReactNode;
  allowAnother: boolean;
}) {
  const t = useTranslations("publicForm");
  const [done, setDone] = useState<Done | null>(null);
  // Bumped by "Submit another response" so the form starts empty again.
  const [attempt, setAttempt] = useState(0);

  async function submit(payload: SubmitPayload): Promise<SubmitResult> {
    let res: Response;
    try {
      res = await fetch(`/api/public/forms/${encodeURIComponent(slug)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      return { ok: false, message: t("errors.network") };
    }
    const body = await res.json().catch(() => null);

    if (res.ok && body?.ok) {
      setDone({ kind: "thanks", message: body.message ?? null });
      window.scrollTo({ top: 0 });
      return { ok: true };
    }
    switch (body?.error) {
      case "invalid_answers":
        return { ok: false, errors: body.errors };
      case "already":
        setDone({ kind: "already" });
        return { ok: true };
      case "closed":
        setDone({ kind: "closed" });
        return { ok: true };
      case "rate_limited":
      case "needs_login":
        return { ok: false, message: t(`errors.${body.error}`) };
      default:
        return { ok: false, message: t("errors.generic") };
    }
  }

  if (done) {
    return (
      <div role="status">
        <FormSheet form={form} showDescription={false}>
          <div className="border-t px-5 py-6 sm:px-8">
            {done.kind === "thanks" && (
              <>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
                  {t("thankYouTitle")}
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-wrap text-foreground/85">{done.message || t("thankYouDefault")}</p>
                {allowAnother && (
                  <button
                    type="button"
                    onClick={() => {
                      setDone(null);
                      setAttempt((n) => n + 1);
                    }}
                    className="mt-5 text-sm font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {t("submitAnother")}
                  </button>
                )}
              </>
            )}
            {done.kind === "already" && (
              <>
                <p className="font-medium">{t("alreadyTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("alreadyBody")}</p>
              </>
            )}
            {done.kind === "closed" && <p className="text-sm">{t("errors.closed")}</p>}
          </div>
        </FormSheet>
      </div>
    );
  }

  return (
    <>
      {/* Outside the response <form>: the account line contains its own sign-out form. */}
      {accountLine && <div className="mx-auto mb-3 w-full max-w-[720px] rounded-xl border bg-card px-5 pb-4 shadow-sm sm:px-8 [&>div]:mt-4">{accountLine}</div>}
      <FormRenderer key={attempt} form={form} questions={questions} onSubmit={submit} />
    </>
  );
}
