/** Summary and table RPCs: numbers match the stored data, and RLS applies. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/database.types";
import { assertLocalDatabase, cleanupUsers, createTestUser, firstDepartments, serviceClient, setProfile, type TestUser } from "../helpers/db";
import { createForm, firstCategory } from "../helpers/forms";

let owner: TestUser, peer: TestUser, outsider: TestUser, superadmin: TestUser;
let formId: string;
let q: Record<"single" | "multi" | "scale" | "date" | "text" | "dropdown", string>;

beforeAll(async () => {
  assertLocalDatabase();
  const [{ id: d1 }, { id: d2 }] = await firstDepartments(2);
  const category = await firstCategory();
  [owner, peer, outsider, superadmin] = await Promise.all(["r-owner", "r-peer", "r-out", "r-super"].map((l) => createTestUser(l)));
  await Promise.all([
    setProfile(owner.id, { role: "admin", status: "active", department_id: d1 }),
    setProfile(peer.id, { role: "admin", status: "active", department_id: d1 }),
    setProfile(outsider.id, { role: "admin", status: "active", department_id: d2 }),
    setProfile(superadmin.id, { role: "superadmin", status: "active" }),
  ]);

  const form = await createForm({
    owner: owner.id,
    department: d1,
    category,
    status: "open",
    questions: [
      { type: "single_choice", title: "Coming?", options: ["Yes", "No"], settings: { allow_other: true } },
      { type: "multiple_choice", title: "Topics", options: ["A", "B", "C"] },
      { type: "scale", title: "Rate", settings: { min: 1, max: 5 } },
      { type: "date", title: "When" },
      { type: "paragraph", title: "Notes" },
      { type: "dropdown", title: "Year", options: ["1", "2"] },
    ],
  });
  formId = form.id;
  const [single, multi, scale, date, text, dropdown] = form.questionIds;
  q = { single, multi, scale, date, text, dropdown };

  const rows: { answers: Record<string, Json>; respondent_name?: string; submitted_at: string }[] = [
    { answers: { [single]: "Yes", [multi]: ["A", "B"], [scale]: 5, [date]: "2026-11-01", [text]: "first" }, submitted_at: "2026-10-01T01:00:00Z" },
    { answers: { [single]: "Yes", [multi]: ["A"], [scale]: 4, [date]: "2026-11-01", [text]: "second" }, submitted_at: "2026-10-02T01:00:00Z" },
    { answers: { [single]: "Maybe later", [multi]: ["C", "something else"], [scale]: 2, [dropdown]: "2" }, submitted_at: "2026-10-03T01:00:00Z", respondent_name: "Zed" },
    { answers: { [single]: "No", [date]: "2026-11-05" }, submitted_at: "2026-10-04T01:00:00Z", respondent_name: "Ana" },
  ];
  const { error } = await serviceClient().from("responses").insert(rows.map((r) => ({ form_id: formId, ...r })));
  if (error) throw error;
});
afterAll(cleanupUsers);

describe("form_summary", () => {
  it("matches the stored responses for every question type", async () => {
    const { data, error } = await owner.client.rpc("form_summary", { p_form_id: formId });
    expect(error).toBeNull();
    const summary = data as unknown as { total: number; questions: Record<string, unknown>[] };
    expect(summary.total).toBe(4);
    const byId = Object.fromEntries(summary.questions.map((s) => [s.question_id as string, s]));

    expect(byId[q.single]).toMatchObject({ answered: 4, counts: { Yes: 2, No: 1, __other__: 1 } });
    // Checkbox counts are per respondent; one non-option value goes to "other".
    expect(byId[q.multi]).toMatchObject({ answered: 3, counts: { A: 2, B: 1, C: 1, __other__: 1 } });
    expect(byId[q.scale]).toMatchObject({ answered: 3, average: 3.67, counts: { "5": 1, "4": 1, "2": 1 } });
    expect(byId[q.date]).toMatchObject({
      answered: 3,
      dates: [
        { value: "2026-11-01", count: 2 },
        { value: "2026-11-05", count: 1 },
      ],
    });
    expect(byId[q.text]).toMatchObject({ answered: 2, latest: ["second", "first"] });
    expect(byId[q.dropdown]).toMatchObject({ answered: 1, counts: { "2": 1 } });
  });

  it("same-department admins and superadmins can read it; other departments cannot", async () => {
    expect((await peer.client.rpc("form_summary", { p_form_id: formId })).error).toBeNull();
    expect((await superadmin.client.rpc("form_summary", { p_form_id: formId })).error).toBeNull();
    const other = await outsider.client.rpc("form_summary", { p_form_id: formId });
    expect(other.error?.message).toBe("form_not_found");
  });
});

describe("responses_page", () => {
  const page = (client: TestUser["client"], over: Record<string, unknown> = {}) =>
    client.rpc("responses_page", { p_form_id: formId, p_sort: "submitted_at", p_desc: true, p_limit: 25, p_offset: 0, ...over });

  it("pages newest first with a total count", async () => {
    const { data } = await page(owner.client, { p_limit: 3 });
    expect(data!.map((r) => r.submitted_at.slice(0, 10))).toEqual(["2026-10-04", "2026-10-03", "2026-10-02"]);
    expect(Number(data![0].total_count)).toBe(4);
    const { data: next } = await page(owner.client, { p_limit: 3, p_offset: 3 });
    expect(next!.map((r) => r.submitted_at.slice(0, 10))).toEqual(["2026-10-01"]);
  });

  it("searches answers and names, treating % and _ literally", async () => {
    const byAnswer = await page(owner.client, { p_query: "something ELSE" });
    expect(byAnswer.data!.map((r) => r.respondent_name)).toEqual(["Zed"]);
    const byName = await page(owner.client, { p_query: "ana" });
    expect(byName.data).toHaveLength(1);
    const wildcard = await page(owner.client, { p_query: "%" });
    expect(wildcard.data).toEqual([]);
  });

  it("sorts by a question's answer and by name", async () => {
    const byScale = await page(owner.client, { p_sort: q.scale, p_desc: false });
    expect(byScale.data!.map((r) => (r.answers as Record<string, unknown>)[q.scale] ?? null)).toEqual([2, 4, 5, null]);
    const byName = await page(owner.client, { p_sort: "respondent_name", p_desc: false });
    expect(byName.data!.map((r) => r.respondent_name)).toEqual(["Ana", "Zed", null, null]);
  });

  it("ignores unsafe sort keys and returns nothing to other departments", async () => {
    const weird = await page(owner.client, { p_sort: "id; drop table responses" });
    expect(weird.error).toBeNull();
    expect(weird.data).toHaveLength(4);
    const other = await page(outsider.client);
    expect(other.data).toEqual([]);
  });
});
