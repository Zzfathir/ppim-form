import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { LanguageSwitcher } from "@/components/language-switcher";

/** Respondent pages: no app navigation, one centered column, light footer. */
export async function PublicShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("publicForm");
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="flex-1 px-3 pt-4 sm:px-4 sm:pt-8">{children}</main>
      <footer className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-3 px-4 pt-2 pb-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <Image src={brand.logo} alt="" width={20} height={20} />
          {t("poweredBy", { app: brand.name })}
        </span>
        <LanguageSwitcher />
      </footer>
    </div>
  );
}
