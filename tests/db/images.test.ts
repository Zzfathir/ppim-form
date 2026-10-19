/**
 * Images in forms (owner revision): image blocks and images on questions,
 * stored in questions.settings and uploaded into the form's (or template's) folder.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/database.types";
import { submitPublicResponse } from "@/lib/public-form/service";
import { assertLocalDatabase, cleanupUsers, createTestUser, firstDepartments, serviceClient, setProfile, type TestUser } from "../helpers/db";
import { createForm, firstCategory } from "../helpers/forms";

let d1: string, category: string;
let author: TestUser, colleague: TestUser;

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 167, 75, 120, 230, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
const OTHER_FOLDER = "11111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  assertLocalDatabase();
  [{ id: d1 }] = await firstDepartments(1);
  category = await firstCategory();
  [author, colleague] = await Promise.all(["t-img-author", "t-img-colleague"].map((l) => createTestUser(l)));
  await Promise.all([
    setProfile(author.id, { role: "admin", status: "active", department_id: d1, full_name: "Image Author" }),
    setProfile(colleague.id, { role: "admin", status: "active", department_id: d1, full_name: "Image Colleague" }),
  ]);
});
afterAll(cleanupUsers);

function formPayload() {
  return {
    title: "Images",
    description: null,
    department_id: d1,
    category_id: category,
    chapter_id: null,
    requires_login: false,
    limit_one_response: true,
    collect_name: false,
    name_required: false,
    confirmation_message: null,
    banner_path: null,
    banner_style: "edge",
  };
}

const question = (over: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  type: "short_text",
  title: "Q",
  description: null,
  required: false,
  options: null,
  settings: {},
  ...over,
});

describe("autosave", () => {
  it("accepts images in the form's own folder and paths it already uses; refuses other folders", async () => {
    const form = await createForm({ owner: author.id, department: d1, category, status: "draft", questions: [] });
    const own = `${form.id}/a.webp`;
    const save = (questions: unknown[]) =>
      author.client.rpc("save_form", { p_form_id: form.id, p_form: formPayload() as Json, p_questions: questions as NonNullable<Json> });

    const block = question({ type: "image", title: "", settings: { image_path: own, image_alt: "Poster" } });
    const asked = question({ type: "single_choice", options: ["A", "B"], settings: { image_path: own } });
    expect((await save([block, asked])).error).toBeNull();

    // A duplicated question (new id) may reuse an image the form already has.
    expect((await save([block, asked, { ...asked, id: crypto.randomUUID() }])).error).toBeNull();

    const foreign = await save([block, question({ settings: { image_path: `${OTHER_FOLDER}/b.webp` } })]);
    expect(foreign.error?.message).toBe("invalid_image");

    const { data } = await serviceClient().from("questions").select("type, settings").eq("form_id", form.id).order("position");
    expect(data?.[0]).toEqual({ type: "image", settings: { image_path: own, image_alt: "Poster" } });
  });

  it("the database refuses malformed image paths however they are written", async () => {
    const form = await createForm({ owner: author.id, department: d1, category, status: "draft", questions: [] });
    const { error } = await author.client
      .from("questions")
      .insert({ form_id: form.id, position: 0, type: "short_text", title: "Q", settings: { image_path: "../../secret.png" } });
    expect(error).not.toBeNull();
  });

  it("duplicates keep their images", async () => {
    const form = await createForm({
      owner: author.id,
      department: d1,
      category,
      status: "open",
      questions: [{ type: "image", title: "Map", settings: { image_path: `${OTHER_FOLDER}/map.webp` } }],
    });
    const { data: copyId, error } = await colleague.client.rpc("duplicate_form", { p_form_id: form.id });
    expect(error).toBeNull();
    const { data } = await serviceClient().from("questions").select("type, title, settings").eq("form_id", copyId!);
    expect(data).toEqual([{ type: "image", title: "Map", settings: { image_path: `${OTHER_FOLDER}/map.webp` } }]);
  });
});

describe("publishing and responses", () => {
  it("an image block needs a picture, and images alone are not questions", async () => {
    const form = await createForm({
      owner: author.id,
      department: d1,
      category,
      status: "draft",
      questions: [{ type: "image", title: "No picture yet" }],
    });
    const { data: problems } = await author.client.rpc("publish_check", { p_form_id: form.id });
    expect(problems).toEqual(["no_questions", "image_missing"]);

    const ok = await createForm({
      owner: author.id,
      department: d1,
      category,
      status: "draft",
      questions: [
        { type: "image", title: "", settings: { image_path: `${OTHER_FOLDER}/x.webp` } },
        { type: "short_text", title: "Name" },
      ],
    });
    expect((await author.client.rpc("publish_check", { p_form_id: ok.id })).data).toEqual([]);
  });

  it("respondents never answer image blocks; the summary leaves them out", async () => {
    const form = await createForm({
      owner: author.id,
      department: d1,
      category,
      status: "open",
      questions: [
        { type: "image", title: "Look", required: true, settings: { image_path: `${OTHER_FOLDER}/x.webp` } },
        { type: "single_choice", title: "Which?", options: ["A", "B"], required: true, settings: { image_path: `${OTHER_FOLDER}/y.webp` } },
      ],
    });
    const [imageId, choiceId] = form.questionIds;
    const { data } = await serviceClient().from("forms").select("share_slug").eq("id", form.id).single();
    const res = await submitPublicResponse(serviceClient(), {
      slug: data!.share_slug,
      body: { answers: { [imageId]: "sneaky", [choiceId]: "B" } },
      user: null,
      ip: `img-${Date.now()}`,
    });
    expect(res.status).toBe(200);
    const { data: rows } = await serviceClient().from("responses").select("answers").eq("form_id", form.id);
    expect(rows).toEqual([{ answers: { [choiceId]: "B" } }]);

    const { data: summary } = await author.client.rpc("form_summary", { p_form_id: form.id });
    const ids = ((summary as { questions: { question_id: string }[] }).questions ?? []).map((q) => q.question_id);
    expect(ids).toEqual([choiceId]);
  });
});

describe("templates", () => {
  async function newTemplate(user: TestUser, questions: unknown[] = []) {
    const { data, error } = await user.client
      .from("templates")
      .insert({ title: `Img ${Math.random().toString(36).slice(2, 7)}`, questions: questions as NonNullable<Json> })
      .select("id")
      .single();
    if (error) throw error;
    return data!.id;
  }

  it("only the template's editor can upload into its folder", async () => {
    const id = await newTemplate(author);
    const own = await author.client.storage.from("form-banners").upload(`${id}/t-${Date.now()}.png`, png, { contentType: "image/png" });
    expect(own.error).toBeNull();
    const peer = await colleague.client.storage.from("form-banners").upload(`${id}/peer.png`, png, { contentType: "image/png" });
    expect(peer.error).not.toBeNull();
  });

  it("edits may only add images from the template's own folder; copies keep their source's images", async () => {
    const id = await newTemplate(author);
    const withImage = (path: string) => [{ type: "image", title: "", required: false, settings: { image_path: path } }];

    const ownSave = await author.client.from("templates").update({ questions: withImage(`${id}/a.webp`) as NonNullable<Json> }).eq("id", id);
    expect(ownSave.error).toBeNull();
    const foreign = await author.client.from("templates").update({ questions: withImage(`${OTHER_FOLDER}/b.webp`) as NonNullable<Json> }).eq("id", id);
    expect(foreign.error?.message).toBe("invalid_image");
    const malformed = await author.client.from("templates").update({ questions: withImage("x/../b.webp") as NonNullable<Json> }).eq("id", id);
    expect(malformed.error?.message).toBe("invalid_image");

    // "Make a copy" / "Save as template" insert the source's questions as they are.
    const copy = await newTemplate(colleague, withImage(`${id}/a.webp`));
    const keep = await colleague.client
      .from("templates")
      .update({ title: "Renamed", questions: withImage(`${id}/a.webp`) as NonNullable<Json> })
      .eq("id", copy)
      .select("id");
    expect(keep.error).toBeNull();
    expect(keep.data).toHaveLength(1);
  });
});
