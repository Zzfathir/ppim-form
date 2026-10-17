import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { getCurrentProfile, needsOnboarding } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?returnTo=%2Fonboarding");
  if (!needsOnboarding(profile)) redirect("/dashboard");

  const supabase = await createClient();
  const [departments, chapters, approval] = await Promise.all([
    supabase.from("departments").select("id, name").eq("is_archived", false).order("name"),
    supabase.from("chapters").select("id, name").eq("is_archived", false).order("name"),
    supabase.rpc("admin_approval_required"),
  ]);
  if (departments.error || chapters.error) throw new Error("Failed to load departments");

  const t = await getTranslations("onboarding");
  const showApprovalNote = profile.role === "respondent" && (approval.data ?? true);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <Image src={brand.logo} alt={brand.orgName} width={56} height={56} priority />
        <h1 className="mt-5 text-2xl font-bold tracking-tight">{t("title", { app: brand.name })}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        <OnboardingForm
          defaultName={profile.full_name ?? ""}
          departments={departments.data}
          chapters={chapters.data}
          showApprovalNote={showApprovalNote}
        />
      </div>
      <LanguageSwitcher className="mt-6" />
    </main>
  );
}
