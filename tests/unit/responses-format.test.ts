import { describe, expect, it } from "vitest";
import { exportFileName, exportTable, formatAnswer, formatTimestamp, neutralizeFormula, toCsv, type ResponseColumn } from "@/lib/responses/format";

const labels = { timestamp: "Timestamp", name: "Name", email: "Email", deleted: "deleted question" };
const cols: ResponseColumn[] = [
  { id: "q1", title: "Name?", type: "short_text", deleted: false },
  { id: "q2", title: "Topics", type: "multiple_choice", deleted: false },
  { id: "q3", title: "Rate", type: "scale", deleted: false },
  { id: "q4", title: "Old", type: "short_text", deleted: true },
];

describe("formatAnswer", () => {
  it("joins checkbox answers with '; ' and stringifies the rest", () => {
    expect(formatAnswer(["A", "B"])).toBe("A; B");
    expect(formatAnswer(4)).toBe("4");
    expect(formatAnswer(undefined)).toBe("");
  });
});

describe("formatTimestamp", () => {
  it("uses Malaysia time (UTC+8), 24h, sortable", () => {
    expect(formatTimestamp("2026-10-17T16:05:09Z")).toBe("2026-10-18 00:05:09");
  });
});

describe("exportTable", () => {
  it("orders columns like the form, labels deleted questions, keeps scale numeric", () => {
    const { header, body } = exportTable(
      cols,
      [{ id: "r1", submitted_at: "2026-01-01T00:00:00Z", respondent_name: null, respondent_email: null, answers: { q1: "Siti", q2: ["A", "C"], q3: 5, q4: "x" } }],
      labels,
    );
    expect(header).toEqual(["Timestamp", "Name?", "Topics", "Rate", "Old (deleted question)"]);
    expect(body).toEqual([["2026-01-01 08:00:00", "Siti", "A; C", 5, "x"]]);
  });

  it("adds Name/Email columns only when some response has them", () => {
    const { header, body } = exportTable(
      cols.slice(0, 1),
      [
        { id: "r1", submitted_at: "2026-01-01T00:00:00Z", respondent_name: "Budi", respondent_email: "b@x.id", answers: {} },
        { id: "r2", submitted_at: "2026-01-01T00:00:00Z", respondent_name: null, respondent_email: null, answers: { q1: "y" } },
      ],
      labels,
    );
    expect(header).toEqual(["Timestamp", "Name", "Email", "Name?"]);
    expect(body[1]).toEqual(["2026-01-01 08:00:00", "", "", "y"]);
  });
});

describe("toCsv", () => {
  it("escapes quotes, commas and newlines, starts with a BOM, uses CRLF", () => {
    const csv = toCsv(["a", "b"], [['say "hi", ok', "line1\nline2"], ["plain", 3]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1)).toBe('a,b\r\n"say ""hi"", ok","line1\nline2"\r\nplain,3\r\n');
  });

  it("neutralizes spreadsheet formulas", () => {
    expect(neutralizeFormula("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(neutralizeFormula("@SUM(1)")).toBe("'@SUM(1)");
    expect(neutralizeFormula("normal")).toBe("normal");
    expect(toCsv(["h"], [["+1+1"]]).trim().split("\r\n")[1]).toBe("'+1+1");
  });
});

describe("exportFileName", () => {
  it("makes a safe file name from the title", () => {
    expect(exportFileName("Pendaftaran: Buka Bersama 2026!", "xlsx", new Date("2026-10-17T03:00:00Z"))).toBe(
      "Pendaftaran-Buka-Bersama-2026-responses-2026-10-17.xlsx",
    );
    expect(exportFileName("???", "csv", new Date("2026-10-17T03:00:00Z"))).toBe("responses-responses-2026-10-17.csv");
  });
});
