/**
 * Removes what automated tests leave behind in the LOCAL database, keeping
 * real accounts (e.g. your Google sign-ins) and the dev seed.
 *
 *   npm run db:clean-tests
 *
 * Deletes: users with @example.test emails and their forms/templates/activity,
 * official templates titled "Template source …" left by tests, and departments
 * created by tests ("Dept …", "Archive test …", "Hack …") when unused.
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!["127.0.0.1", "localhost"].includes(url ? new URL(url).hostname : "")) {
  console.error("Refusing to run: db:clean-tests only touches a local database.");
  process.exit(1);
}
const db = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data: users, error } = await db.from("profiles").select("id").like("email", "%@example.test");
  if (error) throw error;
  const ids = users.map((u) => u.id);
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    await db.from("forms").delete().in("owner_id", chunk);
    await db.from("templates").delete().in("created_by", chunk);
    await db.from("activity_log").delete().in("actor_id", chunk);
  }
  let deleted = 0;
  for (const id of ids) if (!(await db.auth.admin.deleteUser(id)).error) deleted++;

  await db.from("templates").delete().like("title", "Template source %").is("created_by", null);
  const { data: depts } = await db.from("departments").select("id").or("name.like.Dept %,name.like.Archive test %,name.like.Hack %");
  for (const d of depts ?? []) await db.from("departments").delete().eq("id", d.id);

  console.log(`Removed ${deleted} test users and their data.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
