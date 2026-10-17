import { getTranslations } from "next-intl/server";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { requireSuperadmin } from "@/lib/auth";

export const metadata = { title: "Overview" };

// Placeholder until Phase 6 (secretary overview).
export default async function AdminOverviewPage() {
  // Layouts are not re-run on client navigation, so every admin page checks too.
  await requireSuperadmin();
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight">{t("admin.overviewTitle")}</h1>
      <EmptyState icon={BarChart3} title={t("admin.overviewTitle")} body={t("common.comingSoon")} className="mt-6" />
    </div>
  );
}
