import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Construction } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { requireSuperadmin } from "@/lib/auth";

const SECTIONS = ["forms", "people", "departments", "chapters", "categories", "templates", "settings"];

// Temporary placeholder for secretary pages that arrive in Phase 6.
// Specific routes (e.g. /admin/people/page.tsx) take precedence over this catch-all.
export default async function AdminSectionPlaceholder({ params }: PageProps<"/admin/[...section]">) {
  // Layouts are not re-run on client navigation, so every admin page checks too.
  await requireSuperadmin();
  const { section } = await params;
  if (!SECTIONS.includes(section[0])) notFound();
  const t = await getTranslations("common");
  return (
    <div className="mx-auto max-w-6xl">
      <EmptyState icon={Construction} title={t("comingSoon")} />
    </div>
  );
}
