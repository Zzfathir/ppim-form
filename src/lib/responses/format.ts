import { appConfig } from "@/config/app";
import type { QuestionType } from "@/lib/questions";

/** A column of the responses table / export: one per question, in form order. */
export type ResponseColumn = { id: string; title: string; type: QuestionType; deleted: boolean };

export type ResponseRow = {
  id: string;
  submitted_at: string;
  respondent_name: string | null;
  respondent_email: string | null;
  answers: Record<string, unknown>;
};

/** Text form of one stored answer. Checkboxes are joined with "; " (build prompt §10). */
export function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join("; ");
  return String(value);
}

/** "2026-10-17 21:05:09" in the app time zone — sortable and unambiguous in spreadsheets. */
export function formatTimestamp(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: appConfig.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/**
 * Header + rows for export. Name/Email columns only appear when some response
 * has them (anonymous forms stay anonymous in the file too).
 */
export function exportTable(columns: ResponseColumn[], rows: ResponseRow[], labels: { timestamp: string; name: string; email: string; deleted: string }) {
  const hasName = rows.some((r) => r.respondent_name);
  const hasEmail = rows.some((r) => r.respondent_email);
  const header = [
    labels.timestamp,
    ...(hasName ? [labels.name] : []),
    ...(hasEmail ? [labels.email] : []),
    ...columns.map((c) => (c.deleted ? `${c.title} (${labels.deleted})` : c.title)),
  ];
  const body = rows.map((r) => [
    formatTimestamp(r.submitted_at),
    ...(hasName ? [r.respondent_name ?? ""] : []),
    ...(hasEmail ? [r.respondent_email ?? ""] : []),
    ...columns.map((c) => exportCell(c, r.answers[c.id])),
  ]);
  return { header, body };
}

export type Cell = string | number;

/** Scale answers stay numeric (so spreadsheets can average them); everything else is text. */
function exportCell(column: ResponseColumn, value: unknown): Cell {
  if (column.type === "scale" && typeof value === "number") return value;
  return formatAnswer(value);
}

/**
 * Spreadsheet formula injection guard (OWASP "CSV injection"): cells that start
 * with = + - @ or a tab/CR are prefixed with an apostrophe so they stay text.
 */
export function neutralizeFormula(cell: string): string {
  return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}

export function toCsv(header: Cell[], body: Cell[][]): string {
  const escape = (cell: Cell) => {
    if (typeof cell === "number") return String(cell);
    const safe = neutralizeFormula(cell);
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [header, ...body].map((row) => row.map(escape).join(","));
  // BOM so Excel opens UTF-8 (Indonesian names, emoji) correctly.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/** A filesystem-safe file name from the form title. */
export function exportFileName(title: string, ext: "csv" | "xlsx", now = new Date()): string {
  const base =
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "responses";
  return `${base}-responses-${formatTimestamp(now.toISOString()).slice(0, 10)}.${ext}`;
}
