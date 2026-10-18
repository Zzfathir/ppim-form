import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { getSessionUser } from "@/lib/auth";
import { isPublicFormPath, safeReturnTo } from "@/lib/safe-redirect";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LanguageSwitcher } from "@/components/language-switcher";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("signIn");

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const returnTo = safeReturnTo(typeof params.returnTo === "string" ? params.returnTo : null);
  const hasError = params.error !== undefined;

  if (await getSessionUser()) redirect(returnTo);

  const t = await getTranslations("login");
  const fromForm = isPublicFormPath(returnTo);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">
        <Image src={brand.logo} alt={brand.orgName} width={96} height={96} priority className="mx-auto" />
        <h1 className="mt-6 text-2xl font-bold tracking-tight">{t("title", { app: brand.name })}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {fromForm ? t("formNotice") : t("subtitle", { org: brand.orgName })}
        </p>

        {hasError && (
          <Alert variant="destructive" className="mt-6 text-left">
            <AlertDescription>{t("errorGeneric")}</AlertDescription>
          </Alert>
        )}

        <GoogleSignInButton returnTo={returnTo} className="mt-8 w-full" />
        <p className="mt-4 text-xs text-muted-foreground">{t("privacy")}</p>
      </div>
      <LanguageSwitcher className="mt-6" />
    </main>
  );
}
