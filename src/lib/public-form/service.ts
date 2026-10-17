import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { ANSWER_LIMITS, validateAnswers, type AnswerError } from "@/lib/forms/answers";
import { toDraftQuestion } from "@/lib/forms/schema";
import { bannerUrl, type BannerStyle } from "@/lib/forms/banner";
import type { RenderQuestion } from "@/components/form-renderer/types";

/**
 * Public form logic (build prompt §7). Runs with the service role, so it must
 * only ever return public-safe fields and must re-check everything itself.
 */

type Db = SupabaseClient<Database>;

export type Respondent = { id: string; email: string | null; name: string | null } | null;

export type PublicFormState = "not_found" | "closed" | "needs_login" | "already" | "open";

export type PublicForm =
  | { state: "not_found" }
  | {
      state: Exclude<PublicFormState, "not_found">;
      title: string;
      description: string | null;
      department: { name: string; color: string } | null;
      bannerUrl: string | null;
      bannerStyle: BannerStyle;
      requiresLogin: boolean;
      collectName: boolean;
      nameRequired: boolean;
      /** Only present when state = "open". */
      questions?: RenderQuestion[];
    };

/** Error key for the respondent name field (matches the form renderer). */
export const NAME_ERROR_KEY = "respondent_name";

/** Submissions per IP per form per window. Generous on purpose: many people share one IP at events. */
export const RATE_LIMIT = { hits: 60, windowSeconds: 600 } as const;
const SLUG_RE = /^[A-Za-z0-9]{6,20}$/;

const FORM_COLUMNS =
  "id, title, description, status, closes_at, deleted_at, requires_login, limit_one_response, collect_name, name_required, confirmation_message, banner_path, banner_style, departments(name, color)";

async function findForm(db: Db, slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  const { data, error } = await db.from("forms").select(FORM_COLUMNS).eq("share_slug", slug).maybeSingle();
  if (error) throw new Error(`public form lookup failed: ${error.message}`);
  if (!data || data.deleted_at) return null;
  return data;
}

type FormRow = NonNullable<Awaited<ReturnType<typeof findForm>>>;

function isAccepting(form: FormRow, now = new Date()) {
  return form.status === "open" && (!form.closes_at || new Date(form.closes_at) > now);
}

async function hasResponded(db: Db, formId: string, userId: string) {
  const { count } = await db
    .from("responses")
    .select("id", { count: "exact", head: true })
    .eq("form_id", formId)
    .eq("dedupe_key", userId);
  return (count ?? 0) > 0;
}

async function loadQuestions(db: Db, formId: string): Promise<RenderQuestion[]> {
  const { data, error } = await db
    .from("questions")
    .select("id, type, title, description, required, options, settings")
    .eq("form_id", formId)
    .eq("is_deleted", false)
    .order("position");
  if (error) throw new Error(`questions lookup failed: ${error.message}`);
  return data.map((q) => {
    const d = toDraftQuestion(q);
    return { id: d.id, type: d.type, title: d.title, description: d.description, required: d.required, options: d.options, settings: d.settings };
  });
}

function stateOf(form: FormRow, user: Respondent, already: boolean): Exclude<PublicFormState, "not_found"> {
  if (!isAccepting(form)) return "closed";
  if (form.requires_login && !user) return "needs_login";
  if (already) return "already";
  return "open";
}

export async function loadPublicForm(db: Db, slug: string, user: Respondent): Promise<PublicForm> {
  const form = await findForm(db, slug);
  if (!form) return { state: "not_found" };

  const already =
    isAccepting(form) && form.requires_login && form.limit_one_response && user ? await hasResponded(db, form.id, user.id) : false;
  const state = stateOf(form, user, already);
  const department = form.departments ? { name: form.departments.name, color: form.departments.color } : null;
  const banner = { bannerUrl: bannerUrl(form.banner_path), bannerStyle: form.banner_style as BannerStyle };

  if (state === "closed") {
    // Not accepting: only the title, department and banner (build prompt §7).
    return { state, title: form.title, description: null, department, ...banner, requiresLogin: false, collectName: false, nameRequired: false };
  }
  return {
    state,
    title: form.title,
    description: form.description,
    department,
    ...banner,
    requiresLogin: form.requires_login,
    collectName: form.collect_name && !form.requires_login,
    nameRequired: form.collect_name && form.name_required && !form.requires_login,
    questions: state === "open" ? await loadQuestions(db, form.id) : undefined,
  };
}

