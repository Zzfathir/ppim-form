/** The builder's autosave RPC, run as real users through RLS. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/database.types";
import {
  assertLocalDatabase,
  cleanupUsers,
  createTestUser,
  firstDepartments,
  serviceClient,
  setProfile,
  type TestUser,
} from "../helpers/db";
import { addResponse, createForm, firstCategory } from "../helpers/forms";

let d1: string, category: string;
let owner: TestUser, peer: TestUser, superadmin: TestUser;

const baseForm = () => ({
  title: "Saved title",
  description: "Desc",
  department_id: d1,
  category_id: category,
  chapter_id: null,
  requires_login: true,
  limit_one_response: false,
  collect_name: false,
  confirmation_message: "Thanks!",
});

const question = (over: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  type: "short_text",
  title: "Q",
  description: null,
  required: false,
  options: null,
  settings: {},
  ...over,
});

beforeAll(async () => {
  assertLocalDatabase();
  [{ id: d1 }] = await firstDepartments(1);
  category = await firstCategory();
  [owner, peer, superadmin] = await Promise.all(["b-owner", "b-peer", "b-super"].map((l) => createTestUser(l)));
  await Promise.all([
    setProfile(owner.id, { role: "admin", status: "active", department_id: d1 }),
    setProfile(peer.id, { role: "admin", status: "active", department_id: d1 }),
    setProfile(superadmin.id, { role: "superadmin", status: "active" }),
  ]);
});
afterAll(cleanupUsers);

async function questionsOf(formId: string) {
  const { data } = await serviceClient()
    .from("questions")
    .select("id, position, title, type, options, settings, is_deleted")
    .eq("form_id", formId)
    .order("position");
  return data!;
}

describe("save_form", () => {
  it("saves form fields and the full ordered question list atomically", async () => {
    const form = await createForm({ owner: owner.id, department: null, category: null, status: "draft" });
    const [keep] = form.questionIds;
    const added = question({ title: "New", type: "dropdown", options: ["A", "B"] });

    const { error } = await owner.client.rpc("save_form", {
      p_form_id: form.id,
      p_form: baseForm(),
      p_questions: [added, { ...question({ title: "Renamed" }), id: keep }] as unknown as Json,
    });
    expect(error).toBeNull();

    const { data: saved } = await serviceClient().from("forms").select("*").eq("id", form.id).single();
    expect(saved).toMatchObject({ title: "Saved title", department_id: d1, requires_login: true, confirmation_message: "Thanks!" });
    const qs = await questionsOf(form.id);
    expect(qs.map((q) => [q.position, q.title])).toEqual([
      [0, "New"],
      [1, "Renamed"],
    ]);
    expect(qs[0].options).toEqual(["A", "B"]);
  });

  it("soft-deletes removed questions that already have answers", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category, status: "open" });
    const [answered, unanswered] = form.questionIds;
    await addResponse(form.id, { [answered]: "x" });

    const { error } = await owner.client.rpc("save_form", { p_form_id: form.id, p_form: baseForm(), p_questions: [] });
    expect(error).toBeNull();
    const qs = await questionsOf(form.id);
    expect(qs.map((q) => [q.id, q.is_deleted])).toEqual([[answered, true]]);
    expect(qs.find((q) => q.id === unanswered)).toBeUndefined();

    const ids = await owner.client.rpc("answered_question_ids", { p_form_id: form.id });
    expect(ids.data).toEqual([answered]);
  });

  it("refuses to change the type of an answered question", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category, status: "open" });
    const [answered] = form.questionIds;
    await addResponse(form.id, { [answered]: "x" });
    const { error } = await owner.client.rpc("save_form", {
      p_form_id: form.id,
      p_form: baseForm(),
      p_questions: [{ ...question({ type: "date" }), id: answered }] as unknown as Json,
    });
    expect(error?.message).toBe("answered_question_type_locked");
  });

  it("cannot move another form's question into this form", async () => {
    const mine = await createForm({ owner: owner.id, department: d1, category, status: "draft" });
    const theirs = await createForm({ owner: peer.id, department: d1, category, status: "draft" });
    const stolen = theirs.questionIds[0];
    await owner.client.rpc("save_form", {
      p_form_id: mine.id,
      p_form: baseForm(),
      p_questions: [{ ...question({ title: "Stolen" }), id: stolen }] as unknown as Json,
    });
    const theirQs = await questionsOf(theirs.id);
    expect(theirQs.map((q) => q.title)).not.toContain("Stolen");
    expect(theirQs).toHaveLength(2);
  });

  it("same-department admins cannot save someone else's form; superadmins can", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category, status: "draft" });
    const peerSave = await peer.client.rpc("save_form", { p_form_id: form.id, p_form: { ...baseForm(), title: "Peer" }, p_questions: [] });
    expect(peerSave.error?.message).toBe("form_not_found");
    expect((await questionsOf(form.id)).length).toBe(2);

    const superSave = await superadmin.client.rpc("save_form", {
      p_form_id: form.id,
      p_form: { ...baseForm(), title: "By superadmin" },
      p_questions: [question()] as unknown as Json,
    });
    expect(superSave.error).toBeNull();
    const { data } = await serviceClient().from("forms").select("title").eq("id", form.id).single();
    expect(data?.title).toBe("By superadmin");
  });

  it("cannot clear the department of a published form", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category, status: "open" });
    const { error } = await owner.client.rpc("save_form", {
      p_form_id: form.id,
      p_form: { ...baseForm(), department_id: null },
      p_questions: [question()] as unknown as Json,
    });
    expect(error?.code).toBe("23514"); // tracking_required_to_publish
  });
});
