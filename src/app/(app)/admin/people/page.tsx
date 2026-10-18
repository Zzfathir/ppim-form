import { getTranslations } from "next-intl/server";
import { requireSuperadmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/forms/queries";
import { PeopleManager } from "@/components/admin/people-manager";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("people");

export default async function PeoplePage() {
  const me = await requireSuperadmin();
  const supabase = await createClient();
  const [{ data: people, error }, lookups] = await Promise.all([supabase.rpc("admin_people"), getLookups()]);
  if (error) throw new Error("Failed to load people");
  const t = await getTranslations("admin.people");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PeopleManager
        meId={me.id}
        people={people.map((p) => ({
          id: p.id,
          name: p.full_name ?? p.email,
          email: p.email,
          role: p.role,
          status: p.status,
          departmentId: p.department_id,
          formsCount: Number(p.forms_count),
          openCount: Number(p.open_forms_count),
        }))}
        departments={lookups.departments.map((d) => ({ id: d.id, name: d.name, color: d.color }))}
      />
    </div>
  );
}
