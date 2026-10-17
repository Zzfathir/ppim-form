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

/** A form-shaped card for the non-fillable states (closed, needs sign-in, already responded, thank you). */
export function StateCard({
  title,
  department,
  children,
}: {
  title?: string;
  department?: { name: string; color: string } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[720px] overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="h-2.5 bg-brand" aria-hidden />
      <div className="p-5 sm:p-6">
        {department && <DepartmentBadge department={department} />}
        {title && <h1 className="text-2xl leading-tight font-bold break-words sm:text-3xl">{title}</h1>}
        <div className={title ? "mt-4" : undefined}>{children}</div>
      </div>
    </div>
  );
}

export function DepartmentBadge({ department }: { department: { name: string; color: string } }) {
  return (
    <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <span className="size-2 rounded-full" style={{ backgroundColor: department.color }} aria-hidden />
      {department.name} · {brand.orgName}
    </p>
  );
}
