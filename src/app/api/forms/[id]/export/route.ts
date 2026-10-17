import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exportFileName, exportTable, toCsv, type Cell } from "@/lib/responses/format";
import { fetchAllResponses, getResponseColumns } from "@/lib/responses/queries";

/**
 * GET /api/forms/{id}/export?format=csv|xlsx — all responses of a form, built
 * on the server. Runs as the signed-in user, so RLS decides who may export.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/forms/[id]/export">) {
  const { id } = await ctx.params;
  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["admin", "superadmin"].includes(profile.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data: form } = await supabase.from("forms").select("title").eq("id", id).maybeSingle();
  if (!form) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const t = await getTranslations("responses.export");
  const [columns, rows] = await Promise.all([getResponseColumns(supabase, id), fetchAllResponses(supabase, id)]);
  const { header, body } = exportTable(columns, rows, {
    timestamp: t("timestamp"),
    name: t("name"),
    email: t("email"),
    deleted: t("deleted"),
  });
  const filename = exportFileName(form.title, format);
  const headers = {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  };

  if (format === "csv") {
    return new NextResponse(toCsv(header, body), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(t("sheet"), { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(header).font = { bold: true };
  // Strings are written as text cells (never formulas), numbers stay numeric.
  for (const row of body) sheet.addRow(row as Cell[]);
  sheet.columns.forEach((col, i) => {
    const longest = Math.max(...[header, ...body.slice(0, 200)].map((r) => String(r[i] ?? "").length));
    col.width = Math.min(60, Math.max(12, longest + 2));
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
}
