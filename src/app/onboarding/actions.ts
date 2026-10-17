"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  fullName: z.string().trim().min(1).max(120),
  departmentId: z.uuid(),
  chapterId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
});

const KNOWN_ERRORS = ["invalid_name", "invalid_department", "invalid_chapter", "already_onboarded"] as const;
export type OnboardingError = (typeof KNOWN_ERRORS)[number] | "generic";
export type OnboardingState = { error?: OnboardingError };

export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const parsed = schema.safeParse({
    fullName: formData.get("fullName"),
    departmentId: formData.get("departmentId"),
    chapterId: formData.get("chapterId") ?? "",
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === "fullName" ? "invalid_name" : field === "chapterId" ? "invalid_chapter" : "invalid_department" };
  }

  const supabase = await createClient();
  // The RPC re-validates everything and decides pending vs active from app_settings.
  const { error } = await supabase.rpc("complete_onboarding", {
    p_full_name: parsed.data.fullName,
    p_department_id: parsed.data.departmentId,
    p_chapter_id: parsed.data.chapterId ?? undefined,
  });

  if (error) {
    const known = KNOWN_ERRORS.find((code) => error.message.includes(code));
    if (known === "already_onboarded") redirect("/dashboard");
    return { error: known ?? "generic" };
  }

  redirect("/dashboard");
}
