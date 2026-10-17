import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import type { BrowserContext } from "@playwright/test";
import { serviceClient } from "../helpers/db";

/**
 * Creates a user and puts a real Supabase session cookie into the browser,
 * standing in for Google sign-in (which can't be automated). Local stack only.
 */
export async function signInAs(context: BrowserContext, baseURL: string, label: string) {
  const email = `e2e-${label}-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `E2E ${label}` },
  });
  if (error || !data.user) throw error;

  const jar = new Map<string, string>();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const { hostname } = new URL(baseURL);
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, domain: hostname, path: "/" })));
  return { id: data.user.id, email };
}
