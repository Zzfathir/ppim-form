"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setTemplatePublished } from "@/app/(app)/admin/actions";

export function TemplatePublishToggle({ id, published }: { id: string; published: boolean }) {
  const t = useTranslations("admin.templates");
  const te = useTranslations("admin.errors");
  const [value, setValue] = useState(published);
  const [busy, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={`publish-${id}`} className="text-sm font-normal text-muted-foreground">
        {t("published")}
      </Label>
      <Switch
        id={`publish-${id}`}
        checked={value}
        disabled={busy}
        onCheckedChange={(next) =>
          startTransition(async () => {
            const res = await setTemplatePublished(id, next);
            if (res.ok) setValue(next);
            else toast.error(te(res.error));
          })
        }
      />
    </div>
  );
}
