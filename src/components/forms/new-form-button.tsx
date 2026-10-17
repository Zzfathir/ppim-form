"use client";

import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createForm } from "@/app/(app)/forms/actions";

function SubmitButton({ label, variant }: { label: string; variant?: "default" | "outline" }) {
  const t = useTranslations("dashboard");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
      {pending ? t("creating") : label}
    </Button>
  );
}

/** One click → a new draft opens in the builder (PRD B1). */
export function NewFormButton({ templateId, label, variant }: { templateId?: string; label?: string; variant?: "default" | "outline" }) {
  const t = useTranslations("dashboard");
  return (
    <form action={createForm}>
      {templateId && <input type="hidden" name="templateId" value={templateId} />}
      <SubmitButton label={label ?? t("newForm")} variant={variant} />
    </form>
  );
}
