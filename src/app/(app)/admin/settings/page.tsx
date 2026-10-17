import { getTranslations } from "next-intl/server";
import { requireSuperadmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requireSuperadmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").select("require_admin_approval").maybeSingle();
  if (error) throw new Error("Failed to load settings");
  const t = await getTranslations("admin.settings");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      <SettingsForm requireApproval={data?.require_admin_approval ?? true} />
    </div>
  );
}
