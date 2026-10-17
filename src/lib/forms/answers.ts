import { DEFAULT_SCALE, type QuestionSettings, type QuestionType } from "@/lib/questions";

/**
 * Answer validation shared by the respondent UI (inline errors) and the public
 * submit handler (which re-validates everything on the server).
 *
 * Stored answer shapes ({ "<question_id>": value }):
 *   short_text / paragraph / date → string (date as YYYY-MM-DD)
 *   single_choice / dropdown       → option label (or the typed "Other" text)
 *   multiple_choice                → string[] of labels (at most one "Other" text)
 *   scale                          → integer
 */

export const ANSWER_LIMITS = { short_text: 500, paragraph: 5000, other: 500, name: 120 } as const;

export type AnswerQuestion = {
  id: string;
  type: QuestionType;
  required: boolean;
  options: string[] | null;
  settings: QuestionSettings;
};

export type AnswerValue = string | string[] | number;
export type AnswerError = "required" | "too_long" | "invalid_option" | "out_of_range" | "invalid_date" | "invalid";

export type ValidationResult = {
  ok: boolean;
  errors: Record<string, AnswerError>;
  /** Only answers to known questions, trimmed; empty answers removed. */
  clean: Record<string, AnswerValue>;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function validateOne(q: AnswerQuestion, raw: unknown): { error?: AnswerError; value?: AnswerValue } {
  if (isEmpty(raw)) return q.required ? { error: "required" } : {};
  const options = (q.options ?? []).filter((o) => o.trim() !== "");
  const allowOther = q.type !== "dropdown" && q.settings.allow_other === true;

  switch (q.type) {
    case "short_text":
    case "paragraph": {
      if (typeof raw !== "string") return { error: "invalid" };
      const value = raw.trim();
      return value.length > ANSWER_LIMITS[q.type] ? { error: "too_long" } : { value };
    }
    case "single_choice":
    case "dropdown": {
      if (typeof raw !== "string") return { error: "invalid" };
      const value = raw.trim();
      if (options.includes(value)) return { value };
      if (!allowOther) return { error: "invalid_option" };
      return value.length > ANSWER_LIMITS.other ? { error: "too_long" } : { value };
    }
    case "multiple_choice": {
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) return { error: "invalid" };
      const values = [...new Set((raw as string[]).map((v) => v.trim()).filter(Boolean))];
      if (values.length === 0) return q.required ? { error: "required" } : {};
      const others = values.filter((v) => !options.includes(v));
      if (others.length > 0 && (!allowOther || others.length > 1)) return { error: "invalid_option" };
      if (others.some((v) => v.length > ANSWER_LIMITS.other)) return { error: "too_long" };
      // Keep option order stable, "Other" text last.
      return { value: [...options.filter((o) => values.includes(o)), ...others] };
    }
    case "scale": {
      const n = typeof raw === "string" ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isInteger(n)) return { error: "invalid" };
      const min = q.settings.min ?? DEFAULT_SCALE.min;
      const max = q.settings.max ?? DEFAULT_SCALE.max;
      return n < min || n > max ? { error: "out_of_range" } : { value: n };
    }
    case "date": {
      if (typeof raw !== "string" || !isValidDate(raw.trim())) return { error: "invalid_date" };
      return { value: raw.trim() };
    }
  }
}

export function validateAnswers(questions: AnswerQuestion[], answers: Record<string, unknown>): ValidationResult {
  const errors: Record<string, AnswerError> = {};
  const clean: Record<string, AnswerValue> = {};
  for (const q of questions) {
    const { error, value } = validateOne(q, answers[q.id]);
    if (error) errors[q.id] = error;
    else if (value !== undefined) clean[q.id] = value;
  }
  return { ok: Object.keys(errors).length === 0, errors, clean };
}
