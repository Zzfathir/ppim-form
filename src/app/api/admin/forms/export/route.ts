import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseRegistryParams, registryRpcArgs } from "@/lib/admin/registry";
import { shareUrl } from "@/lib/forms/share";
import { formatTimestamp, toCsv } from "@/lib/responses/format";

/** CSV of the registry with the same filters as the page (O3). Superadmins only. */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (profile.role !== "superadmin" || profile.status === "suspended") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const params = parseRegistryParams(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_forms", registryRpcArgs(params, profile.id, { all: true }));
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });

  const t = await getTranslations("admin.registry");
  const ts = await getTranslations("status");
  const header = [
    t("colTitle"),
    t("colDepartment"),
    t("colChapter"),
    t("colCategory"),
    t("colCreator"),
    t("creatorEmail"),
    t("colStatus"),
    t("colCreated"),
    t("published"),
    t("colLastResponse"),
    t("colResponses"),
    t("colLink"),
  ];
  const body = data.map((r) => [
    r.title,
    r.department_name ?? "",
    r.chapter_name ?? "",
    r.category_name ?? "",
    r.owner_name ?? "",
    r.owner_email ?? "",
    r.deleted_at ? t("deleted") : ts(r.status),
    formatTimestamp(r.created_at),
    r.published_at ? formatTimestamp(r.published_at) : "",
    r.last_response_at ? formatTimestamp(r.last_response_at) : "",
    Number(r.response_count),
    r.status === "draft" ? "" : shareUrl(r.share_slug),
  ]);

  const date = formatTimestamp(new Date().toISOString()).slice(0, 10);
  return new NextResponse(toCsv(header, body), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ppi-form-registry-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
