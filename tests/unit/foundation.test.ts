import { describe, expect, it } from "vitest";
import { isPublicFormPath, safeReturnTo } from "@/lib/safe-redirect";
import { parseEmailList } from "@/lib/env.server";
import { brand, brandCssVariables } from "@/config/brand";

describe("safeReturnTo", () => {
  it("keeps same-origin paths", () => {
    expect(safeReturnTo("/f/abc123")).toBe("/f/abc123");
    expect(safeReturnTo("/forms/1?tab=responses")).toBe("/forms/1?tab=responses");
  });

  it("rejects open redirects", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "evil", "/x\r\nLocation: y"]) {
      expect(safeReturnTo(bad)).toBe("/dashboard");
    }
  });

  it("falls back when empty", () => {
    expect(safeReturnTo(null)).toBe("/dashboard");
    expect(safeReturnTo(undefined, "/x")).toBe("/x");
  });
});

describe("isPublicFormPath", () => {
  it("detects public form pages", () => {
    expect(isPublicFormPath("/f/abc")).toBe(true);
    expect(isPublicFormPath("/forms/abc")).toBe(false);
  });
});

describe("parseEmailList", () => {
  it("splits, trims and lowercases", () => {
    expect(parseEmailList(" A@x.com, b@Y.com ,,")).toEqual(["a@x.com", "b@y.com"]);
    expect(parseEmailList("")).toEqual([]);
  });
});

describe("brand", () => {
  it("exposes brand colors as CSS variables", () => {
    const css = brandCssVariables();
    expect(css).toContain(`--brand-accent:${brand.colors.accent}`);
    expect(css).toContain(`--brand-primary:${brand.colors.primary}`);
    expect(css).toContain(`--brand-chart-1:${brand.chartPalette[0]}`);
  });
});
