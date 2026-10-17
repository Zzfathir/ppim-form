import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, Lock } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRespondent } from "@/lib/public-form/request";
import { loadPublicForm } from "@/lib/public-form/service";
import { sharePath } from "@/lib/forms/share";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { PublicShell, StateCard } from "@/components/public-form/public-shell";
import { PublicFormClient } from "./public-form-client";

// Forms are private to whoever has the link: keep them out of search engines.
export async function generateMetadata({ params }: PageProps<"/f/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const form = await loadPublicForm(createAdminClient(), slug, null);
  return {
    title: form.state === "not_found" ? undefined : form.title,
    robots: { index: false, follow: false },
  };
}

export default async function PublicFormPage({ params }: PageProps<"/f/[slug]">) {
  const { slug } = await params;
  const user = await getRespondent();
  const form = await loadPublicForm(createAdminClient(), slug, user);
  if (form.state === "not_found") notFound();

  const t = await getTranslations("publicForm");
  const returnTo = sharePath(slug);

  if (form.state === "closed") {
    return (
      <PublicShell>
        <StateCard title={form.title} department={form.department}>
          <p className="flex items-center gap-2 font-medium">
            <Lock className="size-4 text-muted-foreground" aria-hidden />
            {t("closedBody")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("closedHint")}</p>
        </StateCard>
      </PublicShell>
    );
  }

  if (form.state === "needs_login") {
    return (
      <PublicShell>
        <StateCard title={form.title} department={form.department}>
          {form.description && <p className="mb-4 text-sm whitespace-pre-wrap text-foreground/80">{form.description}</p>}
          <div className="rounded-lg border bg-muted/40 p-4">
            <h2 className="font-semibold">{t("needsLoginTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("needsLoginBody")}</p>
            <GoogleSignInButton returnTo={returnTo} className="mt-4 w-full sm:w-auto" />
          </div>
        </StateCard>
      </PublicShell>
    );
  }

  if (form.state === "already") {
    return (
      <PublicShell>
        <StateCard title={form.title} department={form.department}>
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-5 text-success" aria-hidden />
            {t("alreadyTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("alreadyBody")}</p>
          {user?.email && <AccountLine email={user.email} returnTo={returnTo} label={t("signedInAs", { email: user.email })} switchLabel={t("switchAccount")} />}
        </StateCard>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <PublicFormClient
        slug={slug}
        form={{
          title: form.title,
          description: form.description,
          departmentName: form.department?.name ?? null,
          departmentColor: form.department?.color ?? null,
          themeColor: "var(--brand-accent)",
          collectName: form.collectName,
          requiresLogin: form.requiresLogin,
        }}
        questions={form.questions ?? []}
        accountLine={
          form.requiresLogin && user?.email ? (
            <AccountLine
              email={user.email}
              returnTo={returnTo}
              label={t("signedInAs", { email: user.email })}
              switchLabel={t("switchAccount")}
              note={t("recorded")}
            />
          ) : null
        }
      />
    </PublicShell>
  );
}

function AccountLine({
  returnTo,
  label,
  switchLabel,
  note,
}: {
  email: string;
  returnTo: string;
  label: string;
  switchLabel: string;
  note?: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-sm">
      <span className="font-medium">{label}</span>
      <form action="/auth/signout" method="post">
        <input type="hidden" name="returnTo" value={returnTo} />
        <button type="submit" className="font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          {switchLabel}
        </button>
      </form>
      {note && <p className="basis-full text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
