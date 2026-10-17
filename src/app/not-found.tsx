import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-4 py-12">
      <EmptyState
        icon={SearchX}
        title={t("notFoundTitle")}
        body={t("notFoundBody")}
        action={
          <Button asChild variant="outline">
            <Link href="/">{t("backHome")}</Link>
          </Button>
        }
        className="w-full"
      />
    </main>
  );
}
