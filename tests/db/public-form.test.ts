/** Public form service (build prompt §7) against the local database. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPublicForm, RATE_LIMIT, submitPublicResponse, type Respondent } from "@/lib/public-form/service";
import type { Database } from "@/lib/database.types";
import { assertLocalDatabase, cleanupUsers, createTestUser, firstDepartments, serviceClient, setProfile } from "../helpers/db";
import { createForm, firstCategory } from "../helpers/forms";

const db = () => serviceClient();
let owner: string, dept: string, category: string;
let respondent: { id: string; email: string };
const ip = () => `test-${randomUUID()}`;

const QUESTIONS = [
  { type: "short_text" as const, title: "Name", required: true },
  { type: "single_choice" as const, title: "Coming?", required: true, options: ["Yes", "No"] },
  { type: "scale" as const, title: "Rate", required: false, settings: { min: 1, max: 5 } },
];

async function publicForm(over: Partial<{ status: "draft" | "open" | "closed" | "archived" }> = {}, settings: Database["public"]["Tables"]["forms"]["Update"] = {}) {
  const form = await createForm({ owner, department: dept, category, status: over.status ?? "open", questions: QUESTIONS });
  if (Object.keys(settings).length) await db().from("forms").update(settings).eq("id", form.id);
  const { data } = await db().from("forms").select("share_slug").eq("id", form.id).single();
  return { ...form, slug: data!.share_slug, answers: { [form.questionIds[0]]: "Siti", [form.questionIds[1]]: "Yes" } };
}

async function responsesOf(formId: string) {
  const { data } = await db().from("responses").select("*").eq("form_id", formId);
  return data!;
}

beforeAll(async () => {
  assertLocalDatabase();
  [{ id: dept }] = await firstDepartments(1);
  category = await firstCategory();
  const o = await createTestUser("pub-owner");
  await setProfile(o.id, { role: "admin", status: "active", department_id: dept });
  owner = o.id;
  const r = await createTestUser("pub-resp");
  respondent = { id: r.id, email: r.email };
});
afterAll(cleanupUsers);

const asUser = (): Respondent => ({ id: respondent.id, email: respondent.email, name: "Test Respondent" });

describe("loadPublicForm states", () => {
  it("not_found for unknown, malformed and soft-deleted slugs", async () => {
    expect((await loadPublicForm(db(), "doesNotExist1", null)).state).toBe("not_found");
    expect((await loadPublicForm(db(), "../etc/passwd", null)).state).toBe("not_found");
    const f = await publicForm();
    await db().from("forms").update({ deleted_at: new Date().toISOString() }).eq("id", f.id);
    expect((await loadPublicForm(db(), f.slug, null)).state).toBe("not_found");
  });

  it("closed for drafts, closed forms and forms past closes_at — with title and department only", async () => {
    for (const status of ["draft", "closed", "archived"] as const) {
      const f = await publicForm({ status });
      const res = await loadPublicForm(db(), f.slug, null);
      expect(res.state, status).toBe("closed");
      if (res.state !== "not_found") expect(res.questions).toBeUndefined();
    }
    const past = await publicForm({}, { closes_at: new Date(Date.now() - 60_000).toISOString() });
    expect((await loadPublicForm(db(), past.slug, null)).state).toBe("closed");
  });

  it("open returns only public-safe fields", async () => {
    const f = await publicForm();
    const res = await loadPublicForm(db(), f.slug, null);
    expect(res.state).toBe("open");
    expect(Object.keys(res).sort()).toEqual([
      "allowAnother",
      "bannerStyle",
      "bannerUrl",
      "collectName",
      "department",
      "description",
      "nameRequired",
      "questions",
      "requiresLogin",
      "state",
      "title",
    ]);
    if (res.state === "not_found") throw new Error();
    expect(res.questions!.map((q) => q.title)).toEqual(["Name", "Coming?", "Rate"]);
    expect(Object.keys(res.questions![0]).sort()).toEqual(["description", "id", "options", "required", "settings", "title", "type"]);
    expect(JSON.stringify(res)).not.toContain(owner);
  });

  it("needs_login without a session, open with one, already after responding", async () => {
    const f = await publicForm({}, { requires_login: true, limit_one_response: true });
    expect((await loadPublicForm(db(), f.slug, null)).state).toBe("needs_login");
    expect((await loadPublicForm(db(), f.slug, asUser())).state).toBe("open");
    const res = await submitPublicResponse(db(), { slug: f.slug, body: { answers: f.answers }, user: asUser(), ip: ip() });
    expect(res.status).toBe(200);
    expect((await loadPublicForm(db(), f.slug, asUser())).state).toBe("already");
  });

  it("hides deleted questions", async () => {
    const f = await publicForm();
    await db().from("questions").update({ is_deleted: true }).eq("id", f.questionIds[2]);
    const res = await loadPublicForm(db(), f.slug, null);
    if (res.state === "not_found") throw new Error();
    expect(res.questions!.map((q) => q.title)).toEqual(["Name", "Coming?"]);
  });
});

describe("submitPublicResponse", () => {
  it("stores an anonymous response and returns the confirmation message", async () => {
    const f = await publicForm({}, { confirmation_message: "Sampai jumpa!" });
    const res = await submitPublicResponse(db(), {
      slug: f.slug,
      body: { answers: { ...f.answers, [f.questionIds[2]]: 4 }, name: "Should be ignored" },
      user: asUser(), // a session on a no-login form is ignored too
      ip: ip(),
    });
    expect(res).toMatchObject({ status: 200, body: { ok: true, message: "Sampai jumpa!" } });
    const [row] = await responsesOf(f.id);
    expect(row).toMatchObject({ respondent_id: null, respondent_email: null, respondent_name: null, dedupe_key: null });
    expect(row.answers).toEqual({ ...f.answers, [f.questionIds[2]]: 4 });
  });

  it("stores the optional name only when the form collects it", async () => {
    const f = await publicForm({}, { collect_name: true });
    await submitPublicResponse(db(), { slug: f.slug, body: { answers: f.answers, name: "  Budi  " }, user: null, ip: ip() });
    expect((await responsesOf(f.id))[0].respondent_name).toBe("Budi");
  });

  it("rejects required and invalid answers on the server, keeping nothing", async () => {
    const f = await publicForm();
    const res = await submitPublicResponse(db(), {
      slug: f.slug,
      body: { answers: { [f.questionIds[1]]: "Maybe", [f.questionIds[2]]: 9 } },
      user: null,
      ip: ip(),
    });
    expect(res.status).toBe(422);
    if (res.status !== 422) throw new Error();
    expect(res.body.errors).toEqual({
      [f.questionIds[0]]: "required",
      [f.questionIds[1]]: "invalid_option",
      [f.questionIds[2]]: "out_of_range",
    });
    expect(await responsesOf(f.id)).toEqual([]);
  });

  it("rejects malformed payloads", async () => {
    const f = await publicForm();
    for (const body of [null, "x", { answers: "nope" }, { answers: {}, name: 5 }]) {
      const res = await submitPublicResponse(db(), { slug: f.slug, body, user: null, ip: ip() });
      expect(res.status).toBe(400);
    }
  });

  it("refuses closed and unknown forms", async () => {
    const closed = await publicForm({ status: "closed" });
    expect((await submitPublicResponse(db(), { slug: closed.slug, body: { answers: closed.answers }, user: null, ip: ip() })).status).toBe(409);
    expect((await submitPublicResponse(db(), { slug: "unknownSlug1", body: { answers: {} }, user: null, ip: ip() })).status).toBe(404);
  });

  it("requires sign-in when the form does, and records the Google identity, not the payload", async () => {
    const f = await publicForm({}, { requires_login: true, limit_one_response: false });
    const anon = await submitPublicResponse(db(), { slug: f.slug, body: { answers: f.answers }, user: null, ip: ip() });
    expect(anon).toEqual({ status: 401, body: { ok: false, error: "needs_login" } });

    await submitPublicResponse(db(), { slug: f.slug, body: { answers: f.answers, name: "Fake Name" }, user: asUser(), ip: ip() });
    await submitPublicResponse(db(), { slug: f.slug, body: { answers: f.answers }, user: asUser(), ip: ip() });
    const rows = await responsesOf(f.id);
    expect(rows).toHaveLength(2); // no one-response limit on this form
    expect(rows[0]).toMatchObject({ respondent_id: respondent.id, respondent_email: respondent.email, respondent_name: "Test Respondent", dedupe_key: null });
  });

  it("one response per person holds under a concurrent double submit", async () => {
    const f = await publicForm({}, { requires_login: true, limit_one_response: true });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => submitPublicResponse(db(), { slug: f.slug, body: { answers: f.answers }, user: asUser(), ip: ip() })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409 && r.body.ok === false && r.body.error === "already")).toHaveLength(3);
    expect(await responsesOf(f.id)).toHaveLength(1);
  });

  it("honeypot: bots get a success response but nothing is stored", async () => {
    const f = await publicForm();
    const res = await submitPublicResponse(db(), { slug: f.slug, body: { answers: f.answers, website: "http://spam" }, user: null, ip: ip() });
    expect(res.status).toBe(200);
    expect(await responsesOf(f.id)).toEqual([]);
  });

  it("rate limits per IP and form", async () => {
    const f = await publicForm();
    const sameIp = ip();
    for (let i = 0; i < RATE_LIMIT.hits; i++) {
      const res = await submitPublicResponse(db(), { slug: f.slug, body: "bad", user: null, ip: sameIp });
      expect(res.status).toBe(400);
    }
    const limited = await submitPublicResponse(db(), { slug: f.slug, body: { answers: f.answers }, user: null, ip: sameIp });
    expect(limited.status).toBe(429);
    // Another IP is unaffected.
    expect((await submitPublicResponse(db(), { slug: f.slug, body: { answers: f.answers }, user: null, ip: ip() })).status).toBe(200);
  });

  it("answering a form never changes the respondent's role", async () => {
    const { data } = await db().from("profiles").select("role").eq("id", respondent.id).single();
    expect(data?.role).toBe("respondent");
  });
});
