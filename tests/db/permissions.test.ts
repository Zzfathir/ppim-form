/**
 * Authorization rules from build prompt §5, tested against the real database
 * (RLS + triggers) using signed-in clients for each role.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  assertLocalDatabase,
  cleanupUsers,
  createTestUser,
  firstDepartments,
  serviceClient,
  setProfile,
  type TestUser,
} from "../helpers/db";
import { addResponse, createForm, firstCategory } from "../helpers/forms";

let d1: string, d2: string, category: string;
let owner: TestUser, peer: TestUser, outsider: TestUser, pending: TestUser, suspended: TestUser;
let respondent: TestUser, superadmin: TestUser;
let formA: { id: string; questionIds: string[] }; // owner's open form in d1, with responses
let formB: { id: string; questionIds: string[] }; // outsider's open form in d2

beforeAll(async () => {
  assertLocalDatabase();
  [{ id: d1 }, { id: d2 }] = await firstDepartments(2);
  category = await firstCategory();

  [owner, peer, outsider, pending, suspended, respondent, superadmin] = await Promise.all(
    ["owner", "peer", "outsider", "pending", "suspended", "respondent", "super"].map((l) => createTestUser(l)),
  );
  await Promise.all([
    setProfile(owner.id, { role: "admin", status: "active", department_id: d1 }),
    setProfile(peer.id, { role: "admin", status: "active", department_id: d1 }),
    setProfile(outsider.id, { role: "admin", status: "active", department_id: d2 }),
    setProfile(pending.id, { role: "admin", status: "pending", department_id: d1 }),
    setProfile(suspended.id, { role: "admin", status: "suspended", department_id: d1 }),
    setProfile(superadmin.id, { role: "superadmin", status: "active", department_id: d2 }),
  ]);

  formA = await createForm({ owner: owner.id, department: d1, category, status: "open" });
  formB = await createForm({ owner: outsider.id, department: d2, category, status: "open" });
  await addResponse(formA.id, { [formA.questionIds[0]]: "Hello", [formA.questionIds[1]]: "Yes" });
  await addResponse(formA.id, { [formA.questionIds[0]]: "World", [formA.questionIds[1]]: "No" });
  await addResponse(formB.id, { [formB.questionIds[0]]: "Secret" });
});

afterAll(cleanupUsers);

describe("pending admin", () => {
  it("can create and edit a draft", async () => {
    const { data: form, error } = await pending.client
      .from("forms")
      .insert({ owner_id: pending.id, department_id: d1, category_id: category, title: "Draft by pending" })
      .select("id, status")
      .single();
    expect(error).toBeNull();
    expect(form?.status).toBe("draft");

    const q = await pending.client
      .from("questions")
      .insert({ form_id: form!.id, position: 0, type: "short_text", title: "Name" })
      .select("id");
    expect(q.error).toBeNull();
    const upd = await pending.client.from("forms").update({ title: "Renamed" }).eq("id", form!.id).select("title");
    expect(upd.data?.[0]?.title).toBe("Renamed");
  });

  it("cannot publish (rejected by the server)", async () => {
    const form = await createForm({ owner: pending.id, department: d1, category, status: "draft" });
    const { data, error } = await pending.client.from("forms").update({ status: "open" }).eq("id", form.id).select();
    expect(data ?? []).toEqual([]);
    expect(error?.message).toBe("publish_requires_active_account");
  });

  it("even a superadmin cannot publish a form whose owner is not active", async () => {
    const form = await createForm({ owner: pending.id, department: d1, category, status: "draft" });
    const { error } = await superadmin.client.from("forms").update({ status: "open" }).eq("id", form.id);
    expect(error?.message).toBe("publish_blocked");
    expect(error?.details).toContain("owner_not_active");
  });
});

describe("suspended admin", () => {
  it("cannot create or edit forms", async () => {
    const ins = await suspended.client
      .from("forms")
      .insert({ owner_id: suspended.id, title: "Nope" })
      .select("id");
    expect(ins.error).not.toBeNull();

    const own = await createForm({ owner: suspended.id, department: d1, category, status: "draft" });
    const upd = await suspended.client.from("forms").update({ title: "X" }).eq("id", own.id).select();
    expect(upd.data ?? []).toEqual([]);
  });
});

describe("other departments are invisible to admins", () => {
  it("cannot read forms, questions, responses or stats of another department", async () => {
    const forms = await owner.client.from("forms").select("id").eq("id", formB.id);
    const questions = await owner.client.from("questions").select("id").eq("form_id", formB.id);
    const responses = await owner.client.from("responses").select("id").eq("form_id", formB.id);
    const stats = await owner.client.from("form_stats").select("*").eq("form_id", formB.id);
    expect(forms.data).toEqual([]);
    expect(questions.data).toEqual([]);
    expect(responses.data).toEqual([]);
    expect(stats.data).toEqual([]);
  });

  it("cannot modify or duplicate another department's form", async () => {
    const upd = await owner.client.from("forms").update({ status: "closed" }).eq("id", formB.id).select();
    expect(upd.data ?? []).toEqual([]);
    const dup = await owner.client.rpc("duplicate_form", { p_form_id: formB.id });
    expect(dup.error?.message).toBe("form_not_found");
    const check = await owner.client.rpc("publish_check", { p_form_id: formB.id });
    expect(check.data).toBeNull();
  });
});

describe("same-department admin is read-only", () => {
  it("can read the form, its questions, responses and stats", async () => {
    const forms = await peer.client.from("forms").select("id").eq("id", formA.id);
    const questions = await peer.client.from("questions").select("id").eq("form_id", formA.id);
    const responses = await peer.client.from("responses").select("id").eq("form_id", formA.id);
    const stats = await peer.client.from("form_stats").select("response_count").eq("form_id", formA.id).single();
    expect(forms.data).toHaveLength(1);
    expect(questions.data).toHaveLength(2);
    expect(responses.data).toHaveLength(2);
    expect(stats.data?.response_count).toBe(2);
  });

  it("cannot edit, publish, close or delete it", async () => {
    const svc = serviceClient();
    const before = await svc.from("forms").select("title, status, deleted_at").eq("id", formA.id).single();

    await peer.client.from("forms").update({ title: "Hijacked" }).eq("id", formA.id);
    await peer.client.from("forms").update({ status: "closed" }).eq("id", formA.id);
    await peer.client.from("forms").update({ deleted_at: new Date().toISOString() }).eq("id", formA.id);
    const peerDelete = await peer.client.rpc("soft_delete_form", { p_form_id: formA.id });
    expect(peerDelete.error?.message).toBe("form_not_found");
    await peer.client.from("questions").update({ title: "Hijacked" }).eq("form_id", formA.id);
    await peer.client.from("questions").delete().eq("form_id", formA.id);
    const qIns = await peer.client.from("questions").insert({ form_id: formA.id, position: 9, type: "date", title: "x" });
    await peer.client.from("responses").delete().eq("form_id", formA.id);

    const after = await svc.from("forms").select("title, status, deleted_at").eq("id", formA.id).single();
    expect(after.data).toEqual(before.data);
    expect(qIns.error).not.toBeNull();
    const qs = await svc.from("questions").select("title").eq("form_id", formA.id);
    expect(qs.data?.map((q) => q.title)).not.toContain("Hijacked");
    expect(qs.data).toHaveLength(2);
    const rs = await svc.from("responses").select("id").eq("form_id", formA.id);
    expect(rs.data).toHaveLength(2);
  });

  it("can duplicate it into a new draft they own", async () => {
    const { data: newId, error } = await peer.client.rpc("duplicate_form", { p_form_id: formA.id });
    expect(error).toBeNull();
    const copy = await peer.client.from("forms").select("*").eq("id", newId!).single();
    const src = await serviceClient().from("forms").select("share_slug, title").eq("id", formA.id).single();
    expect(copy.data).toMatchObject({ owner_id: peer.id, status: "draft", department_id: d1, title: `Copy of ${src.data!.title}` });
    expect(copy.data!.share_slug).not.toBe(src.data!.share_slug);
    const qs = await peer.client.from("questions").select("title, position").eq("form_id", newId!).order("position");
    expect(qs.data?.map((q) => q.position)).toEqual([0, 1]);
    // The copy is independent: editing it does not touch the source.
    await peer.client.from("questions").update({ title: "Changed in copy" }).eq("form_id", newId!);
    const srcQs = await serviceClient().from("questions").select("title").eq("form_id", formA.id);
    expect(srcQs.data?.map((q) => q.title)).not.toContain("Changed in copy");
  });
});

describe("respondent", () => {
  it("cannot read any forms, questions, responses, stats or activity", async () => {
    for (const table of ["forms", "questions", "responses", "activity_log"] as const) {
      const { data } = await respondent.client.from(table).select("id").limit(5);
      expect(data ?? [], table).toEqual([]);
    }
    const stats = await respondent.client.from("form_stats").select("form_id").limit(5);
    expect(stats.data ?? []).toEqual([]);
  });

  it("cannot create forms", async () => {
    const { error } = await respondent.client.from("forms").insert({ owner_id: respondent.id, title: "x" });
    expect(error).not.toBeNull();
  });

  it("can read published templates only", async () => {
    const svc = serviceClient();
    const hidden = await svc.from("templates").insert({ title: "Hidden", is_published: false }).select("id").single();
    const { data } = await respondent.client.from("templates").select("id, is_published");
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((t) => t.is_published)).toBe(true);
    const write = await respondent.client.from("templates").insert({ title: "Mine" }).select();
    expect(write.error).not.toBeNull();
    await svc.from("templates").delete().eq("id", hidden.data!.id);
  });
});

describe("anonymous clients", () => {
  it("cannot read or write forms, questions, responses or templates", async () => {
    const anon = anonClient();
    for (const table of ["forms", "questions", "responses", "templates"] as const) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? [], table).toEqual([]);
    }
    const stats = await anon.from("form_stats").select("*").limit(1);
    expect(stats.data ?? []).toEqual([]);
    const ins = await anon.from("responses").insert({ form_id: formA.id, answers: {} });
    expect(ins.error).not.toBeNull();
  });
});

describe("superadmin", () => {
  it("can read every form and response, including other departments", async () => {
    const forms = await superadmin.client.from("forms").select("id").in("id", [formA.id, formB.id]);
    const responses = await superadmin.client.from("responses").select("answers").eq("form_id", formB.id);
    expect(forms.data).toHaveLength(2);
    expect(responses.data?.[0]?.answers).toEqual({ [formB.questionIds[0]]: "Secret" });
  });

  it("can close any form, transfer its owner and retag it; each is logged", async () => {
    const form = await createForm({ owner: outsider.id, department: d2, category, status: "open" });
    const close = await superadmin.client.from("forms").update({ status: "closed" }).eq("id", form.id).select("status, closed_at");
    expect(close.data?.[0]).toMatchObject({ status: "closed" });
    expect(close.data?.[0]?.closed_at).not.toBeNull();

    const transfer = await superadmin.client.from("forms").update({ owner_id: owner.id, department_id: d1 }).eq("id", form.id).select("owner_id");
    expect(transfer.data?.[0]?.owner_id).toBe(owner.id);

    const { data: log } = await superadmin.client.from("activity_log").select("action, actor_id").eq("entity_id", form.id);
    const actions = log!.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["form_closed", "form_transferred", "form_retagged"]));
    expect(log!.find((l) => l.action === "form_closed")?.actor_id).toBe(superadmin.id);
  });

  it("sees soft-deleted forms; their owner no longer does", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category, status: "draft" });
    const del = await owner.client.rpc("soft_delete_form", { p_form_id: form.id });
    expect(del.error).toBeNull();
    expect((await owner.client.from("forms").select("id").eq("id", form.id)).data).toEqual([]);
    expect((await superadmin.client.from("forms").select("id").eq("id", form.id)).data).toHaveLength(1);
  });

  it("approval and suspension of admins are logged with the superadmin as actor", async () => {
    const candidate = await createTestUser("candidate");
    await setProfile(candidate.id, { role: "admin", status: "pending", department_id: d1 });
    await superadmin.client.from("profiles").update({ status: "active" }).eq("id", candidate.id);
    await superadmin.client.from("profiles").update({ status: "suspended" }).eq("id", candidate.id);
    await superadmin.client.from("profiles").update({ role: "superadmin" }).eq("id", candidate.id);
    const { data } = await superadmin.client.from("activity_log").select("action, actor_id").eq("entity_id", candidate.id);
    expect(data!.map((l) => l.action)).toEqual(expect.arrayContaining(["admin_approved", "admin_suspended", "superadmin_promoted"]));
    expect(data!.every((l) => l.actor_id === superadmin.id)).toBe(true);
  });
});

describe("form rules for owners", () => {
  it("publishing validates the form and reports every problem", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category: null, status: "draft", questions: [] });
    const check = await owner.client.rpc("publish_check", { p_form_id: form.id });
    expect(check.data).toEqual(["category_required", "no_questions"]);

    await owner.client.from("questions").insert([
      { form_id: form.id, position: 0, type: "short_text", title: "  " },
      { form_id: form.id, position: 1, type: "dropdown", title: "Pick", options: ["Only one"] },
    ]);
    const blocked = await owner.client.from("forms").update({ status: "open", category_id: category }).eq("id", form.id);
    expect(blocked.error?.message).toBe("publish_blocked");
    expect(blocked.error?.details).toBe("question_untitled,choice_needs_options");

    await owner.client.from("questions").update({ title: "Name" }).eq("form_id", form.id).eq("position", 0);
    await owner.client.from("questions").update({ options: ["A", "B"] }).eq("form_id", form.id).eq("position", 1);
    const ok = await owner.client.from("forms").update({ status: "open", category_id: category }).eq("id", form.id).select("status, published_at");
    expect(ok.error).toBeNull();
    expect(ok.data?.[0]?.status).toBe("open");
    expect(ok.data?.[0]?.published_at).not.toBeNull();
  });

  it("a form without a chapter publishes fine", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category, status: "draft" });
    const { error } = await owner.client.from("forms").update({ status: "open", chapter_id: null }).eq("id", form.id);
    expect(error).toBeNull();
  });

  it("only allows the documented status transitions", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category, status: "draft" });
    const bad = await owner.client.from("forms").update({ status: "closed" }).eq("id", form.id);
    expect(bad.error?.message).toBe("invalid_status_transition");
    for (const status of ["open", "closed", "open", "closed", "archived", "closed"] as const) {
      const step = await owner.client.from("forms").update({ status }).eq("id", form.id);
      expect(step.error, status).toBeNull();
    }
  });

  it("cannot transfer ownership, change the slug or create a non-draft form", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category, status: "draft" });
    const transfer = await owner.client.from("forms").update({ owner_id: peer.id }).eq("id", form.id);
    expect(transfer.error).not.toBeNull();

    const before = await serviceClient().from("forms").select("share_slug").eq("id", form.id).single();
    await owner.client.from("forms").update({ share_slug: "chosen-slug" }).eq("id", form.id);
    const after = await serviceClient().from("forms").select("share_slug").eq("id", form.id).single();
    expect(after.data!.share_slug).toBe(before.data!.share_slug);

    const direct = await owner.client
      .from("forms")
      .insert({ owner_id: owner.id, department_id: d1, category_id: category, status: "open" });
    expect(direct.error?.message).toBe("new_forms_are_drafts");
  });

  it("share slugs are random, 10 chars and URL-safe", async () => {
    const forms = await Promise.all(
      Array.from({ length: 5 }, () => createForm({ owner: owner.id, department: d1, category, status: "draft", title: "Same title" })),
    );
    const { data } = await serviceClient().from("forms").select("share_slug").in("id", forms.map((f) => f.id));
    const slugs = data!.map((f) => f.share_slug);
    expect(new Set(slugs).size).toBe(5);
    for (const slug of slugs) expect(slug).toMatch(/^[A-Za-z0-9]{10}$/);
  });

  it("deleting an answered question is a soft delete; unanswered questions are removed", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category, status: "open" });
    const [answered, unanswered] = form.questionIds;
    await addResponse(form.id, { [answered]: "kept" });

    await owner.client.from("questions").delete().eq("id", answered);
    await owner.client.from("questions").delete().eq("id", unanswered);
    const { data } = await serviceClient().from("questions").select("id, is_deleted").eq("form_id", form.id);
    expect(data).toEqual([{ id: answered, is_deleted: true }]);
  });

  it("an answered question cannot change type", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category, status: "open" });
    await addResponse(form.id, { [form.questionIds[0]]: "text" });
    const { error } = await owner.client.from("questions").update({ type: "date" }).eq("id", form.questionIds[0]);
    expect(error?.message).toBe("answered_question_type_locked");
  });
});

describe("responses", () => {
  it("one response per person is enforced by the database", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category, status: "open" });
    const svc = serviceClient();
    const row = { form_id: form.id, answers: {}, respondent_id: respondent.id, dedupe_key: respondent.id };
    const [a, b] = await Promise.all([svc.from("responses").insert(row), svc.from("responses").insert(row)]);
    const errors = [a.error, b.error].filter(Boolean);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("23505");
  });

  it("response counts come from the responses table", async () => {
    const form = await createForm({ owner: owner.id, department: d1, category, status: "open" });
    for (let i = 0; i < 3; i++) await addResponse(form.id, { [form.questionIds[0]]: `r${i}` });
    const { data } = await owner.client.from("form_stats").select("response_count, last_response_at").eq("form_id", form.id).single();
    expect(data?.response_count).toBe(3);
    expect(data?.last_response_at).not.toBeNull();
  });
});

describe("activity log for admins", () => {
  it("admins can read their department's form activity but not other departments'", async () => {
    const own = await peer.client.from("activity_log").select("action").eq("entity_id", formA.id);
    expect(own.data!.map((l) => l.action)).toContain("form_created");
    const other = await owner.client.from("activity_log").select("action").eq("entity_id", formB.id);
    expect(other.data).toEqual([]);
  });
});
