import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type Db = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * DB tests create and delete users, so they only ever run against the local
 * Supabase started with `npm run db:start`, never a cloud project.
 */
export function assertLocalDatabase() {
  const host = url ? new URL(url).hostname : "";
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(
      `DB tests must run against local Supabase (got "${url || "unset"}"). ` +
        "Run `npm run db:start` and point .env.local at http://127.0.0.1:54321.",
    );
  }
}

export function serviceClient(): Db {
  return createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClient(): Db {
  return createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type TestUser = { id: string; email: string; client: Db };

const created: string[] = [];

/**
 * Creates an auth user (the DB trigger makes it a `respondent`) and returns a
 * client signed in as that user. Password sign-in is used only by tests against
 * the local stack; the app itself offers Google sign-in only.
 */
export async function createTestUser(label: string): Promise<TestUser> {
  const admin = serviceClient();
  const email = `test-${label}-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  created.push(data.user.id);

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

/** Directly set role/status/department (as a superadmin action would). */
export async function setProfile(
  id: string,
  patch: Database["public"]["Tables"]["profiles"]["Update"],
) {
  const { error } = await serviceClient().from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}

export async function firstDepartments(n: number) {
  const { data, error } = await serviceClient().from("departments")
    .select("id, name")
    .eq("is_archived", false)
    .order("created_at")
    .order("name")
    .limit(n);
  if (error || !data || data.length < n) throw error ?? new Error("Seed departments first: npm run db:seed");
  return data;
}

export async function setApprovalRequired(value: boolean) {
  const { error } = await serviceClient().from("app_settings").update({ require_admin_approval: value }).eq("id", true);
  if (error) throw error;
}

export async function cleanupUsers() {
  const admin = serviceClient();
  await Promise.all(created.splice(0).map((id) => admin.auth.admin.deleteUser(id)));
}
