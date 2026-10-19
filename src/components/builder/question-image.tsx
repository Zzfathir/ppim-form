"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { imageUrl } from "@/lib/forms/banner";
import { LIMITS } from "@/lib/forms/schema";
import type { QuestionSettings } from "@/lib/questions";
import { IMAGE_ACCEPT, uploadImage } from "./image-upload";

/** A hidden file input plus an `open()` to trigger it from any button. Uploads into `folder`. */
export function useImagePicker(folder: string, onPicked: (path: string) => void) {
  const t = useTranslations("builder.banner");
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const res = await uploadImage(folder, file);
    setUploading(false);
    if (ref.current) ref.current.value = "";
    if ("error" in res) toast.error(t(res.error));
    else onPicked(res.path);
  }

  const input = (
    <input
      ref={ref}
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
  return { input, open: () => ref.current?.click(), uploading };
}

/** Dashed "Add image" button, for an image block that has no picture yet. */
export function AddImageButton({ onClick, uploading }: { onClick: () => void; uploading: boolean }) {
  const t = useTranslations("builder.image");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={uploading}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
    >
      {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
      <span>
        <span className="font-medium">{uploading ? t("uploading") : t("add")}</span>
        {!uploading && <span className="hidden sm:inline"> · {t("hint")}</span>}
      </span>
    </button>
  );
}

/** The chosen picture with its screen-reader description, and Change / Remove. */
export function ImageEditor({
  settings,
  uploading,
  onReplace,
  onChange,
}: {
  settings: QuestionSettings;
  uploading: boolean;
  onReplace: () => void;
  onChange: (patch: Pick<QuestionSettings, "image_path" | "image_alt">) => void;
}) {
  const t = useTranslations("builder.image");
  const url = imageUrl(settings.image_path);
  if (!url) return null;

  return (
    <div className="space-y-2">
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote Storage image, sized by CSS */}
        <img src={url} alt={settings.image_alt ?? ""} className="max-h-72 max-w-full rounded-lg border object-contain" />
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70">
            <Loader2 className="size-5 animate-spin" aria-label={t("uploading")} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Input
          value={settings.image_alt ?? ""}
          onChange={(e) => onChange({ image_alt: e.target.value || undefined })}
          placeholder={t("altPlaceholder")}
          aria-label={t("alt")}
          title={t("altHint")}
          maxLength={LIMITS.imageAlt}
          className="h-9 min-w-48 flex-1 rounded-none border-0 border-b px-0 text-sm shadow-none focus-visible:border-b-2 focus-visible:border-brand focus-visible:ring-0"
        />
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={onReplace}>
            <RefreshCw aria-hidden />
            {t("change")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploading}
            onClick={() => onChange({ image_path: undefined, image_alt: undefined })}
          >
            <Trash2 aria-hidden />
            {t("remove")}
          </Button>
        </div>
      </div>
    </div>
  );
}
