import { z } from "zod";
import { BANNER_STYLES, IMAGE_PATH_RE } from "@/lib/forms/banner";
import { DEFAULT_SCALE, QUESTION_TYPES, type QuestionSettings, type QuestionType, type TemplateQuestion } from "@/lib/questions";

export const LIMITS = {
  formTitle: 300,
  formDescription: 5000,
  questionTitle: 1000,
  questionDescription: 2000,
  option: 500,
  options: 200,
  questions: 200,
  confirmation: 2000,
  scaleLabel: 100,
  imageAlt: 300,
} as const;

/** Scale bounds follow Google Forms: start at 0 or 1, end between 2 and 10. */
export const SCALE_MIN_VALUES = [0, 1] as const;
export const SCALE_MAX_VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const settingsSchema = z
  .object({
    min: z.union([z.literal(0), z.literal(1)]).optional(),
    max: z.number().int().min(2).max(10).optional(),
    min_label: z.string().max(LIMITS.scaleLabel).optional(),
    max_label: z.string().max(LIMITS.scaleLabel).optional(),
    allow_other: z.boolean().optional(),
    image_path: z.string().regex(IMAGE_PATH_RE).optional(),
    image_alt: z.string().max(LIMITS.imageAlt).optional(),
  })
  .strict();

export const draftQuestionSchema = z.object({
  id: z.uuid(),
  type: z.enum(QUESTION_TYPES),
  title: z.string().max(LIMITS.questionTitle),
  description: z.string().max(LIMITS.questionDescription).nullable(),
  required: z.boolean(),
  options: z.array(z.string().max(LIMITS.option)).max(LIMITS.options).nullable(),
  settings: settingsSchema,
});

export const draftFormSchema = z.object({
  title: z.string().max(LIMITS.formTitle),
  description: z.string().max(LIMITS.formDescription).nullable(),
  department_id: z.uuid().nullable(),
  category_id: z.uuid().nullable(),
  chapter_id: z.uuid().nullable(),
  requires_login: z.boolean(),
  limit_one_response: z.boolean(),
  collect_name: z.boolean(),
  name_required: z.boolean(),
  confirmation_message: z.string().max(LIMITS.confirmation).nullable(),
  banner_path: z.string().regex(IMAGE_PATH_RE).nullable(),
  banner_style: z.enum(BANNER_STYLES),
});

export const saveFormSchema = z.object({
  form: draftFormSchema,
  questions: z.array(draftQuestionSchema).max(LIMITS.questions),
});

export type DraftQuestion = z.infer<typeof draftQuestionSchema>;
export type DraftForm = z.infer<typeof draftFormSchema>;
export type SaveFormPayload = z.infer<typeof saveFormSchema>;

/**
 * Normalises a question when its type changes, keeping what still applies
 * (Google Forms keeps options when switching between choice types).
 */
export function convertQuestion(q: DraftQuestion, type: QuestionType, defaultOption: (n: number) => string): DraftQuestion {
  const isChoice = (t: QuestionType) => t === "single_choice" || t === "multiple_choice" || t === "dropdown";
  const settings: QuestionSettings = {};
  let options: string[] | null = null;
  if (isChoice(type)) {
    options = q.options && q.options.length > 0 ? q.options : [defaultOption(1)];
    if (type !== "dropdown" && q.settings.allow_other) settings.allow_other = true;
  }
  if (type === "scale") {
    settings.min = q.settings.min ?? DEFAULT_SCALE.min;
    settings.max = q.settings.max ?? DEFAULT_SCALE.max;
    if (q.settings.min_label) settings.min_label = q.settings.min_label;
    if (q.settings.max_label) settings.max_label = q.settings.max_label;
  }
  // The question's image works with every answer type.
  if (q.settings.image_path) settings.image_path = q.settings.image_path;
  if (q.settings.image_alt) settings.image_alt = q.settings.image_alt;
  return { ...q, type, options, settings };
}

/** Converts a question row (DB) or template question into a builder draft. */
export function toDraftQuestion(row: {
  id: string;
  type: QuestionType;
  title: string;
  description?: string | null;
  required: boolean;
  options?: unknown;
  settings?: unknown;
}): DraftQuestion {
  const options = Array.isArray(row.options) ? row.options.filter((o): o is string => typeof o === "string") : null;
  const parsed = settingsSchema.safeParse(row.settings ?? {});
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description ?? null,
    required: row.required,
    options,
    settings: parsed.success ? parsed.data : {},
  };
}

/** Templates store questions without ids (build prompt §4). */
export function toTemplateQuestion(q: DraftQuestion): TemplateQuestion {
  return {
    type: q.type,
    title: q.title,
    description: q.description,
    required: q.required,
    options: q.options,
    settings: q.settings,
  };
}
