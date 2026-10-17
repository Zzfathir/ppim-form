import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../src/lib/database.types";
import { toJson, type TemplateQuestion } from "../../src/lib/questions";
import { TEMPLATES } from "./templates";

type Db = SupabaseClient<Database>;
type FormStatus = Database["public"]["Enums"]["form_status"];

const DEV_DOMAIN = "ppi-form.test";
const DAY = 24 * 60 * 60 * 1000;

/** Small deterministic PRNG so every dev seed produces the same picture. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const rand = rng(20261017);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const NAMES = [
  "Ahmad Fauzi", "Siti Rahma", "Budi Santoso", "Dewi Lestari", "Rizky Pratama", "Nur Aisyah", "Fajar Nugroho",
  "Putri Ayu", "Hendra Wijaya", "Intan Permata", "Yusuf Hakim", "Larasati", "Gilang Ramadhan", "Maya Sari",
];
const SENTENCES = [
  "Great event, thank you to the committee!",
  "The schedule could be shared earlier.",
  "Very helpful for new students.",
  "Please hold more sessions like this.",
  "The venue was a bit far from campus.",
  "Sangat bermanfaat, terima kasih!",
];

const DEV_ADMINS = [
  { name: "Rani Kusuma", dept: 0, status: "active" },
  { name: "Dimas Saputra", dept: 1, status: "active" },
  { name: "Ayu Wulandari", dept: 4, status: "active" },
  { name: "Bagas Hidayat", dept: 5, status: "active" },
  { name: "Citra Anggraini", dept: 9, status: "active" },
  { name: "Eko Prasetyo", dept: 4, status: "active" },
  { name: "Fitri Handayani", dept: 7, status: "pending" },
] as const;

function answerFor(q: TemplateQuestion): Json | undefined {
  if (!q.required && rand() < 0.25) return undefined;
  switch (q.type) {
    case "short_text":
      return pick(NAMES);
    case "paragraph":
      return pick(SENTENCES);
    case "single_choice":
    case "dropdown":
      return pick(q.options ?? []);
    case "multiple_choice": {
      const chosen = (q.options ?? []).filter(() => rand() < 0.5);
      return chosen.length ? chosen : [pick(q.options ?? [])];
    }
    case "scale": {
      const min = q.settings?.min ?? 1;
      const max = q.settings?.max ?? 5;
      return Math.max(min, Math.min(max, max - Math.floor(rand() * rand() * (max - min + 1))));
    }
    case "date": {
      const d = new Date(Date.now() + int(-30, 60) * DAY);
      return d.toISOString().slice(0, 10);
    }
  }
}

export async function seedDevData(db: Db) {
  const { data: existing } = await db.from("profiles").select("id").like("email", `%@${DEV_DOMAIN}`).limit(1);
  if (existing && existing.length > 0) return console.log("dev data: already seeded, skipped");

  const [{ data: departments }, { data: categories }, { data: chapters }, { data: templates }] = await Promise.all([
    db.from("departments").select("id, name").order("created_at").order("name"),
    db.from("categories").select("id, name"),
    db.from("chapters").select("id").order("name"),
    db.from("templates").select("id, title"),
  ]);
  if (!departments?.length || !categories?.length || !templates?.length) throw new Error("Run the base seed first");
  const categoryId = new Map(categories.map((c) => [c.name, c.id]));
  const templateId = new Map(templates.map((t) => [t.title, t.id]));

  // Sample admins (auth users get a profile from the DB trigger; then we promote them).
  const admins: { id: string; departmentId: string; status: string }[] = [];
  for (const [i, a] of DEV_ADMINS.entries()) {
    const { data, error } = await db.auth.admin.createUser({
      email: `dev-admin-${i + 1}@${DEV_DOMAIN}`,
      email_confirm: true,
      user_metadata: { full_name: a.name },
    });
    if (error || !data.user) throw error;
    const departmentId = departments[a.dept % departments.length].id;
    const { error: upd } = await db
      .from("profiles")
      .update({ role: "admin", status: a.status, department_id: departmentId, full_name: a.name })
      .eq("id", data.user.id);
    if (upd) throw upd;
    admins.push({ id: data.user.id, departmentId, status: a.status });
  }

  // Forms: 2–4 per admin, built from templates, spread over the last ~4 months.
  let formCount = 0;
  let responseCount = 0;
  for (const admin of admins) {
    const n = admin.status === "pending" ? 1 : int(2, 4);
    for (let k = 0; k < n; k++) {
      const tpl = pick(TEMPLATES);
      const createdAt = new Date(Date.now() - int(3, 120) * DAY - int(0, DAY));
      const status: FormStatus =
        admin.status === "pending" ? "draft" : pick(["open", "open", "open", "closed", "closed", "draft", "archived"]);
      const published = status !== "draft";
      const publishedAt = published ? new Date(createdAt.getTime() + int(0, 2) * DAY) : null;
      const closedAt = status === "closed" || status === "archived" ? new Date(Math.min(Date.now(), publishedAt!.getTime() + int(5, 30) * DAY)) : null;

      const { data: form, error } = await db
        .from("forms")
        .insert({
          owner_id: admin.id,
          department_id: admin.departmentId,
          category_id: categoryId.get(tpl.category) ?? null,
          chapter_id: chapters && rand() < 0.5 ? pick(chapters).id : null,
          template_id: templateId.get(tpl.title) ?? null,
          title: `${tpl.title} — ${pick(["Welcoming Party", "Seminar Pendidikan", "Buka Bersama", "Futsal Cup", "Rapat Kerja", "Bakti Sosial"])}`,
          description: tpl.description,
          status,
          requires_login: rand() < 0.2,
          created_at: createdAt.toISOString(),
          published_at: publishedAt?.toISOString() ?? null,
          closed_at: closedAt?.toISOString() ?? null,
        })
        .select("id, requires_login")
        .single();
      if (error || !form) throw error;
      formCount++;

      const { data: questions, error: qErr } = await db
        .from("questions")
        .insert(
          tpl.questions.map((q, position) => ({
            form_id: form.id,
            position,
            type: q.type,
            title: q.title,
            description: q.description ?? null,
            required: q.required,
            options: (q.options ?? null) as Json,
            settings: toJson(q.settings ?? {}),
          })),
        )
        .select("id, position");
      if (qErr || !questions) throw qErr;
      const idByPosition = new Map(questions.map((q) => [q.position, q.id]));

      if (!publishedAt) continue;
      const end = closedAt ?? new Date();
      const total = int(0, 45);
      const rows = Array.from({ length: total }, () => {
        const answers: Record<string, Json> = {};
        tpl.questions.forEach((q, position) => {
          const a = answerFor(q);
          if (a !== undefined) answers[idByPosition.get(position)!] = a;
        });
        const name = pick(NAMES);
        const at = new Date(publishedAt.getTime() + rand() * Math.max(DAY, end.getTime() - publishedAt.getTime()));
        return {
          form_id: form.id,
          answers,
          submitted_at: new Date(Math.min(at.getTime(), Date.now())).toISOString(),
          respondent_name: form.requires_login ? name : null,
          respondent_email: form.requires_login ? `${name.toLowerCase().replace(/\s+/g, ".")}@example.com` : null,
        };
      });
      if (rows.length) {
        const { error: rErr } = await db.from("responses").insert(rows);
        if (rErr) throw rErr;
        responseCount += rows.length;
      }
    }
  }

  console.log(`dev data: ${admins.length} admins, ${formCount} forms, ${responseCount} responses`);
}
