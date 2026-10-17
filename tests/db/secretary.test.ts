/**
 * Secretary RPCs and rules. Test data is backdated into March 2001 so the
 * overview numbers are exact regardless of other data in the database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/database.types";
import { assertLocalDatabase, cleanupUsers, createTestUser, firstDepartments, serviceClient, setProfile, type TestUser } from "../helpers/db";
import { createForm, firstCategory } from "../helpers/forms";

let sa: TestUser, sa2: TestUser, adminA: TestUser, adminB: TestUser;
let d1: string, d2: string, category: string;
const formsInMarch: string[] = [];

const MARCH = { p_from: "2001-02-28T16:00:00Z", p_to: "2001-03-31T16:00:00Z" }; // March 2001 in Malaysia time
const EARLY_MARCH = { p_from: "2001-02-28T16:00:00Z", p_to: "2001-03-09T16:00:00Z" }; // 1–9 March

beforeAll(async () => {
  assertLocalDatabase();
  [{ id: d1 }, { id: d2 }] = await firstDepartments(2);
  category = await firstCategory();
  [sa, sa2, adminA, adminB] = await Promise.all(["s-sa", "s-sa2", "s-a", "s-b"].map((l) => createTestUser(l)));
  await Promise.all([
    setProfile(sa.id, { role: "superadmin", status: "active", department_id: d1 }),
    setProfile(sa2.id, { role: "superadmin", status: "active", department_id: d1 }),
    setProfile(adminA.id, { role: "admin", status: "active", department_id: d1 }),
    setProfile(adminB.id, { role: "admin", status: "active", department_id: d2 }),
  ]);

  // The year 2001 belongs to this test file: clear leftovers from earlier runs first.
  const svc = serviceClient();
  await svc.from("responses").delete().gte("submitted_at", "2001-01-01").lt("submitted_at", "2002-01-01");
  await svc.from("forms").delete().gte("created_at", "2001-01-01").lt("created_at", "2002-01-01");

  // Three forms in March 2001 (two in d1, one in d2), with responses spread over the month.
  for (const [owner, dept, day] of [
    [adminA.id, d1, "05"],
    [adminA.id, d1, "20"],
    [adminB.id, d2, "07"],
  ] as const) {
    const f = await createForm({ owner, department: dept, category, status: "open", createdAt: `2001-03-${day}T02:00:00Z` });
    formsInMarch.push(f.id);
  }
  const responses: { form_id: string; answers: NonNullable<Json>; submitted_at: string }[] = [
    { form_id: formsInMarch[0], answers: {}, submitted_at: "2001-03-06T02:00:00Z" },
    { form_id: formsInMarch[0], answers: {}, submitted_at: "2001-03-06T05:00:00Z" },
    { form_id: formsInMarch[2], answers: {}, submitted_at: "2001-03-08T02:00:00Z" },
    { form_id: formsInMarch[1], answers: {}, submitted_at: "2001-03-25T02:00:00Z" },
  ];
  const { error } = await svc.from("responses").insert(responses);
  if (error) throw error;
});
afterAll(cleanupUsers);

type Overview = {
  bucket: string;
  kpis: Record<string, number>;
  departments: { id: string; forms_in_period: number; responses_in_period: number }[];
  responses_series: { bucket: string; count: number }[];
  forms_series: { bucket: string; count: number }[];
};

describe("admin_overview", () => {
  it("is for superadmins only", async () => {
    const res = await adminA.client.rpc("admin_overview", MARCH);
    expect(res.error?.message).toBe("forbidden");
  });

  it("counts forms, responses and active departments in the period, per day, with empty days", async () => {
    const { data, error } = await sa.client.rpc("admin_overview", MARCH);
    expect(error).toBeNull();
    const o = data as unknown as Overview;
    expect(o.bucket).toBe("day");
    expect(o.kpis).toMatchObject({ forms_in_period: 3, responses_in_period: 4, departments_active: 2 });
    expect(o.responses_series).toHaveLength(31);
    expect(o.responses_series.find((p) => p.bucket === "2001-03-06")?.count).toBe(2);
    expect(o.forms_series.reduce((n, p) => n + p.count, 0)).toBe(3);
    const byDept = Object.fromEntries(o.departments.map((d) => [d.id, d]));
    expect(byDept[d1]).toMatchObject({ forms_in_period: 2, responses_in_period: 3 });
    expect(byDept[d2]).toMatchObject({ forms_in_period: 1, responses_in_period: 1 });
  });

  it("includes departments with zero forms", async () => {
    const { data } = await sa.client.rpc("admin_overview", MARCH);
    const o = data as unknown as Overview;
    const { count } = await serviceClient().from("departments").select("*", { count: "exact", head: true }).eq("is_archived", false);
    expect(o.departments.length).toBeGreaterThanOrEqual(count!);
    expect(o.departments.filter((d) => d.forms_in_period === 0).length).toBeGreaterThan(0);
  });

  it("changes with the period", async () => {
    const { data } = await sa.client.rpc("admin_overview", EARLY_MARCH);
    const o = data as unknown as Overview;
    expect(o.kpis).toMatchObject({ forms_in_period: 2, responses_in_period: 3, departments_active: 2 });
    const year = await sa.client.rpc("admin_overview", { p_from: "2000-12-31T16:00:00Z", p_to: "2001-12-31T16:00:00Z" });
    expect((year.data as unknown as Overview).bucket).toBe("week");
  });
});

describe("admin_forms", () => {
  const args = { p_from: MARCH.p_from, p_to: MARCH.p_to };

  it("filters by department and owner, sorts by responses, returns a total", async () => {
    const { data } = await sa.client.rpc("admin_forms", { ...args, p_department: d1, p_sort: "response_count", p_desc: true });
    expect(data!.map((r) => r.id)).toEqual([formsInMarch[0], formsInMarch[1]]);
    expect(data!.map((r) => Number(r.response_count))).toEqual([2, 1]);
    expect(Number(data![0].total_count)).toBe(2);
    const byOwner = await sa.client.rpc("admin_forms", { ...args, p_owner: adminB.id });
    expect(byOwner.data!.map((r) => r.id)).toEqual([formsInMarch[2]]);
  });

  it("filters forms without a chapter, and shows deleted forms only when asked", async () => {
    const noChapter = await sa.client.rpc("admin_forms", { ...args, p_no_chapter: true });
    expect(noChapter.data).toHaveLength(3);
    const extra = await createForm({ owner: adminA.id, department: d1, category, status: "draft", createdAt: "2001-03-15T00:00:00Z" });
    await serviceClient().from("forms").update({ deleted_at: new Date().toISOString() }).eq("id", extra.id);
    expect((await sa.client.rpc("admin_forms", args)).data).toHaveLength(3);
    const deleted = await sa.client.rpc("admin_forms", { ...args, p_status: "deleted" });
    expect(deleted.data!.map((r) => r.id)).toEqual([extra.id]);
  });

  it("is for superadmins only", async () => {
    expect((await adminA.client.rpc("admin_forms", args)).error?.message).toBe("forbidden");
    expect((await adminA.client.rpc("admin_people")).error?.message).toBe("forbidden");
  });
});

describe("people and ownership", () => {
  it("transfers every form of an admin and logs each one", async () => {
    const leaver = await createTestUser("s-leaver");
    await setProfile(leaver.id, { role: "admin", status: "active", department_id: d1 });
    const f1 = await createForm({ owner: leaver.id, department: d1, category, status: "draft" });
    const f2 = await createForm({ owner: leaver.id, department: d1, category, status: "open" });

    const { data, error } = await sa.client.rpc("transfer_forms", { p_from: leaver.id, p_to: adminA.id });
    expect(error).toBeNull();
    expect(data).toBe(2);
    const { data: owners } = await serviceClient().from("forms").select("owner_id").in("id", [f1.id, f2.id]);
    expect(owners!.every((o) => o.owner_id === adminA.id)).toBe(true);
    const { data: log } = await serviceClient().from("activity_log").select("actor_id").eq("action", "form_transferred").in("entity_id", [f1.id, f2.id]);
    expect(log!.map((l) => l.actor_id)).toEqual([sa.id, sa.id]);
  });

  it("refuses suspended targets", async () => {
    const suspended = await createTestUser("s-susp");
    await setProfile(suspended.id, { role: "admin", status: "suspended", department_id: d1 });
    const res = await sa.client.rpc("transfer_forms", { p_from: adminA.id, p_to: suspended.id });
    expect(res.error?.message).toBe("invalid_target");
  });

  it("a superadmin cannot change their own role or status", async () => {
    const res = await sa.client.from("profiles").update({ status: "suspended" }).eq("id", sa.id);
    expect(res.error?.message).toBe("cannot_change_own_access");
  });

  it("the last active superadmin cannot be demoted or suspended", async () => {
    const svc = serviceClient();
    // Temporarily make sa2 the only other active superadmin besides sa.
    const { data: others } = await svc.from("profiles").select("id").eq("role", "superadmin").eq("status", "active").not("id", "in", `(${sa.id},${sa2.id})`);
    const otherIds = (others ?? []).map((o) => o.id);
    if (otherIds.length) await svc.from("profiles").update({ status: "suspended" }).in("id", otherIds);
    try {
      // sa demotes sa2: allowed (sa remains).
      expect((await sa.client.from("profiles").update({ role: "admin" }).eq("id", sa2.id)).error).toBeNull();
      // sa2 is now an admin; promote back via service role, then suspend sa via sa2? sa2 is not superadmin anymore,
      // so check the guard directly: the service role cannot remove the last active superadmin either.
      const last = await svc.from("profiles").update({ status: "suspended" }).eq("id", sa.id);
      expect(last.error?.message).toBe("last_superadmin");
    } finally {
      await svc.from("profiles").update({ role: "superadmin", status: "active" }).eq("id", sa2.id);
      if (otherIds.length) await svc.from("profiles").update({ status: "active" }).in("id", otherIds);
    }
  });
});

describe("departments", () => {
  it("archiving a department with forms keeps the forms tagged and visible in reports", async () => {
    const svc = serviceClient();
    const { data: dept } = await sa.client.from("departments").insert({ name: `Archive test ${Date.now()}` }).select("id").single();
    const f = await createForm({ owner: adminA.id, department: dept!.id, category, status: "open" });

    expect((await sa.client.from("departments").update({ is_archived: true }).eq("id", dept!.id)).error).toBeNull();
    const { data: form } = await svc.from("forms").select("department_id").eq("id", f.id).single();
    expect(form?.department_id).toBe(dept!.id);

    const overview = await sa.client.rpc("admin_overview", { p_from: "2000-01-01T00:00:00Z", p_to: "2100-01-01T00:00:00Z" });
    const listed = (overview.data as unknown as { departments: { id: string; is_archived: boolean }[] }).departments.find((d) => d.id === dept!.id);
    expect(listed).toMatchObject({ is_archived: true });

    // Hard delete is refused while forms use it.
    const del = await sa.client.from("departments").delete().eq("id", dept!.id);
    expect(del.error?.code).toBe("23503");
    // Archived departments can't be picked during onboarding.
    const fresh = await createTestUser("s-onboard");
    const onboard = await fresh.client.rpc("complete_onboarding", { p_full_name: "X", p_department_id: dept!.id });
    expect(onboard.error?.message).toBe("invalid_department");
  });
});