// --------------------------------------------------------------------------
// Submit
// --------------------------------------------------------------------------

export const submitSchema = z.object({
  answers: z.record(z.string().max(64), z.unknown()).refine((a) => Object.keys(a).length <= 300),
  name: z.string().max(ANSWER_LIMITS.name * 2).nullish(),
  website: z.string().max(500).optional(),
});

export type SubmitOutcome =
  | { status: 200; body: { ok: true; message: string | null } }
  | { status: 400; body: { ok: false; error: "invalid_request" } }
  | { status: 401; body: { ok: false; error: "needs_login" } }
  | { status: 404; body: { ok: false; error: "not_found" } }
  | { status: 409; body: { ok: false; error: "closed" | "already" } }
  | { status: 422; body: { ok: false; error: "invalid_answers"; errors: Record<string, AnswerError> } }
  | { status: 429; body: { ok: false; error: "rate_limited" } };

export async function submitPublicResponse(
  db: Db,
  input: { slug: string; body: unknown; user: Respondent; ip: string },
): Promise<SubmitOutcome> {
  // 4. Rate limit per IP + form (checked first: cheapest way to shed abuse).
  const { data: allowed, error: rlError } = await db.rpc("hit_rate_limit", {
    p_key: `submit:${input.ip}:${input.slug}`.slice(0, 200),
    p_limit: RATE_LIMIT.hits,
    p_window_seconds: RATE_LIMIT.windowSeconds,
  });
  if (rlError) throw new Error(`rate limit failed: ${rlError.message}`);
  if (!allowed) return { status: 429, body: { ok: false, error: "rate_limited" } };

  const parsed = submitSchema.safeParse(input.body);
  if (!parsed.success) return { status: 400, body: { ok: false, error: "invalid_request" } };

  // 1. Load the form and reject if missing, closed or past its close date.
  const form = await findForm(db, input.slug);
  if (!form) return { status: 404, body: { ok: false, error: "not_found" } };
  if (!isAccepting(form)) return { status: 409, body: { ok: false, error: "closed" } };

  // 4. Honeypot: bots get a normal-looking success and nothing is stored.
  if (parsed.data.website && parsed.data.website.trim() !== "") {
    return { status: 200, body: { ok: true, message: form.confirmation_message } };
  }

  // 2. Sign-in required forms need a session; otherwise identity fields from the client are ignored.
  if (form.requires_login && !input.user) return { status: 401, body: { ok: false, error: "needs_login" } };

  // 3. Validate answers against the form's current questions.
  const questions = await loadQuestions(db, form.id);
  const result = validateAnswers(questions, parsed.data.answers);
  const errors: Record<string, AnswerError> = { ...result.errors };
  const name = parsed.data.name?.trim().slice(0, ANSWER_LIMITS.name) || null;
  if (!form.requires_login && form.collect_name && form.name_required && !name) errors[NAME_ERROR_KEY] = "required";
  if (Object.keys(errors).length > 0) return { status: 422, body: { ok: false, error: "invalid_answers", errors } };

  // 5–6. Identity and dedupe.
  let respondent_id: string | null = null;
  let respondent_email: string | null = null;
  let respondent_name: string | null = null;
  let dedupe_key: string | null = null;
  if (form.requires_login && input.user) {
    respondent_id = input.user.id;
    respondent_email = input.user.email;
    respondent_name = input.user.name;
    if (form.limit_one_response) dedupe_key = input.user.id;
  } else if (form.collect_name) {
    respondent_name = name;
  }

  // 7. Insert. A unique violation on (form_id, dedupe_key) means "already responded".
  const { error } = await db.from("responses").insert({
    form_id: form.id,
    answers: result.clean,
    respondent_id,
    respondent_email,
    respondent_name,
    dedupe_key,
  });
  if (error) {
    if (error.code === "23505") return { status: 409, body: { ok: false, error: "already" } };
    throw new Error(`response insert failed: ${error.message}`);
  }
  return { status: 200, body: { ok: true, message: form.confirmation_message } };
}
