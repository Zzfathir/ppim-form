/**
 * Owner revision round: department templates + sharing, banner uploads,
 * and "name is required" on anonymous forms.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/database.types";
import { submitPublicResponse } from "@/lib/public-form/service";
import { assertLocalDatabase, cleanupUsers, createTestUser, firstDepartments, serviceClient, setProfile, type TestUser } from "../helpers/db";
import { createForm, firstCategory } from "../helpers/forms";

let d1: string, d2: string, d3: string, category: string;
let author: TestUser, colleague: TestUser, outsider: TestUser, outsider2: TestUser, sa: TestUser, respondent: TestUser;

beforeAll(async () => {
  assertLocalDatabase();
  [{ id: d1 }, { id: d2 }, { id: d3 }] = await firstDepartments(3);
  category = await firstCategory();
  [author, colleague, outsider, outsider2, sa, respondent] = await Promise.all(
    ["t-author", "t-colleague", "t-outsider", "t-outsider2", "t-sa", "t-resp"].map((l) => createTestUser(l)),
  );
  await Promise.all([
    setProfile(author.id, { role: "admin", status: "active", department_id: d1, full_name: "Author" }),
    setProfile(colleague.id, { role: "admin", status: "active", department_id: d1, full_name: "Colleague" }),
    setProfile(outsider.id, { role: "admin", status: "active", department_id: d2, full_name: "Outsider" }),
    setProfile(outsider2.id, { role: "admin", status: "active", department_id: d3, full_name: "Outsider Two" }),
    setProfile(sa.id, { role: "superadmin", status: "active", department_id: d3 }),
  ]);
});
afterAll(cleanupUsers);

async function newTemplate(user: TestUser, extra: Record<string, unknown> = {}) {
  const { data, error } = await user.client
    .from("templates")
    .insert({ title: `T ${Math.random().toString(36).slice(2, 7)}`, questions: [], ...extra })
    .select("id, created_by, department_id, is_official, is_published")
    .single();
  if (error) throw error;
  return data!;
}
const sees = async (user: TestUser, id: string) => ((await user.client.from("templates").select("id").eq("id", id)).data ?? []).length === 1;

describe("department templates", () => {
  it("any admin can create one; the database sets owner and department and refuses 'official'", async () => {
    const t = await newTemplate(author, { is_official: true, department_id: d2, created_by: outsider.id });
    expect(t).toMatchObject({ created_by: author.id, department_id: d1, is_official: false });
  });

  it("is visible to its department, hidden from other departments and respondents", async () => {
    const t = await newTemplate(author);
    expect(await sees(colleague, t.id)).toBe(true);
    expect(await sees(outsider, t.id)).toBe(false);
    expect(await sees(respondent, t.id)).toBe(false);
    expect(await sees(sa, t.id)).toBe(true);
  });

  it("only the creator (or a superadmin) can edit, delete or share it", async () => {
    const t = await newTemplate(author);
    const peerEdit = await colleague.client.from("templates").update({ title: "Hijacked" }).eq("id", t.id).select("id");
    expect(peerEdit.data ?? []).toEqual([]);
    const peerDelete = await colleague.client.from("templates").delete().eq("id", t.id).select("id");
    expect(peerDelete.data ?? []).toEqual([]);
    const peerShare = await colleague.client.from("template_shares").insert({ template_id: t.id, department_id: d2, created_by: colleague.id });
    expect(peerShare.error).not.toBeNull();

    const ownEdit = await author.client.from("templates").update({ title: "Renamed" }).eq("id", t.id).select("title");
    expect(ownEdit.data?.[0]?.title).toBe("Renamed");
    const superEdit = await sa.client.from("templates").update({ title: "By SA" }).eq("id", t.id).select("title");
    expect(superEdit.data?.[0]?.title).toBe("By SA");
  });

  it("sharing with a person or a department makes it visible to exactly them; removing a share hides it again", async () => {
    const t = await newTemplate(author);
    const toPerson = await author.client
      .from("template_shares")
      .insert({ template_id: t.id, profile_id: outsider.id, created_by: author.id })
      .select("id")
      .single();
    expect(toPerson.error).toBeNull();
    expect(await sees(outsider, t.id)).toBe(true);
    expect(await sees(outsider2, t.id)).toBe(false);

    await author.client.from("template_shares").insert({ template_id: t.id, department_id: d3, created_by: author.id });
    expect(await sees(outsider2, t.id)).toBe(true);

    // Recipients can use it but not edit it.
    const recipientEdit = await outsider.client.from("templates").update({ title: "x" }).eq("id", t.id).select("id");
    expect(recipientEdit.data ?? []).toEqual([]);
    // Recipients can't see who else it's shared with.
    expect((await outsider.client.from("template_shares").select("id").eq("template_id", t.id)).data).toEqual([]);

    await author.client.from("template_shares").delete().eq("id", toPerson.data!.id);
    expect(await sees(outsider, t.id)).toBe(false);
  });

  it("can't be shared with a respondent", async () => {
    const t = await newTemplate(author);
    const res = await author.client.from("template_shares").insert({ template_id: t.id, profile_id: respondent.id, created_by: author.id });
    expect(res.error).not.toBeNull();
  });

  it("a form can be created from a template only if the template is visible", async () => {
    const t = await newTemplate(author);
    expect((await outsider.client.from("templates").select("title").eq("id", t.id).maybeSingle()).data).toBeNull();
  });
});

describe("official templates", () => {
  it("published ones are visible to every admin, unpublished only to superadmins; only superadmins edit them", async () => {
    const svc = serviceClient();
    const { data: pub } = await sa.client.from("templates").insert({ title: "Official", is_official: true, is_published: true, questions: [] }).select("id, is_official").single();
    const { data: draft } = await sa.client.from("templates").insert({ title: "Official draft", is_official: true, is_published: false, questions: [] }).select("id").single();
    expect(pub?.is_official).toBe(true);
    expect(await sees(outsider, pub!.id)).toBe(true);
    expect(await sees(outsider, draft!.id)).toBe(false);

    const adminEdit = await author.client.from("templates").update({ title: "x" }).eq("id", pub!.id).select("id");
    expect(adminEdit.data ?? []).toEqual([]);
    await svc.from("templates").delete().in("id", [pub!.id, draft!.id]);
  });

  it("the starter templates are official", async () => {
    const { data } = await author.client.from("templates").select("title, is_official").eq("title", "Event feedback");
    expect(data?.[0]?.is_official).toBe(true);
  });
});

describe("banners", () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 167, 75, 120, 230, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

  it("only a form's editors can upload into its folder; anyone can view", async () => {
    const form = await createForm({ owner: author.id, department: d1, category, status: "draft" });
    const path = `${form.id}/test-${Date.now()}.png`;
    const own = await author.client.storage.from("form-banners").upload(path, png, { contentType: "image/png" });
    expect(own.error).toBeNull();
    const peer = await colleague.client.storage.from("form-banners").upload(`${form.id}/peer.png`, png, { contentType: "image/png" });
    expect(peer.error).not.toBeNull();
    const elsewhere = await author.client.storage.from("form-banners").upload(`not-a-form/x.png`, png, { contentType: "image/png" });
    expect(elsewhere.error).not.toBeNull();

    const publicUrl = author.client.storage.from("form-banners").getPublicUrl(path).data.publicUrl;
    expect((await fetch(publicUrl)).status).toBe(200);
  });

  it("autosave accepts a banner in the form's own folder, not another form's; duplicates keep the banner", async () => {
    const form = await createForm({ owner: author.id, department: d1, category, status: "draft" });
    const base = {
      title: "Banner form",
      description: null,
      department_id: d1,
      category_id: category,
      chapter_id: null,
      requires_login: false,
      limit_one_response: true,
      collect_name: false,
      name_required: false,
      confirmation_message: null,
      banner_style: "overlay",
    };
    const ok = await author.client.rpc("save_form", { p_form_id: form.id, p_form: { ...base, banner_path: `${form.id}/a.webp` } as Json, p_questions: [] });
    expect(ok.error).toBeNull();
    const other = await author.client.rpc("save_form", {
      p_form_id: form.id,
      p_form: { ...base, banner_path: "11111111-1111-4111-8111-111111111111/b.webp" } as Json,
      p_questions: [],
    });
    expect(other.error?.message).toBe("invalid_banner");

    const { data: copyId } = await colleague.client.rpc("duplicate_form", { p_form_id: form.id });
    const { data: copy } = await serviceClient().from("forms").select("banner_path, banner_style").eq("id", copyId!).single();
    expect(copy).toEqual({ banner_path: `${form.id}/a.webp`, banner_style: "overlay" });
  });
});

describe("name is required", () => {
  it("anonymous forms with a required name reject submissions without one", async () => {
    const form = await createForm({
      owner: author.id,
      department: d1,
      category,
      status: "open",
      questions: [{ type: "short_text", title: "Q" }],
    });
    await serviceClient().from("forms").update({ collect_name: true, name_required: true }).eq("id", form.id);
    const { data } = await serviceClient().from("forms").select("share_slug").eq("id", form.id).single();
    const ip = `name-${Date.now()}`;

    const missing = await submitPublicResponse(serviceClient(), { slug: data!.share_slug, body: { answers: {}, name: "  " }, user: null, ip });
    expect(missing.status).toBe(422);
    if (missing.status !== 422) throw new Error();
    expect(missing.body.errors).toEqual({ respondent_name: "required" });

    const ok = await submitPublicResponse(serviceClient(), { slug: data!.share_slug, body: { answers: {}, name: "Siti" }, user: null, ip });
    expect(ok.status).toBe(200);
    const { data: rows } = await serviceClient().from("responses").select("respondent_name").eq("form_id", form.id);
    expect(rows).toEqual([{ respondent_name: "Siti" }]);
  });
});
