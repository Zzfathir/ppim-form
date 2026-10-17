import { expect, test as base, type Page } from "@playwright/test";
import { assertLocalDatabase, cleanupUsers, firstDepartments, serviceClient, setProfile } from "../helpers/db";
import { signInAs } from "./session";

/** Builder (acceptance checklist "Creating"), on a desktop viewport. */

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

let dept: string;
const created: string[] = [];

test.beforeAll(async () => {
  assertLocalDatabase();
  [{ id: dept }] = await firstDepartments(1);
});
test.afterAll(async () => {
  await Promise.all(created.map((id) => serviceClient().auth.admin.deleteUser(id)));
  await cleanupUsers();
});

async function asAdmin(page: Page, baseURL: string, label: string, status: "active" | "pending" = "active") {
  const user = await signInAs(page.context(), baseURL, label);
  created.push(user.id);
  await setProfile(user.id, { role: "admin", status, department_id: dept });
  return user;
}

const titles = (page: Page) =>
  page
    .locator("[id^=question-] section")
    .evaluateAll((els) => els.map((e) => (e.querySelector("textarea")?.value ?? e.querySelector("p")?.textContent ?? "").replace("*", "").trim()));

test("new form → edit → autosave → reorder → publish → share → reload keeps everything", async ({ page, baseURL }) => {
  await asAdmin(page, baseURL!, "builder");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "New form" }).first().click();
  await page.waitForURL(/\/forms\/[0-9a-f-]{36}$/);

  await page.getByRole("textbox", { name: "Form title" }).fill("Futsal Cup");
  await page.getByRole("textbox", { name: "Question 1" }).fill("Team name");
  await page.getByRole("button", { name: "Add question" }).last().click();
  await page.getByRole("textbox", { name: "Question 2" }).fill("Category");
  await page.getByRole("textbox", { name: "Option 1 text" }).fill("Men");
  await page.getByRole("textbox", { name: "Option 1 text" }).press("Enter");
  await page.getByRole("textbox", { name: "Option 2 text" }).fill("Women");

  // Keyboard reorder: move question 2 above question 1.
  await page.getByRole("button", { name: "Drag to reorder question 2" }).focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(300);
  await page.keyboard.press("Space");
  await expect.poll(() => titles(page)).toEqual(["Category", "Team name"]);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

  // Publishing without a category is blocked with an inline message.
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("alert").getByText("Choose a category.")).toBeVisible();

  await page.locator("#category").click();
  await page.getByRole("option", { name: "Survey" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Publish" }).click();
  const dialog = page.getByRole("dialog", { name: "Your form is live" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#share-link")).toHaveValue(/\/f\/[A-Za-z0-9]{10}$/);
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Form title" })).toHaveValue("Futsal Cup");
  await expect.poll(() => titles(page)).toEqual(["Category", "Team name"]);
  await expect(page.getByText("Accepting responses").first()).toBeVisible();

  // Close with one toggle.
  await page.getByRole("switch", { name: "Accepting responses" }).click();
  await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
});

test("a template pre-fills questions and category", async ({ page, baseURL }) => {
  await asAdmin(page, baseURL!, "template");
  await page.goto("/templates");
  await page.getByRole("listitem").filter({ hasText: "Event feedback" }).getByRole("button", { name: "Use this template" }).click();
  await page.waitForURL(/\/forms\//);
  await expect(page.getByRole("textbox", { name: "Form title" })).toHaveValue("Event feedback");
  await expect(page.locator("#category")).toHaveText(/Feedback \/ evaluation/);
  await expect(page.locator("[id^=question-]")).toHaveCount(5);
});

test("same-department colleagues get a read-only view and can duplicate", async ({ page, baseURL, browser }) => {
  await asAdmin(page, baseURL!, "owner2");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "New form" }).first().click();
  await page.waitForURL(/\/forms\//);
  await page.getByRole("textbox", { name: "Form title" }).fill("Owner's form");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });
  const url = page.url();

  const peerContext = await browser.newContext({ baseURL: baseURL! });
  const peer = await peerContext.newPage();
  await asAdmin(peer, baseURL!, "peer2");
  await peer.goto(url);
  await expect(peer.getByText(/View only/).first()).toBeVisible();
  await expect(peer.getByRole("textbox", { name: "Form title" })).toHaveCount(0);
  await peer.getByRole("button", { name: "Duplicate to my forms" }).click();
  await peer.waitForURL((u) => u.toString() !== url);
  await expect(peer.getByRole("textbox", { name: "Form title" })).toHaveValue("Copy of Owner's form");
  await peerContext.close();
});

test("a pending admin can build but not publish", async ({ page, baseURL }) => {
  await asAdmin(page, baseURL!, "pending", "pending");
  await page.goto("/dashboard");
  await expect(page.getByText("Waiting for approval")).toBeVisible();
  await page.getByRole("button", { name: "New form" }).first().click();
  await page.waitForURL(/\/forms\//);
  await page.getByRole("textbox", { name: "Question 1" }).fill("Draft question");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
});
