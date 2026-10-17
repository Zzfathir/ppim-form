"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SettingRow } from "@/components/builder/settings-panel";
import { setRequireApproval } from "@/app/(app)/admin/actions";

export function SettingsForm({ requireApproval }: { requireApproval: boolean }) {
  const t = useTranslations("admin.settings");
  const te = useTranslations("admin.errors");
  const [value, setValue] = useState(requireApproval);
  const [busy, startTransition] = useTransition();

  return (
    <section className="rounded-xl border bg-card px-5 shadow-xs sm:px-6">
      <SettingRow
        id="require-approval"
        label={t("requireApproval")}
        hint={t("requireApprovalHint")}
        checked={value}
        disabled={busy}
        onChange={(next) =>
          startTransition(async () => {
            const res = await setRequireApproval(next);
            if (res.ok) {
              setValue(next);
              toast.success(t("saved"));
            } else toast.error(te(res.error));
          })
        }
      />
    </section>
  );
}
