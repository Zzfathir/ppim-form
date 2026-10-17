import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { PublicShell } from "@/components/public-form/public-shell";

export default async function FormNotFound() {
  const t = await getTranslations("publicForm");
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center rounded-2xl border bg-card px-5 py-12 text-center shadow-sm">
        <SearchX className="size-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-xl font-bold">{t("notFoundTitle")}</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("notFoundBody")}</p>
      </div>
    </PublicShell>
  );
}
