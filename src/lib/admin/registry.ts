import { z } from "zod";
import { appConfig } from "@/config/app";
import { localMidnight } from "./period";

/** Registry filters as they appear in the URL (shared by the page and the CSV export). */
export const REGISTRY_SORTS = [
  "title",
  "department",
  "chapter",
  "category",
  "owner",
  "status",
  "created_at",
  "last_response_at",
  "response_count",
] as const;
export const REGISTRY_STATUSES = ["draft", "open", "closed", "archived", "deleted"] as const;

const uuid = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const DAY = 24 * 60 * 60 * 1000;

export type RegistryParams = {
  q: string;
  department: string | null;
  chapter: string | null; // uuid or "none"
  category: string | null;
  status: (typeof REGISTRY_STATUSES)[number] | null;
  owner: string | null; // uuid or "me"
  from: string | null;
  to: string | null;
  sort: (typeof REGISTRY_SORTS)[number];
  desc: boolean;
  page: number;
};

export function parseRegistryParams(sp: Record<string, string | string[] | undefined>): RegistryParams {
  const get = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || null;
  };
  const sort = REGISTRY_SORTS.find((s) => s === get("sort")) ?? "created_at";
  return {
    q: (get("q") ?? "").slice(0, 200),
    department: uuid.safeParse(get("department")).success ? get("department") : null,
    chapter: get("chapter") === "none" || uuid.safeParse(get("chapter")).success ? get("chapter") : null,
    category: uuid.safeParse(get("category")).success ? get("category") : null,
    status: REGISTRY_STATUSES.find((s) => s === get("status")) ?? null,
    owner: get("owner") === "me" || uuid.safeParse(get("owner")).success ? get("owner") : null,
    from: date.safeParse(get("from")).success ? get("from") : null,
    to: date.safeParse(get("to")).success ? get("to") : null,
    sort,
    desc: get("dir") ? get("dir") !== "asc" : sort === "created_at" || sort === "last_response_at" || sort === "response_count",
    page: Math.max(0, Math.min(10_000, Number.parseInt(get("page") ?? "0", 10) || 0)),
  };
}

/** Arguments for public.admin_forms(). */
export function registryRpcArgs(p: RegistryParams, meId: string, opts: { all?: boolean } = {}) {
  const pageSize = appConfig.registryPageSize;
  return {
    p_query: p.q || undefined,
    p_department: p.department ?? undefined,
    p_chapter: p.chapter && p.chapter !== "none" ? p.chapter : undefined,
    p_no_chapter: p.chapter === "none",
    p_category: p.category ?? undefined,
    p_status: p.status ?? undefined,
    p_owner: p.owner === "me" ? meId : (p.owner ?? undefined),
    p_from: p.from ? localMidnight(p.from).toISOString() : undefined,
    p_to: p.to ? new Date(localMidnight(p.to).getTime() + DAY).toISOString() : undefined,
    p_sort: p.sort,
    p_desc: p.desc,
    p_limit: opts.all ? 5000 : pageSize,
    p_offset: opts.all ? 0 : p.page * pageSize,
  };
}

/** Build a registry URL from params, overriding some (used by sort headers, pagination, export). */
export function registryQuery(p: RegistryParams, override: Partial<RegistryParams> = {}): string {
  const merged = { ...p, ...override };
  const q = new URLSearchParams();
  if (merged.q) q.set("q", merged.q);
  for (const k of ["department", "chapter", "category", "status", "owner", "from", "to"] as const) {
    if (merged[k]) q.set(k, merged[k]!);
  }
  if (merged.sort !== "created_at") q.set("sort", merged.sort);
  if (override.desc !== undefined || merged.sort !== "created_at" || !merged.desc) q.set("dir", merged.desc ? "desc" : "asc");
  if (merged.page) q.set("page", String(merged.page));
  return q.toString();
}
