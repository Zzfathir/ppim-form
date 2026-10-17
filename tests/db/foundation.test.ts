import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  assertLocalDatabase,
  cleanupUsers,
  createTestUser,
  firstDepartments,
  serviceClient,
  setApprovalRequired,
  setProfile,
} from "../helpers/db";

beforeAll(() => assertLocalDatabase());
afterAll(async () => {
  await setApprovalRequired(true);
  await cleanupUsers();
});

describe("profile bootstrap", () => {
  it("creates a respondent profile on first sign-in", async () => {
    const user = await createTestUser("bootstrap");
    const { data } = await user.client.from("profiles").select("*").eq("id", user.id).single();
    expect(data).toMatchObject({ role: "respondent", status: "active", email: user.email, full_name: "Test bootstrap" });
  });
});

describe("onboarding", () => {
  it("upgrades a respondent to a pending admin when approval is required", async () => {
    await setApprovalRequired(true);
    const [dept] = await firstDepartments(1);
    const user = await createTestUser("pending");
    const { data, error } = await user.client.rpc("complete_onboarding", {
      p_full_name: "  Siti  ",
      p_department_id: dept.id,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ role: "admin", status: "pending", department_id: dept.id, full_name: "Siti" });

    const { data: log } = await serviceClient()
      .from("activity_log")
      .select("action")
      .eq("entity_id", user.id);
    expect(log?.map((l) => l.action)).toContain("admin_requested");
  });

  it("makes the admin active immediately when approval is off", async () => {
    await setApprovalRequired(false);
    const [dept] = await firstDepartments(1);
    const user = await createTestUser("active");
    const { data } = await user.client.rpc("complete_onboarding", { p_full_name: "Budi", p_department_id: dept.id });
    expect(data).toMatchObject({ role: "admin", status: "active" });
    await setApprovalRequired(true);
  });

  it("rejects archived departments and repeat onboarding", async () => {
    const admin = serviceClient();
    const { data: archived } = await admin
      .from("departments")
      .insert({ name: `Archived ${Date.now()}`, is_archived: true })
      .select("id")
      .single();
    try {
      const user = await createTestUser("archived");
      const bad = await user.client.rpc("complete_onboarding", { p_full_name: "X", p_department_id: archived!.id });
      expect(bad.error?.message).toContain("invalid_department");

      const [dept] = await firstDepartments(1);
      await user.client.rpc("complete_onboarding", { p_full_name: "X", p_department_id: dept.id });
      const again = await user.client.rpc("complete_onboarding", { p_full_name: "X", p_department_id: dept.id });
      expect(again.error?.message).toContain("already_onboarded");
    } finally {
      await admin.from("departments").delete().eq("id", archived!.id);
    }
  });

  it("lets a superadmin without a department set one without changing role", async () => {
    const [dept] = await firstDepartments(1);
    const user = await createTestUser("super-nodept");
    await setProfile(user.id, { role: "superadmin", status: "active" });
    const { data } = await user.client.rpc("complete_onboarding", { p_full_name: "Sec", p_department_id: dept.id });
    expect(data).toMatchObject({ role: "superadmin", status: "active", department_id: dept.id });
  });
});

describe("profiles are protected", () => {
  it("a user cannot promote themselves or change their status", async () => {
    const user = await createTestUser("selfpromote");
    await user.client.from("profiles").update({ role: "superadmin", status: "active" }).eq("id", user.id);
    const { data } = await serviceClient().from("profiles").select("role").eq("id", user.id).single();
    expect(data?.role).toBe("respondent");
  });

  it("a user cannot read other people's profiles", async () => {
    const a = await createTestUser("reader");
    const b = await createTestUser("other");
    const { data } = await a.client.from("profiles").select("id").eq("id", b.id);
    expect(data).toEqual([]);
  });

  it("a superadmin can read and update all profiles", async () => {
    const sa = await createTestUser("super");
    await setProfile(sa.id, { role: "superadmin", status: "active" });
    const other = await createTestUser("target");
    const { data } = await sa.client.from("profiles").select("id").eq("id", other.id);
    expect(data).toHaveLength(1);
    const upd = await sa.client.from("profiles").update({ status: "suspended" }).eq("id", other.id).select("status");
    expect(upd.data?.[0]?.status).toBe("suspended");
  });

  it("admins see only names of colleagues in their own department", async () => {
    const [d1, d2] = await firstDepartments(2);
    const a = await createTestUser("deptA");
    const sameDept = await createTestUser("deptA2");
    const otherDept = await createTestUser("deptB");
    await setProfile(a.id, { role: "admin", status: "active", department_id: d1.id });
    await setProfile(sameDept.id, { role: "admin", status: "active", department_id: d1.id });
    await setProfile(otherDept.id, { role: "admin", status: "active", department_id: d2.id });

    const { data } = await a.client.from("department_members").select("*").in("id", [sameDept.id, otherDept.id]);
    expect(data?.map((m) => m.id)).toEqual([sameDept.id]);
    expect(Object.keys(data?.[0] ?? {})).not.toContain("email");
  });
});

describe("lookups and settings", () => {
  it("anonymous clients cannot read any table", async () => {
    const anon = anonClient();
    for (const table of ["departments", "chapters", "categories", "profiles", "app_settings", "activity_log"] as const) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? []).toEqual([]);
    }
    const { data: members } = await anon.from("department_members").select("*").limit(1);
    expect(members ?? []).toEqual([]);
  });

  it("signed-in users read departments but only superadmins write them or read settings", async () => {
    const user = await createTestUser("lookup");
    const { data: depts } = await user.client.from("departments").select("id");
    expect(depts!.length).toBeGreaterThanOrEqual(12);

    const ins = await user.client.from("departments").insert({ name: `Hack ${Date.now()}` }).select();
    expect(ins.error).not.toBeNull();
    const settings = await user.client.from("app_settings").select("*");
    expect(settings.data).toEqual([]);
    const approval = await user.client.rpc("admin_approval_required");
    expect(approval.data).toBe(true);

    const sa = await createTestUser("lookup-sa");
    await setProfile(sa.id, { role: "superadmin", status: "active" });
    const name = `Dept ${Date.now()}`;
    const ok = await sa.client.from("departments").insert({ name }).select("id").single();
    expect(ok.error).toBeNull();
    await serviceClient().from("departments").delete().eq("id", ok.data!.id);
  });
});
