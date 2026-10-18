import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";
import { assertLocalDatabase, cleanupUsers, firstDepartments, serviceClient, setProfile } from "../helpers/db";
import { addResponse, createForm, firstCategory } from "../helpers/forms";
import { signInAs } from "./session";

/**
 * Phase 7 sweep: every page passes axe (WCAG 2.1 A/AA) and has no sideways
 * scroll at 360 px. Runs on the phone-360 and desktop projects.
 */

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

let formId: string, slug: string, templateId: string, d1: string, category: string;
const users: string[] = [];

test.beforeAll(async () => {
  assertLocalDatabase();
  [{ id: d1 }] = await firstDepartments(1);
  category = await firstCategory();
  const { data } = await serviceClient().from("templates").select("id").eq("is_official", true).limit(1).single();
  templateId = data!.id;
});
test.afterAll(async () => {
  await Promise.all(users.map((id) => serviceClient().auth.admin.deleteUser(id)));
  await cleanupUsers();
});

async function signIn(page: Page, baseURL: string, label: string) {
  const user = await signInAs(page.context(), baseURL, label);
  users.push(user.id);
  await setProfile(user.id, { role: "superadmin", status: "active", department_id: d1 });
  if (!formId) {
    const form = await createForm({
      owner: user.id,
      department: d1,
      category,
      status: "open",
      title: "Polish check",
      questions: [
        { type: "short_text", title: "Your name", required: true },
        { type: "single_choice", title: "Coming?", options: ["Yes", "No"] },
        { type: "scale", title: "Rating", settings: { min: 1, max: 5 } },
      ],
    });
    formId = form.id;
    const { data } = await serviceClient().from("forms").select("share_slug").eq("id", formId).single();
    slug = data!.share_slug;
    await addResponse(formId, {});
  }
}

async function check(page: Page, path: string) {
  await page.goto(path);
  await audit(page, path);
}

async function audit(page: Page, path: string) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main").first()).toBeVisible();

  const scan = () => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  // The dev server sometimes reloads a route the first time it compiles it; scan again once it settles.
  const results = await scan().catch(async (e: Error) => {
    if (!e.message.includes("Execution context was destroyed")) throw e;
    await page.waitForLoadState("networkidle");
    return scan();
  });
  const problems = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
  expect.soft(problems, `axe on ${path}`).toEqual([]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect.soft(overflow, `horizontal scroll on ${path}`).toBeLessThanOrEqual(0);
}

test("signed-out pages and onboarding", async ({ page, baseURL }) => {
  await check(page, "/login");
  const user = await signInAs(page.context(), baseURL!, "polish-new");
  users.push(user.id);
  await check(page, "/onboarding");
});

test("app pages", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await signIn(page, baseURL!, "polish");
  for (const path of [
    "/dashboard",
    `/forms/${formId}`,
    "/templates",
    `/templates/${templateId}`,
    "/admin",
    "/admin/forms",
    `/admin/forms/${formId}`,
    "/admin/people",
    "/admin/departments",
    "/admin/chapters",
    "/admin/categories",
    "/admin/templates",
    "/admin/settings",
  ]) {
    await check(page, path);
  }
  await check(page, `/forms/${formId}?tab=settings`);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await audit(page, "share dialog");
  await page.keyboard.press("Escape");
  await check(page, `/forms/${formId}?tab=responses`);
  await page.getByRole("button", { name: "Responses", exact: true }).click();
  await audit(page, "responses table");
});

test("public form", async ({ page, baseURL, consoleErrors }) => {
  await signIn(page, baseURL!, "polish-public");
  await page.context().clearCookies();
  await check(page, `/f/${slug}`);
  await check(page, "/f/doesnotexist");
  // The browser logs the page's own 404 status; that one is expected.
  const expected = consoleErrors.findIndex((e) => e.includes("status of 404"));
  if (expected >= 0) consoleErrors.splice(expected, 1);
});
