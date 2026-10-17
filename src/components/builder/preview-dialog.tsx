"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Monitor, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormRenderer } from "@/components/form-renderer/form-renderer";
import type { RenderForm, RenderQuestion } from "@/components/form-renderer/types";
import { cn } from "@/lib/utils";

export function PreviewDialog({
  open,
  onOpenChange,
  form,
  questions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: RenderForm;
  questions: RenderQuestion[];
}) {
  const t = useTranslations("builder");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] max-w-[min(1000px,96vw)] flex-col gap-3 p-0 sm:max-w-[min(1000px,96vw)]">
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b px-5 py-3 text-left">
          <div>
            <DialogTitle>{t("previewTitle")}</DialogTitle>
            <DialogDescription className="text-xs">{t("previewNote")}</DialogDescription>
          </div>
          <div role="group" aria-label={t("previewTitle")} className="mr-8 inline-flex rounded-lg border p-0.5">
            {(["desktop", "mobile"] as const).map((d) => {
              const Icon = d === "desktop" ? Monitor : Smartphone;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={device === d}
                  onClick={() => setDevice(d)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring",
                    device === d ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {t(d)}
                </button>
              );
            })}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto bg-background px-3 pb-6">
          <div
            className={cn(
              "mx-auto transition-[max-width]",
              device === "mobile" ? "max-w-[360px] rounded-[1.5rem] border-8 border-foreground/80 bg-background px-2 pt-3" : "max-w-[760px] pt-3",
            )}
          >
            <FormRenderer form={form} questions={questions} preview />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
