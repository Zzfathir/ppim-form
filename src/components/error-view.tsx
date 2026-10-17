"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export function ErrorView({ reset }: { reset?: () => void }) {
  const t = useTranslations();
  return (
    <EmptyState
      icon={AlertTriangle}
      title={t("errors.title")}
      body={t("errors.body")}
      action={reset && <Button onClick={reset}>{t("common.retry")}</Button>}
    />
  );
}
