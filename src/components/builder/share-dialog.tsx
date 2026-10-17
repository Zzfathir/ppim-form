"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ShareDialog({
  open,
  onOpenChange,
  url,
  justPublished,
  closed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  justPublished: boolean;
  closed: boolean;
}) {
  const t = useTranslations("builder");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the link stays selectable in the input.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{justPublished ? t("shareTitle") : t("shareTitleExisting")}</DialogTitle>
          <DialogDescription>{closed ? t("shareBodyClosed") : t("shareBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="share-link">{t("linkLabel")}</Label>
          <div className="flex gap-2">
            <Input id="share-link" value={url} readOnly onFocus={(e) => e.currentTarget.select()} className="font-mono text-sm" />
            <Button type="button" onClick={copy} className="shrink-0">
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
          <span role="status" className="sr-only">
            {copied ? t("copied") : ""}
          </span>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden />
              {t("openForm")}
            </a>
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
