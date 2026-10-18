import { getTranslations } from "next-intl/server";
import { requireSuperadmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LookupManager } from "@/components/admin/lookup-manager";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("categories");

export default async function CategoriesPage() {
  await requireSuperadmin();
  const supabase = await createClient();
  const [{ data, error }, { data: usage }] = await Promise.all([
    supabase.from("categories").select("id, name, sort, is_active").order("is_active", { ascending: false }).order("sort").order("name"),
    supabase.rpc("admin_usage"),
  ]);
  if (error) throw new Error("Failed to load categories");
  const counts = ((usage as Record<string, Record<string, Record<string, number>>> | null)?.categories ?? {}) as Record<string, Record<string, number>>;
  const t = await getTranslations("admin.lookups");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title.categories")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle.categories")}</p>
      </div>
      <LookupManager
        table="categories"
        rows={data.map((r) => ({ id: r.id, name: r.name, sort: r.sort, archived: !r.is_active, usage: counts[r.id] ?? {} }))}
      />
    </div>
  );
}
