import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";
import { serverEnv } from "@/lib/env.server";

/**
 * Service-role client: bypasses RLS. Server-only. Use it only where the
 * handler does its own authorization (public form endpoints, auth bootstrap).
 */
export function createAdminClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
