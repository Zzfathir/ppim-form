import { useTranslations } from "next-intl";
import { brand } from "@/config/brand";
import type { BannerStyle } from "@/lib/forms/banner";
import { cn } from "@/lib/utils";

export type SheetForm = {
  title: string;
  description: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  bannerUrl: string | null;
  bannerStyle: BannerStyle;
};

/**
 * The respondent-facing "sheet": one white page with an optional banner
 * (edge-to-edge, inset, or title-on-banner), the form's identity, and a body.
 * Used by the fillable form and by every status screen (closed, sign-in,
 * already responded, thank you). Works in server and client components.
 */
export function FormSheet({
  form,
  showDescription = true,
  headerExtra,
  children,
  className,
}: {
  form: SheetForm;
  showDescription?: boolean;
  headerExtra?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const overlay = form.bannerUrl && form.bannerStyle === "overlay";

  return (
    <article className={cn("mx-auto w-full max-w-[720px] overflow-hidden rounded-2xl border bg-card shadow-sm", className)}>
      {form.bannerUrl && form.bannerStyle === "edge" && (
        // eslint-disable-next-line @next/next/no-img-element -- remote Storage image, sized by CSS
        <img src={form.bannerUrl} alt="" className="aspect-[4/1] w-full object-cover" />
      )}
      {form.bannerUrl && form.bannerStyle === "inset" && (
        <div className="px-5 pt-5 sm:px-8 sm:pt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.bannerUrl} alt="" className="aspect-[3/1] w-full rounded-xl object-cover" />
        </div>
      )}
      {overlay && (
        <div className="relative aspect-[16/9] w-full sm:aspect-[3/1]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.bannerUrl!} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 px-5 pb-5 sm:px-8 sm:pb-7">
            <Identity form={form} onImage />
          </div>
        </div>
      )}

      <header className={cn("px-5 sm:px-8", overlay ? "pt-5 pb-5 sm:pt-6" : "pt-6 pb-6 sm:pt-8")}>
        {!overlay && <Identity form={form} />}
        {showDescription && form.description && (
          <p className={cn("text-[15px] leading-relaxed whitespace-pre-wrap text-foreground/80", !overlay && "mt-3")}>{form.description}</p>
        )}
        {headerExtra}
      </header>

      {children}
    </article>
  );
}

function Identity({ form, onImage = false }: { form: SheetForm; onImage?: boolean }) {
  const t = useTranslations("respond");
  return (
    <>
      {form.departmentName && (
        <p
          className={cn(
            "mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase",
            onImage ? "text-white/90" : "text-muted-foreground",
          )}
        >
          <span
            className={cn("size-2 rounded-full", onImage && "ring-2 ring-white/60")}
            style={{ backgroundColor: form.departmentColor ?? "var(--brand-accent)" }}
            aria-hidden
          />
          {t("badge", { department: form.departmentName, org: brand.orgName })}
        </p>
      )}
      <h1 className={cn("text-[1.7rem] leading-tight font-bold break-words sm:text-[2rem]", onImage && "text-white drop-shadow-sm")}>
        {form.title}
      </h1>
    </>
  );
}
