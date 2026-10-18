import { deflateSync } from "node:zlib";
import { expect, test as base, type Page } from "@playwright/test";
import { assertLocalDatabase, cleanupUsers, firstDepartments, serviceClient, setProfile } from "../helpers/db";
import { createForm, firstCategory } from "../helpers/forms";
import { signInAs } from "./session";

/** Owner revision round: banner, required name, single-sheet form, department templates + sharing. */

const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await use(errors);
      expect(errors, "browser console errors").toEqual([]);
    },
    { auto: true },
  ],
});

let d1: string, d2: string, category: string;
const users: string[] = [];

test.beforeAll(async () => {
  assertLocalDatabase();
  [{ id: d1 }, { id: d2 }] = await firstDepartments(2);
  category = await firstCategory();
});
test.afterAll(async () => {
  await Promise.all(users.map((id) => serviceClient().auth.admin.deleteUser(id)));
  await cleanupUsers();
});

async function admin(page: Page, baseURL: string, label: string, department: string, fullName: string) {
  const user = await signInAs(page.context(), baseURL, label);
  users.push(user.id);
  await setProfile(user.id, { role: "admin", status: "active", department_id: department, full_name: fullName });
  return user;
}

/** A small valid PNG (solid colour), built without image libraries. */
function png(width = 800, height = 200): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0)]);
  for (let x = 0; x < width; x++) row.set([200, 6, 9], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("banner upload with style choice, required name, and the single-sheet public form", async ({ page, baseURL, browser }) => {
  await admin(page, baseURL!, "rev-banner", d1, "Banner Owner");
  const form = await createForm({
    owner: users.at(-1)!,
    department: d1,
    category,
    status: "draft",
    title: "Malam Budaya",
    questions: [{ type: "short_text", title: "Faculty", required: true }],
  });
  await page.goto(`/forms/${form.id}`);

  // Banner: upload, resized in the browser, stored, previewed.
  await page.locator('input[type="file"]').setInputFiles({ name: "banner.png", mimeType: "image/png", buffer: png() });
  await expect(page.getByRole("img", { name: "Banner preview" })).toBeVisible();
  await page.getByRole("radio", { name: "Title on banner" }).click();

  // Name is required.
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("switch", { name: "Ask for the respondent's name" }).click();
  await page.getByRole("switch", { name: "Name is required" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

  const { data: saved } = await serviceClient().from("forms").select("banner_path, banner_style, collect_name, name_required, share_slug").eq("id", form.id).single();
  expect(saved).toMatchObject({ banner_style: "overlay", collect_name: true, name_required: true });
  expect(saved!.banner_path).toMatch(new RegExp(`^${form.id}/[0-9a-f-]{36}\\.(webp|jpg)$`));

  await page.getByRole("tab", { name: "Questions" }).click();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("dialog", { name: "Your form is live" })).toBeVisible();

  // Respondent (anonymous, phone width).
  const respondent = await browser.newPage({ viewport: { width: 360, height: 780 } });
  await respondent.goto(`${baseURL}/f/${saved!.share_slug}`);
  const banner = respondent.locator("article img").first();
  await expect(banner).toBeVisible();
  expect(await banner.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(respondent.getByRole("heading", { name: "Malam Budaya" })).toBeVisible();
  await expect(respondent.getByText("01", { exact: true })).toHaveCount(0); // questions are not numbered

  // Empty submit: both the required name and the required question are flagged.
  await respondent.getByRole("button", { name: "Submit" }).click();
  await expect(respondent.getByText("This is a required question")).toHaveCount(2);
  await respondent.getByRole("textbox", { name: "Your name" }).fill("Siti Rahma");
  await respondent.getByRole("textbox", { name: "Faculty" }).fill("Engineering");
  await respondent.getByRole("button", { name: "Submit" }).click();
  await expect(respondent.getByText("Your response has been recorded.")).toBeVisible();
  const { data: rows } = await serviceClient().from("responses").select("respondent_name").eq("form_id", form.id);
  expect(rows).toEqual([{ respondent_name: "Siti Rahma" }]);
  await respondent.close();
});

test("department templates: colleagues see them, other departments only after sharing", async ({ page, baseURL, browser }) => {
  const stamp = Date.now();
  await admin(page, baseURL!, "rev-tpl-author", d1, `Author ${stamp}`);
  const form = await createForm({ owner: users.at(-1)!, department: d1, category, status: "draft", title: `Dept template ${stamp}` });

  // Save a form as my template.
  await page.goto(`/forms/${form.id}`);
  await page.getByRole("button", { name: "Save as template" }).click();
  await page.waitForURL(/\/templates\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("textbox", { name: "Template title" })).toHaveValue(`Dept template ${stamp}`);
  await expect(page.getByRole("switch", { name: "Published" })).toHaveCount(0); // department templates have no publish switch
  const templateUrl = page.url();

  const colleagueCtx = await browser.newContext({ baseURL: baseURL! });
  const colleague = await colleagueCtx.newPage();
  await admin(colleague, baseURL!, "rev-tpl-colleague", d1, `Colleague ${stamp}`);
  await colleague.goto("/templates");
  await expect(colleague.getByRole("region").or(colleague.locator("section")).filter({ hasText: "From my department" }).getByRole("heading", { name: `Dept template ${stamp}` })).toBeVisible();
  // Colleagues can't open the editor.
  await colleague.goto(templateUrl);
  await expect(colleague).toHaveURL(/\/templates$/);

  const outsiderCtx = await browser.newContext({ baseURL: baseURL! });
  const outsider = await outsiderCtx.newPage();
  await admin(outsider, baseURL!, "rev-tpl-outsider", d2, `Outsider ${stamp}`);
  await outsider.goto("/templates");
  await expect(outsider.getByRole("heading", { name: `Dept template ${stamp}` })).toHaveCount(0);

  // Share with the outsider by name.
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox", { name: "Search by name or department" }).fill(`Outsider ${stamp}`);
  await dialog.getByRole("button", { name: `Share with Outsider ${stamp}` }).click();
  await expect(dialog.getByRole("button", { name: `Stop sharing with Outsider ${stamp}` })).toBeVisible();

  await outsider.reload();
  const sharedSection = outsider.locator("section").filter({ hasText: "Shared with me" });
  await expect(sharedSection.getByRole("heading", { name: `Dept template ${stamp}` })).toBeVisible();
  // …and can use it.
  await sharedSection.getByRole("listitem").filter({ hasText: `Dept template ${stamp}` }).getByRole("button", { name: "Use", exact: true }).click();
  await outsider.waitForURL(/\/forms\/[0-9a-f-]{36}$/);
  await expect(outsider.getByRole("textbox", { name: "Form title" })).toHaveValue(`Dept template ${stamp}`);

  await colleagueCtx.close();
  await outsiderCtx.close();
});

test("multi-page form: per-page validation, Back keeps answers, thank-you with 'Submit another response'", async ({ browser, baseURL, page }) => {
  await admin(page, baseURL!, "rev-pages", d1, "Pages Owner");
  const form = await createForm({
    owner: users.at(-1)!,
    department: d1,
    category,
    status: "open",
    title: "Two-step registration",
    questions: [
      { type: "short_text", title: "Full name", required: true },
      { type: "section", title: "Your trip", description: "Tell us how you'll arrive." },
      { type: "single_choice", title: "Transport", required: true, options: ["Bus", "Train"] },
    ],
  });
  const { data } = await serviceClient().from("forms").select("share_slug").eq("id", form.id).single();

  const r = await browser.newPage({ viewport: { width: 360, height: 780 } });
  await r.goto(`${baseURL}/f/${data!.share_slug}`);
  await expect(r.getByText("Page 1 of 2")).toBeVisible();
  await expect(r.getByRole("button", { name: "Submit" })).toHaveCount(0);

  // Next is blocked until this page's required question is answered.
  await r.getByRole("button", { name: "Next", exact: true }).click();
  await expect(r.getByText("This is a required question")).toBeVisible();
  await r.getByRole("textbox", { name: "Full name" }).fill("Rina");
  await r.getByRole("button", { name: "Next", exact: true }).click();

  await expect(r.getByText("Page 2 of 2")).toBeVisible();
  await expect(r.getByRole("heading", { name: "Your trip" })).toBeVisible();
  await r.getByRole("button", { name: "Back", exact: true }).click();
  await expect(r.getByRole("textbox", { name: "Full name" })).toHaveValue("Rina");
  await r.getByRole("button", { name: "Next", exact: true }).click();
  await r.getByRole("radio", { name: "Train" }).click();
  await r.getByRole("button", { name: "Submit" }).click();

  await expect(r.getByRole("heading", { name: "Thank you!" })).toBeVisible();
  await expect(r.getByText("Your response has been recorded. Thank you for taking the time to fill in this form!")).toBeVisible();
  const { data: rows } = await serviceClient().from("responses").select("answers").eq("form_id", form.id);
  expect(rows).toEqual([{ answers: { [form.questionIds[0]]: "Rina", [form.questionIds[2]]: "Train" } }]);

  await r.getByRole("button", { name: "Submit another response" }).click();
  await expect(r.getByRole("textbox", { name: "Full name" })).toHaveValue("");
  await expect(r.getByText("Page 1 of 2")).toBeVisible();
  await r.close();
});

test("builder: new forms get the default thank-you text; Add section inserts a page break", async ({ page, baseURL }) => {
  await admin(page, baseURL!, "rev-builder-sections", d1, "Section Builder");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "New form" }).first().click();
  await page.waitForURL(/\/forms\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByText("Page 2 of 2").first()).toBeVisible();
  await page.getByRole("textbox", { name: "Section title (page 2)" }).fill("Details");
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(page.getByLabel("Confirmation message")).toHaveValue(/Your response has been recorded/);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });
  const formId = page.url().split("/").pop()!;
  const { data: qs } = await serviceClient().from("questions").select("type, title").eq("form_id", formId).order("position");
  expect(qs).toEqual([
    { type: "short_text", title: "" },
    { type: "section", title: "Details" },
  ]);
});

test("moving to the last page doesn't submit or flag the new page", async ({ browser, baseURL, page }) => {
  await admin(page, baseURL!, "rev-next-submit", d1, "Next Owner");
  const form = await createForm({
    owner: users.at(-1)!,
    department: d1,
    category,
    status: "open",
    questions: [
      { type: "short_text", title: "First", required: false },
      { type: "section", title: "Second page" },
      { type: "short_text", title: "Second", required: true },
    ],
  });
  const { data } = await serviceClient().from("forms").select("share_slug").eq("id", form.id).single();
  const r = await browser.newPage({ viewport: { width: 360, height: 780 } });
  await r.goto(`${baseURL}/f/${data!.share_slug}`);
  await r.getByRole("button", { name: "Next", exact: true }).click();
  await expect(r.getByText("Page 2 of 2")).toBeVisible();
  await expect(r.getByText("This is a required question")).toHaveCount(0);
  expect((await serviceClient().from("responses").select("id").eq("form_id", form.id)).data).toEqual([]);
  await r.close();
});
