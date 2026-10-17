import type { Database, Json } from "@/lib/database.types";
import { serviceClient } from "./db";

type FormStatus = Database["public"]["Enums"]["form_status"];
type QuestionInsert = Omit<Database["public"]["Tables"]["questions"]["Insert"], "form_id" | "position">;

const DEFAULT_QUESTIONS: QuestionInsert[] = [
  { type: "short_text", title: "Your name", required: true },
  { type: "single_choice", title: "Coming?", required: false, options: ["Yes", "No"] },
];

export async function firstCategory(): Promise<string> {
  const { data, error } = await serviceClient().from("categories").select("id").order("sort").limit(1).single();
  if (error || !data) throw error ?? new Error("Seed categories first");
  return data.id;
}

/** Creates a form (as the service role, so any status is allowed) with questions. */
export async function createForm(opts: {
  owner: string;
  department: string | null;
  category: string | null;
  status: FormStatus;
  title?: string;
  questions?: QuestionInsert[];
  /** Backdating is only possible on insert (the trigger keeps created_at immutable afterwards). */
  createdAt?: string;
}): Promise<{ id: string; questionIds: string[] }> {
  const svc = serviceClient();
  const { data: form, error } = await svc
    .from("forms")
    .insert({
      owner_id: opts.owner,
      department_id: opts.department,
      category_id: opts.category,
      status: opts.status,
      title: opts.title ?? `Test form ${Math.random().toString(36).slice(2, 7)}`,
      ...(opts.createdAt ? { created_at: opts.createdAt, published_at: opts.status === "draft" ? null : opts.createdAt } : {}),
    })
    .select("id")
    .single();
  if (error || !form) throw error;

  const questions = opts.questions ?? DEFAULT_QUESTIONS;
  if (questions.length === 0) return { id: form.id, questionIds: [] };
  const { data: qs, error: qErr } = await svc
    .from("questions")
    // Bulk inserts null out keys missing from some rows, so give every row the same shape.
    .insert(
      questions.map((q, position) => ({
        description: null,
        required: false,
        options: null,
        settings: {},
        ...q,
        form_id: form.id,
        position,
      })),
    )
    .select("id, position")
    .order("position");
  if (qErr || !qs) throw qErr;
  return { id: form.id, questionIds: qs.map((q) => q.id) };
}

export async function addResponse(formId: string, answers: Record<string, Json>) {
  const { error } = await serviceClient().from("responses").insert({ form_id: formId, answers });
  if (error) throw error;
}
