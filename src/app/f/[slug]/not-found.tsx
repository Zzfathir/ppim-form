import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { PublicShell, StateCard } from "@/components/public-form/public-shell";

export default async function FormNotFound() {
  const t = await getTranslations("publicForm");
  return (
    <PublicShell>
      <StateCard>
        <div className="flex flex-col items-center py-6 text-center">
          <SearchX className="size-10 text-muted-foreground" aria-hidden />
          <h1 className="mt-4 text-xl font-bold">{t("notFoundTitle")}</h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("notFoundBody")}</p>
        </div>
      </StateCard>
    </PublicShell>
  );
}
