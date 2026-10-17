import type { AnswerQuestion } from "@/lib/forms/answers";

export type RenderQuestion = AnswerQuestion & { title: string; description: string | null };

export type RenderForm = {
  title: string;
  description: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  themeColor: string;
  collectName: boolean;
  requiresLogin: boolean;
};

/** Raw UI value per question; `other` holds the typed "Other" text. */
export type FieldValue = { value?: string | string[]; other?: string; otherSelected?: boolean };

export const OTHER = "__other__";
