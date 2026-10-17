"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS, type DraftForm } from "@/lib/forms/schema";

/** Settings tab (PRD B6). Accepting responses lives in the header toggle. */
export function SettingsPanel({
  form,
  onChange,
  readOnly,
  acceptingToggle,
}: {
  form: DraftForm;
  onChange: (patch: Partial<DraftForm>) => void;
  readOnly: boolean;
  acceptingToggle: React.ReactNode;
}) {
  const t = useTranslations("builder");

  return (
    <div className="space-y-4">
      {acceptingToggle}

      <section className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <h2 className="text-lg font-semibold">{t("settingsResponses")}</h2>
        <div className="mt-4 divide-y">
          <SettingRow
            id="requires_login"
            label={t("requireLogin")}
            hint={t("requireLoginHint")}
            checked={form.requires_login}
            disabled={readOnly}
            onChange={(v) => onChange({ requires_login: v })}
          />
          {form.requires_login ? (
            <SettingRow
              id="limit_one_response"
              label={t("limitOne")}
              hint={t("limitOneHint")}
              checked={form.limit_one_response}
              disabled={readOnly}
              onChange={(v) => onChange({ limit_one_response: v })}
              nested
            />
          ) : (
            <>
              <SettingRow
                id="collect_name"
                label={t("collectName")}
                hint={t("collectNameHint")}
                checked={form.collect_name}
                disabled={readOnly}
                onChange={(v) => onChange({ collect_name: v, ...(v ? {} : { name_required: false }) })}
              />
              {form.collect_name && (
                <SettingRow
                  id="name_required"
                  label={t("nameRequired")}
                  hint={t("nameRequiredHint")}
                  checked={form.name_required}
                  disabled={readOnly}
                  onChange={(v) => onChange({ name_required: v })}
                  nested
                />
              )}
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <h2 className="text-lg font-semibold">{t("settingsPresentation")}</h2>
        <div className="mt-4 space-y-2">
          <Label htmlFor="confirmation_message">{t("confirmation")}</Label>
          <Textarea
            id="confirmation_message"
            value={form.confirmation_message ?? ""}
            onChange={(e) => onChange({ confirmation_message: e.target.value || null })}
            placeholder={t("confirmationPlaceholder")}
            maxLength={LIMITS.confirmation}
            disabled={readOnly}
            aria-describedby="confirmation_message-hint"
            className="field-sizing-content min-h-16"
          />
          <p id="confirmation_message-hint" className="text-xs text-muted-foreground">
            {t("confirmationHint")}
          </p>
        </div>
      </section>
    </div>
  );
}

export function SettingRow({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
  nested,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  nested?: boolean;
}) {
  return (
    <div className={nested ? "flex items-start justify-between gap-4 py-3 pl-6" : "flex items-start justify-between gap-4 py-3"}>
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint && (
          <p id={`${id}-hint`} className="mt-0.5 text-sm text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
    </div>
  );
}
