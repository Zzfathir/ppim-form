import { getTranslations } from "next-intl/server";
import { requireSuperadmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LookupManager } from "@/components/admin/lookup-manager";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("departments");

export default async function DepartmentsPage() {
  await requireSuperadmin();
  const supabase = await createClient();
  const [{ data, error }, { data: usage }] = await Promise.all([
    supabase.from("departments").select("id, name, description, color, is_archived").order("is_archived").order("name"),
    supabase.rpc("admin_usage"),
  ]);
  if (error) throw new Error("Failed to load departments");
  const counts = ((usage as Record<string, Record<string, Record<string, number>>> | null)?.departments ?? {}) as Record<string, Record<string, number>>;
  const t = await getTranslations("admin.lookups");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title.departments")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle.departments")}</p>
      </div>
      <LookupManager
        table="departments"
        rows={data.map((r) => ({ id: r.id, name: r.name, description: r.description, color: r.color, archived: r.is_archived, usage: counts[r.id] ?? {} }))}
      />
    </div>
  );
}
