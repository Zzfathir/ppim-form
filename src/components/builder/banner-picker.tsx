"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  BANNER_BUCKET,
  BANNER_MAX_UPLOAD_BYTES,
  BANNER_MAX_WIDTH,
  BANNER_STYLES,
  bannerUrl,
  type BannerStyle,
} from "@/lib/forms/banner";
import { cn } from "@/lib/utils";
import { FormSheet } from "@/components/form-renderer/form-sheet";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const RAW_LIMIT = 20 * 1024 * 1024; // before resizing

/** Resize to at most BANNER_MAX_WIDTH wide and re-encode (WebP, JPEG fallback) to keep banners light on mobile data. */
async function prepareImage(file: File): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, BANNER_MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("encode_failed");
  return { blob: jpeg, ext: "jpg" };
}

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
    if (!ACCEPT.includes(file.type)) return void toast.error(t("wrongType"));
    if (file.size > RAW_LIMIT) return void toast.error(t("tooLarge"));
    setUploading(true);
    try {
      const { blob, ext } = await prepareImage(file);
      if (blob.size > BANNER_MAX_UPLOAD_BYTES) return void toast.error(t("tooLarge"));
      const objectPath = `${formId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await createClient()
        .storage.from(BANNER_BUCKET)
        .upload(objectPath, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
      if (error) throw error;
      onChange({ banner_path: objectPath });
    } catch {
      toast.error(t("uploadFailed"));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT.join(",")}
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
