import type { AnswerQuestion } from "@/lib/forms/answers";
import type { SheetForm } from "./form-sheet";

export type RenderQuestion = AnswerQuestion & { title: string; description: string | null };

export type RenderForm = SheetForm & {
  themeColor: string;
  collectName: boolean;
  nameRequired: boolean;
  requiresLogin: boolean;
};

/** Raw UI value per question; `other` holds the typed "Other" text. */
export type FieldValue = { value?: string | string[]; other?: string; otherSelected?: boolean };

export const OTHER = "__other__";

/** Error key for the optional/required respondent name field. */
export const NAME_FIELD = "respondent_name";
