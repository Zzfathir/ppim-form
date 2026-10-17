import type { Database, Json } from "@/lib/database.types";

export type QuestionType = Database["public"]["Enums"]["question_type"];

export const QUESTION_TYPES = [
  "short_text",
  "paragraph",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "scale",
  "date",
] as const satisfies readonly QuestionType[];

export const CHOICE_TYPES: readonly QuestionType[] = ["single_choice", "multiple_choice", "dropdown"];

export function isChoiceType(type: QuestionType): boolean {
  return CHOICE_TYPES.includes(type);
}

/** Settings stored in `questions.settings` (all optional). */
export type QuestionSettings = {
  /** Scale bounds (default 1–5) and optional end labels. */
  min?: number;
  max?: number;
  min_label?: string;
  max_label?: string;
  /** Choice types: show an "Other" option with free text. */
  allow_other?: boolean;
};

/** Shape of a question inside `templates.questions` (a `questions` row without ids). */
export type TemplateQuestion = {
  type: QuestionType;
  title: string;
  description?: string | null;
  required: boolean;
  options?: string[] | null;
  settings?: QuestionSettings;
};

export const DEFAULT_SCALE = { min: 1, max: 5 } as const;

/** For jsonb columns: the generated types use NonNullable<Json> for NOT NULL columns. */
export function toJson<T>(value: T): NonNullable<Json> {
  return value as unknown as NonNullable<Json>;
}
