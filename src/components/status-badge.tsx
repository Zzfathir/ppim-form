"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { FormStatus } from "@/lib/forms/queries";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: FormStatus }) {
  const t = useTranslations("status");
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 gap-1 px-1.5 text-[11px] font-medium",
        status === "open" && "border-success/30 bg-success-soft text-success",
        status === "draft" && "text-muted-foreground",
        status === "closed" && "bg-muted text-foreground",
        status === "archived" && "bg-muted text-muted-foreground",
      )}
    >
      {status === "open" && <span className="size-1.5 rounded-full bg-success" aria-hidden />}
      {t(status)}
    </Badge>
  );
}
