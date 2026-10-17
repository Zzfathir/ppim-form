import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Clock, Ban } from "lucide-react";
import { brand } from "@/config/brand";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AccountMenu } from "@/components/app-shell/account-menu";
import { BottomNav, SidebarNav } from "@/components/app-shell/app-nav";
import { navFor } from "@/components/app-shell/nav-items";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireStaff();
  const t = await getTranslations();

  const supabase = await createClient();
  const { data: department } = await supabase
    .from("departments")
    .select("name")
    .eq("id", profile.department_id!)
    .maybeSingle();

  const sections = navFor(profile.role);
  const home = profile.role === "superadmin" ? "/admin" : "/dashboard";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b bg-card">
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <Link href={home} className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-ring">
            <Image src={brand.logo} alt="" width={32} height={32} priority />
            <span className="font-heading text-base font-bold tracking-tight">{brand.name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher />
            <AccountMenu
              name={profile.full_name ?? profile.email}
              email={profile.email}
              avatarUrl={profile.avatar_url}
              roleLabel={t(`roles.${profile.role}`)}
              departmentName={department?.name ?? null}
            />
          </div>
        </div>
        {profile.status === "pending" && (
          <div role="status" className="flex items-center gap-2 border-t bg-brand-soft px-4 py-2 text-sm md:px-6">
            <Clock className="size-4 shrink-0 text-brand" aria-hidden />
            {t("banner.pending")}
          </div>
        )}
        {profile.status === "suspended" && (
          <div role="alert" className="flex items-center gap-2 border-t bg-destructive/10 px-4 py-2 text-sm md:px-6">
            <Ban className="size-4 shrink-0 text-destructive" aria-hidden />
            {t("banner.suspended")}
          </div>
        )}
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r bg-card p-4 md:block">
          <SidebarNav sections={sections} />
        </aside>
        <main className="min-w-0 flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-10">{children}</main>
      </div>

      <BottomNav sections={sections} />
    </div>
  );
}
