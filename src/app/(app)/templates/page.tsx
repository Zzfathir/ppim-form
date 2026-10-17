import { getTranslations } from "next-intl/server";
import { LayoutTemplate } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Templates" };

// Placeholder until Phase 3 (templates gallery).
export default async function TemplatesPage() {
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight">{t("nav.templates")}</h1>
      <EmptyState icon={LayoutTemplate} title={t("nav.templates")} body={t("common.comingSoon")} className="mt-6" />
    </div>
  );
}
