/**
 * Initial data for PPIM Form. Safe to re-run: each table is only seeded when it
 * is empty, so renames/archives made later by the secretary are never undone.
 *
 *   npm run db:seed            # departments, chapters, categories, templates
 *   npm run db:seed:dev        # + sample admins, forms and responses (local database only)
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { toJson } from "../src/lib/questions";
import { TEMPLATES } from "./seed-data/templates";
import { seedDevData } from "./seed-data/dev";

config({ path: resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

/** Distinct department colors (seed data only; editable in /admin/departments). */
const DEPARTMENT_COLORS = [
  "#C80609", "#111827", "#2563EB", "#059669", "#D97706", "#7C3AED",
  "#DB2777", "#0891B2", "#65A30D", "#EA580C", "#4B5563", "#9333EA",
];

const CATEGORIES = [
  "Event registration",
  "Survey",
  "Feedback / evaluation",
  "Poll / voting",
  "Attendance",
  "Data collection",
  "Other",
];

/** Placeholders until the owner supplies the real campus list (PRD §13.1). */
const PLACEHOLDER_CHAPTERS = ["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4", "Chapter 5"];

async function isEmpty(table: "departments" | "chapters" | "categories" | "templates") {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return (count ?? 0) === 0;
}

async function seedDepartments() {
  if (!(await isEmpty("departments"))) return console.log("departments: already seeded, skipped");
  const file = resolve(process.cwd(), "spec/seed/departments.json");
  const rows = JSON.parse(readFileSync(file, "utf8")) as { name: string; description?: string }[];
  const { error } = await db.from("departments").insert(
    rows.map((d, i) => ({
      name: d.name,
      description: d.description || null,
      color: DEPARTMENT_COLORS[i % DEPARTMENT_COLORS.length],
    })),
  );
  if (error) throw error;
  console.log(`departments: inserted ${rows.length}`);
}

async function seedChapters() {
  if (!(await isEmpty("chapters"))) return console.log("chapters: already seeded, skipped");
  const { error } = await db.from("chapters").insert(PLACEHOLDER_CHAPTERS.map((name) => ({ name })));
  if (error) throw error;
  console.log(`chapters: inserted ${PLACEHOLDER_CHAPTERS.length} placeholders`);
}

async function seedCategories() {
  if (!(await isEmpty("categories"))) return console.log("categories: already seeded, skipped");
  const { error } = await db.from("categories").insert(CATEGORIES.map((name, i) => ({ name, sort: i })));
  if (error) throw error;
  console.log(`categories: inserted ${CATEGORIES.length}`);
}

async function seedTemplates() {
  if (!(await isEmpty("templates"))) return console.log("templates: already seeded, skipped");
  const { data: categories, error: catError } = await db.from("categories").select("id, name");
  if (catError) throw catError;
  const byName = new Map(categories.map((c) => [c.name, c.id]));
  const { error } = await db.from("templates").insert(
    TEMPLATES.map((t) => ({
      title: t.title,
      description: t.description,
      category_id: byName.get(t.category) ?? null,
      questions: toJson(t.questions),
      is_published: true,
      // Starter templates are the secretariat's official set, visible to every department.
      is_official: true,
    })),
  );
  if (error) throw error;
  console.log(`templates: inserted ${TEMPLATES.length}`);
}

async function main() {
  await seedDepartments();
  await seedChapters();
  await seedCategories();
  await seedTemplates();
  if (process.argv.includes("--dev")) {
    const host = new URL(url!).hostname;
    if (!["127.0.0.1", "localhost"].includes(host)) {
      throw new Error("--dev seed only runs against a local database");
    }
    await seedDevData(db);
  }
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
