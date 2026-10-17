"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { completeOnboarding, type OnboardingState } from "./actions";

type Option = { id: string; name: string };

const NO_CHAPTER = "none";

export function OnboardingForm({
  defaultName,
  departments,
  chapters,
  showApprovalNote,
}: {
  defaultName: string;
  departments: Option[];
  chapters: Option[];
  showApprovalNote: boolean;
}) {
  const t = useTranslations("onboarding");
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});
  const [departmentId, setDepartmentId] = useState("");
  const [chapterId, setChapterId] = useState(NO_CHAPTER);

  const nameError = state.error === "invalid_name";
  const departmentError = state.error === "invalid_department";

  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="fullName">{t("fullName")}</Label>
        <Input
          id="fullName"
          name="fullName"
          defaultValue={defaultName}
          autoComplete="name"
          maxLength={120}
          required
          aria-invalid={nameError || undefined}
          aria-describedby={nameError ? "fullName-error" : undefined}
        />
        {nameError && (
          <p id="fullName-error" className="text-sm text-destructive">
            {t("errors.invalid_name")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="departmentId">{t("department")}</Label>
        <input type="hidden" name="departmentId" value={departmentId} />
        <Select value={departmentId} onValueChange={setDepartmentId} required>
          <SelectTrigger
            id="departmentId"
            className="w-full"
            aria-invalid={departmentError || undefined}
            aria-describedby="departmentId-hint"
          >
            <SelectValue placeholder={t("departmentPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id="departmentId-hint" className={departmentError ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
          {departmentError ? t("errors.invalid_department") : t("departmentHint")}
        </p>
      </div>

      {chapters.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="chapterId">
            {t("chapter")} <span className="font-normal text-muted-foreground">({t("optional")})</span>
          </Label>
          <input type="hidden" name="chapterId" value={chapterId === NO_CHAPTER ? "" : chapterId} />
          <Select value={chapterId} onValueChange={setChapterId}>
            <SelectTrigger id="chapterId" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CHAPTER}>{t("chapterNone")}</SelectItem>
              {chapters.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.error === "invalid_chapter" && <p className="text-sm text-destructive">{t("errors.invalid_chapter")}</p>}
        </div>
      )}

      {state.error === "generic" && (
        <p role="alert" className="text-sm text-destructive">
          {t("errors.generic")}
        </p>
      )}

      {showApprovalNote && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t("approvalNote")}</p>}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
