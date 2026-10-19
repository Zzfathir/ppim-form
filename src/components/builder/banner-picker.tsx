"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BANNER_STYLES, bannerUrl, type BannerStyle } from "@/lib/forms/banner";
import { cn } from "@/lib/utils";
import { FormSheet } from "@/components/form-renderer/form-sheet";
import { IMAGE_ACCEPT, uploadImage } from "./image-upload";

export function BannerPicker({
  formId,
  path,
  style,
  onChange,
  title,
  department,
}: {
  formId: string;
  path: string | null;
  style: BannerStyle;
  onChange: (patch: { banner_path?: string | null; banner_style?: BannerStyle }) => void;
  /** Used for the live preview, which renders exactly what respondents see. */
  title: string;
  department: { name: string; color: string | null } | null;
}) {
  const t = useTranslations("builder.banner");
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const url = bannerUrl(path);

  async function upload(file: File) {
    setUploading(true);
    const res = await uploadImage(formId, file);
    setUploading(false);
    if (input.current) input.current.value = "";
    if ("error" in res) toast.error(t(res.error));
    else onChange({ banner_path: res.path });
  }

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept={IMAGE_ACCEPT.join(",")}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void upload(file);
      }}
    />
  );

  if (!url) {
    return (
      <div>
        {fileInput}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
          <span>
            <span className="font-medium">{uploading ? t("uploading") : t("add")}</span>
            {!uploading && <span className="hidden sm:inline"> · {t("hint")}</span>}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fileInput}
      <div className="relative rounded-lg border bg-background p-2">
        <p className="mb-1.5 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("previewLabel")}</p>
        {/* Live preview: the same sheet header respondents get, in the chosen style. */}
        <div role="img" aria-label={t("previewAlt")} className="pointer-events-none select-none">
          <div aria-hidden>
            <FormSheet
              form={{
                title: title || "—",
                description: null,
                departmentName: department?.name ?? null,
                departmentColor: department?.color ?? null,
                bannerUrl: url,
                bannerStyle: style,
              }}
              showDescription={false}
              className="max-w-none shadow-none"
            />
          </div>
        </div>
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-5 animate-spin" aria-label={t("uploading")} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label={t("style")} className="inline-flex flex-wrap rounded-lg border p-0.5 text-xs">
          {BANNER_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={style === s}
              onClick={() => onChange({ banner_style: s })}
              className={cn(
                "rounded-md px-2.5 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-ring",
                style === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`styles.${s}`)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => input.current?.click()}>
            <RefreshCw aria-hidden />
            {t("change")}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => onChange({ banner_path: null })}>
            <Trash2 aria-hidden />
            {t("remove")}
          </Button>
        </div>
      </div>
    </div>
  );
}
