import { describe, expect, it } from "vitest";
import { localDate, localMidnight, resolvePeriod, semesterStart } from "@/lib/admin/period";
import { parseRegistryParams, registryQuery, registryRpcArgs } from "@/lib/admin/registry";

// 2026-10-17 22:30 in Kuala Lumpur (UTC+8) = 14:30Z.
const now = new Date("2026-10-17T14:30:00Z");

describe("period", () => {
  it("converts between instants and Malaysia calendar days", () => {
    expect(localDate(new Date("2026-10-17T16:30:00Z"))).toBe("2026-10-18"); // 00:30 next day in KL
    expect(localMidnight("2026-10-18").toISOString()).toBe("2026-10-17T16:00:00.000Z");
  });

  it("30 days is the default and includes today", () => {
    const p = resolvePeriod({}, now);
    expect(p.key).toBe("30d");
    expect(p.to.toISOString()).toBe("2026-10-17T16:00:00.000Z"); // midnight after today (exclusive)
    expect(p.fromDate).toBe("2026-09-18");
    expect(p.toDate).toBe("2026-10-17");
  });

  it("7 days", () => {
    const p = resolvePeriod({ period: "7d" }, now);
    expect([p.fromDate, p.toDate]).toEqual(["2026-10-11", "2026-10-17"]);
  });

  it("this semester starts on the configured month", () => {
    expect(semesterStart(now)).toBe("2026-09-01");
    expect(semesterStart(new Date("2026-03-01T00:00:00Z"))).toBe("2026-02-01");
    expect(semesterStart(new Date("2026-01-10T00:00:00Z"))).toBe("2025-09-01");
    expect(resolvePeriod({ period: "semester" }, now).fromDate).toBe("2026-09-01");
  });

  it("custom ranges are inclusive, swapped when reversed, and ignore junk", () => {
    expect(resolvePeriod({ period: "custom", from: "2026-01-01", to: "2026-01-31" }, now)).toMatchObject({
      key: "custom",
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
    });
    expect(resolvePeriod({ period: "custom", from: "2026-01-31", to: "2026-01-01" }, now)).toMatchObject({
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
    });
    expect(resolvePeriod({ period: "custom", from: "nope", to: "2026-01-01" }, now).key).toBe("30d");
  });
});

describe("registry params", () => {
  it("parses only valid values", () => {
    const p = parseRegistryParams({ status: "open", chapter: "none", owner: "me", sort: "bogus", department: "x", from: "2026-01-01" });
    expect(p).toMatchObject({ status: "open", chapter: "none", owner: "me", sort: "created_at", department: null, from: "2026-01-01", desc: true });
  });

  it("maps to RPC arguments", () => {
    const p = parseRegistryParams({ chapter: "none", owner: "me", to: "2026-01-31", page: "2" });
    const args = registryRpcArgs(p, "11111111-1111-4111-8111-111111111111");
    expect(args).toMatchObject({ p_no_chapter: true, p_owner: "11111111-1111-4111-8111-111111111111", p_offset: 100 });
    expect(args.p_to).toBe("2026-01-31T16:00:00.000Z");
  });

  it("round-trips through the URL", () => {
    const p = parseRegistryParams({ q: "futsal", status: "closed", sort: "title", dir: "asc" });
    expect(parseRegistryParams(Object.fromEntries(new URLSearchParams(registryQuery(p))))).toEqual(p);
  });
});
