import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "My forms" };

export default async function DashboardPage() {
  const profile = await requireStaff();
  if (profile.role === "superadmin") redirect("/admin");

  const t = await getTranslations("dashboard");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      {/* The form list, "New form" and "From template" arrive in Phase 3 (builder). */}
      <EmptyState icon={FileText} title={t("emptyTitle")} body={t("emptyBody")} className="mt-6" />
    </div>
  );
}
