import { describe, expect, it } from "vitest";
import { isValidDate, validateAnswers, type AnswerQuestion } from "@/lib/forms/answers";
import { convertQuestion, saveFormSchema, type DraftQuestion } from "@/lib/forms/schema";
import { localProblems } from "@/components/builder/question-meta";

const q = (over: Partial<AnswerQuestion> & Pick<AnswerQuestion, "type">): AnswerQuestion => ({
  id: crypto.randomUUID(),
  required: false,
  options: null,
  settings: {},
  ...over,
});

describe("validateAnswers", () => {
  it("requires required questions and keeps valid answers", () => {
    const name = q({ type: "short_text", required: true });
    const note = q({ type: "paragraph" });
    const r1 = validateAnswers([name, note], { [note.id]: "  hi  " });
    expect(r1.ok).toBe(false);
    expect(r1.errors).toEqual({ [name.id]: "required" });

    const r2 = validateAnswers([name, note], { [name.id]: " Siti ", [note.id]: "" });
    expect(r2).toEqual({ ok: true, errors: {}, clean: { [name.id]: "Siti" } });
  });

  it("treats whitespace-only text as empty", () => {
    const name = q({ type: "short_text", required: true });
    expect(validateAnswers([name], { [name.id]: "   " }).errors[name.id]).toBe("required");
  });

  it("caps text length", () => {
    const s = q({ type: "short_text" });
    const p = q({ type: "paragraph" });
    const r = validateAnswers([s, p], { [s.id]: "x".repeat(501), [p.id]: "y".repeat(5000) });
    expect(r.errors).toEqual({ [s.id]: "too_long" });
  });

  it("only accepts listed options unless Other is allowed", () => {
    const single = q({ type: "single_choice", options: ["Yes", "No"] });
    const other = q({ type: "single_choice", options: ["Yes", "No"], settings: { allow_other: true } });
    const dropdown = q({ type: "dropdown", options: ["A"], settings: { allow_other: true } });
    const r = validateAnswers([single, other, dropdown], { [single.id]: "Maybe", [other.id]: "Maybe", [dropdown.id]: "B" });
    expect(r.errors).toEqual({ [single.id]: "invalid_option", [dropdown.id]: "invalid_option" });
    expect(r.clean[other.id]).toBe("Maybe");
  });

  it("validates checkboxes: known options, one Other, stable order, required means at least one", () => {
    const cb = q({ type: "multiple_choice", options: ["A", "B", "C"], settings: { allow_other: true }, required: true });
    expect(validateAnswers([cb], { [cb.id]: ["C", "zzz", "A", "A"] }).clean[cb.id]).toEqual(["A", "C", "zzz"]);
    expect(validateAnswers([cb], { [cb.id]: ["x", "y"] }).errors[cb.id]).toBe("invalid_option");
    expect(validateAnswers([cb], { [cb.id]: [] }).errors[cb.id]).toBe("required");
    expect(validateAnswers([cb], { [cb.id]: "A" }).errors[cb.id]).toBe("invalid");
  });

  it("checks scale range and integer values", () => {
    const s = q({ type: "scale", settings: { min: 0, max: 10 } });
    expect(validateAnswers([s], { [s.id]: 0 }).clean[s.id]).toBe(0);
    expect(validateAnswers([s], { [s.id]: "7" }).clean[s.id]).toBe(7);
    expect(validateAnswers([s], { [s.id]: 11 }).errors[s.id]).toBe("out_of_range");
    expect(validateAnswers([s], { [s.id]: 2.5 }).errors[s.id]).toBe("invalid");
    const d = q({ type: "scale" });
    expect(validateAnswers([d], { [d.id]: 0 }).errors[d.id]).toBe("out_of_range");
  });

  it("checks dates", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("28/02/2026")).toBe(false);
    const d = q({ type: "date" });
    expect(validateAnswers([d], { [d.id]: "2026-13-01" }).errors[d.id]).toBe("invalid_date");
  });

  it("ignores answers to unknown questions", () => {
    const s = q({ type: "short_text" });
    expect(validateAnswers([s], { [s.id]: "ok", hacker: "x" }).clean).toEqual({ [s.id]: "ok" });
  });
});

describe("convertQuestion", () => {
  const base: DraftQuestion = {
    id: crypto.randomUUID(),
    type: "single_choice",
    title: "Pick",
    description: null,
    required: true,
    options: ["A", "B"],
    settings: { allow_other: true },
  };
  const opt = (n: number) => `Option ${n}`;

  it("keeps options between choice types and drops Other for dropdown", () => {
    expect(convertQuestion(base, "multiple_choice", opt)).toMatchObject({ options: ["A", "B"], settings: { allow_other: true } });
    expect(convertQuestion(base, "dropdown", opt)).toMatchObject({ options: ["A", "B"], settings: {} });
  });

  it("clears options for text types and sets scale defaults", () => {
    expect(convertQuestion(base, "short_text", opt)).toMatchObject({ options: null, settings: {}, title: "Pick", required: true });
    expect(convertQuestion(base, "scale", opt).settings).toEqual({ min: 1, max: 5 });
  });

  it("gives a new choice question one starter option", () => {
    const text = convertQuestion(base, "short_text", opt);
    expect(convertQuestion(text, "dropdown", opt).options).toEqual(["Option 1"]);
  });
});

describe("saveFormSchema", () => {
  it("rejects unknown settings keys and out-of-range scales", () => {
    const form = {
      title: "T",
      description: null,
      department_id: null,
      category_id: null,
      chapter_id: null,
      requires_login: false,
      limit_one_response: true,
      collect_name: false,
      confirmation_message: null,
    };
    const question = { id: crypto.randomUUID(), type: "scale", title: "x", description: null, required: false, options: null };
    expect(saveFormSchema.safeParse({ form, questions: [{ ...question, settings: { max: 10 } }] }).success).toBe(true);
    expect(saveFormSchema.safeParse({ form, questions: [{ ...question, settings: { max: 11 } }] }).success).toBe(false);
    expect(saveFormSchema.safeParse({ form, questions: [{ ...question, settings: { evil: 1 } }] }).success).toBe(false);
  });
});

describe("localProblems", () => {
  it("mirrors the server publish checks", () => {
    const untitled: DraftQuestion = { ...emptyQ(), title: " " };
    const fewOptions: DraftQuestion = { ...emptyQ(), title: "Pick", type: "dropdown", options: ["A", " "] };
    const form = {
      title: "x",
      description: null,
      department_id: null,
      category_id: crypto.randomUUID(),
      chapter_id: null,
      requires_login: false,
      limit_one_response: true,
      collect_name: false,
      confirmation_message: null,
    };
    const { codes, issues } = localProblems(form, [untitled, fewOptions]);
    expect(codes).toEqual(["department_required", "question_untitled", "choice_needs_options"]);
    expect(issues).toEqual({ [untitled.id]: "question_untitled", [fewOptions.id]: "choice_needs_options" });
    expect(localProblems(form, []).codes).toContain("no_questions");
  });
});

function emptyQ(): DraftQuestion {
  return { id: crypto.randomUUID(), type: "short_text", title: "", description: null, required: false, options: null, settings: {} };
}
