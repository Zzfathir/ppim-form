import {
  AlignLeft,
  BetweenHorizontalStart,
  Calendar,
  CircleChevronDown,
  CircleDot,
  GitCommitHorizontal,
  Image,
  SquareCheck,
  TextCursorInput,
  type LucideIcon,
} from "lucide-react";
import { isAnswerable, type QuestionType } from "@/lib/questions";
import type { DraftForm, DraftQuestion } from "@/lib/forms/schema";

export const QUESTION_ICONS: Record<QuestionType, LucideIcon> = {
  short_text: TextCursorInput,
  paragraph: AlignLeft,
  single_choice: CircleDot,
  multiple_choice: SquareCheck,
  dropdown: CircleChevronDown,
  scale: GitCommitHorizontal,
  date: Calendar,
  section: BetweenHorizontalStart,
  image: Image,
};

/** Grouped like Google Forms' type menu. */
export const QUESTION_TYPE_GROUPS: QuestionType[][] = [
  ["short_text", "paragraph"],
  ["single_choice", "multiple_choice", "dropdown"],
  ["scale", "date"],
];

export type QuestionIssue = "question_untitled" | "choice_needs_options" | "image_missing";

/**
 * Client-side mirror of the database's publish_problems(), used to highlight
 * fields inline. The server check remains the authority.
 */
export function localProblems(form: DraftForm, questions: DraftQuestion[]) {
  const issues: Record<string, QuestionIssue> = {};
  const answerable = questions.filter(isAnswerable);
  for (const q of answerable) {
    if (q.title.trim() === "") issues[q.id] = "question_untitled";
    else if (
      (q.type === "single_choice" || q.type === "multiple_choice" || q.type === "dropdown") &&
      (q.options ?? []).filter((o) => o.trim() !== "").length < 2
    )
      issues[q.id] = "choice_needs_options";
  }
  for (const q of questions) if (q.type === "image" && !q.settings.image_path) issues[q.id] = "image_missing";
  const codes: string[] = [];
  if (!form.department_id) codes.push("department_required");
  if (!form.category_id) codes.push("category_required");
  if (answerable.length === 0) codes.push("no_questions");
  if (Object.values(issues).includes("question_untitled")) codes.push("question_untitled");
  if (Object.values(issues).includes("choice_needs_options")) codes.push("choice_needs_options");
  if (Object.values(issues).includes("image_missing")) codes.push("image_missing");
  return { codes, issues };
}
