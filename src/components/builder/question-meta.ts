import {
  AlignLeft,
  Calendar,
  CircleChevronDown,
  CircleDot,
  GitCommitHorizontal,
  SquareCheck,
  TextCursorInput,
  type LucideIcon,
} from "lucide-react";
import type { QuestionType } from "@/lib/questions";
import type { DraftForm, DraftQuestion } from "@/lib/forms/schema";

export const QUESTION_ICONS: Record<QuestionType, LucideIcon> = {
  short_text: TextCursorInput,
  paragraph: AlignLeft,
  single_choice: CircleDot,
  multiple_choice: SquareCheck,
  dropdown: CircleChevronDown,
  scale: GitCommitHorizontal,
  date: Calendar,
};

/** Grouped like Google Forms' type menu. */
export const QUESTION_TYPE_GROUPS: QuestionType[][] = [
  ["short_text", "paragraph"],
  ["single_choice", "multiple_choice", "dropdown"],
  ["scale", "date"],
];

export type QuestionIssue = "question_untitled" | "choice_needs_options";

/**
 * Client-side mirror of the database's publish_problems(), used to highlight
 * fields inline. The server check remains the authority.
 */
export function localProblems(form: DraftForm, questions: DraftQuestion[]) {
  const issues: Record<string, QuestionIssue> = {};
  for (const q of questions) {
    if (q.title.trim() === "") issues[q.id] = "question_untitled";
    else if (
      (q.type === "single_choice" || q.type === "multiple_choice" || q.type === "dropdown") &&
      (q.options ?? []).filter((o) => o.trim() !== "").length < 2
    )
      issues[q.id] = "choice_needs_options";
  }
  const codes: string[] = [];
  if (!form.department_id) codes.push("department_required");
  if (!form.category_id) codes.push("category_required");
  if (questions.length === 0) codes.push("no_questions");
  if (Object.values(issues).includes("question_untitled")) codes.push("question_untitled");
  if (Object.values(issues).includes("choice_needs_options")) codes.push("choice_needs_options");
  return { codes, issues };
}
