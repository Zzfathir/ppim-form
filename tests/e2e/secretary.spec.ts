import { readFile } from "node:fs/promises";
import { expect, test as base, type Page } from "@playwright/test";
import { assertLocalDatabase, cleanupUsers, createTestUser, firstDepartments, serviceClient, setProfile } from "../helpers/db";
import { addResponse, createForm, firstCategory } from "../helpers/forms";
import { signInAs } from "./session";

/** Secretary pages (acceptance checklist "Secretary"), desktop viewport. */

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
const created: string[] = [];

test.beforeAll(async () => {
  assertLocalDatabase();
  [{ id: d1 }, { id: d2 }] = await firstDepartments(2);
  category = await firstCategory();
});
test.afterAll(async () => {
  await Promise.all(created.map((id) => serviceClient().auth.admin.deleteUser(id)));
  await cleanupUsers();
});

async function as(page: Page, baseURL: string, label: string, role: "admin" | "superadmin") {
  const user = await signInAs(page.context(), baseURL, label);
  created.push(user.id);
  await setProfile(user.id, { role, status: "active", department_id: d1 });
  return user;
}

async function actions(entityId: string) {
  const { data } = await serviceClient().from("activity_log").select("action, actor_id").eq("entity_id", entityId);
  return data ?? [];
}

test("overview KPIs, period filter and links", async ({ page, baseURL }) => {
  await as(page, baseURL!, "sec-overview", "superadmin");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Total forms")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Departments" })).toBeVisible();
  const before = await page.getByText(/^Showing /).innerText();

  await page.getByRole("button", { name: "7 days" }).click();
  await expect(page).toHaveURL(/period=7d/);
  await expect(page.getByText(/^Showing /)).not.toHaveText(before);

  await page.getByRole("button", { name: "Custom" }).click();
  await page.getByLabel("From date").fill("2026-01-01");
  await page.getByLabel("To date").fill("2026-01-31");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/period=custom&from=2026-01-01&to=2026-01-31/);
  await expect(page.getByText(/Jan 1, 2026 – Jan 31, 2026/)).toBeVisible();

  await page.getByRole("link", { name: /Pending admin approvals/ }).click();
  await expect(page).toHaveURL(/\/admin\/people$/);
});

test("approve a pending admin and suspend another; both are logged", async ({ page, baseURL }) => {
  const me = await as(page, baseURL!, "sec-people", "superadmin");
  const pending = await createTestUser("sec-pending");
  await setProfile(pending.id, { role: "admin", status: "pending", department_id: d2, full_name: `Pending ${pending.id.slice(0, 6)}` });
  const active = await createTestUser("sec-active");
  await setProfile(active.id, { role: "admin", status: "active", department_id: d2, full_name: `Active ${active.id.slice(0, 6)}` });

  await page.goto("/admin/people");
  await page.getByRole("listitem").filter({ hasText: `Pending ${pending.id.slice(0, 6)}` }).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/can now publish forms/)).toBeVisible();
  await expect.poll(async () => (await serviceClient().from("profiles").select("status").eq("id", pending.id).single()).data?.status).toBe("active");

  await page.getByRole("button", { name: `Actions for Active ${active.id.slice(0, 6)}` }).click();
  await page.getByRole("menuitem", { name: "Suspend" }).click();
  await expect.poll(async () => (await serviceClient().from("profiles").select("status").eq("id", active.id).single()).data?.status).toBe("suspended");

  expect(await actions(pending.id)).toContainEqual({ action: "admin_approved", actor_id: me.id });
  expect(await actions(active.id)).toContainEqual({ action: "admin_suspended", actor_id: me.id });
});

test("registry filters, CSV export, and form actions on the detail page", async ({ page, baseURL }) => {
  const me = await as(page, baseURL!, "sec-registry", "superadmin");
  const owner = await createTestUser("sec-owner");
  await setProfile(owner.id, { role: "admin", status: "active", department_id: d1, full_name: "Registry Owner" });
  const heir = await createTestUser("sec-heir");
  await setProfile(heir.id, { role: "admin", status: "active", department_id: d2, full_name: `Heir ${heir.id.slice(0, 6)}` });
  const title = `Registry ${Date.now()}`;
  const form = await createForm({ owner: owner.id, department: d1, category, status: "open", title });
  await addResponse(form.id, { [form.questionIds[0]]: "x" });

  await page.goto(`/admin/forms?q=${encodeURIComponent(title)}`);
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toContainText("Registry Owner");
  await expect(row).toContainText("1");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
  const csv = (await readFile(await download.path())).toString("utf8").replace(/^﻿/, "");
  const lines = csv.trim().split("\r\n");
  expect(lines[0]).toBe("Title,Department,Chapter,Category,Creator,Creator email,Status,Created,Published,Last response,Responses,Link");
  expect(lines).toHaveLength(2);
  expect(lines[1]).toContain(title);

  await row.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Close any form.
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();

  // Change department.
  await page.locator("#detail-department").click();
  const { data: dept2 } = await serviceClient().from("departments").select("name").eq("id", d2).single();
  await page.getByRole("option", { name: dept2!.name }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await serviceClient().from("forms").select("department_id").eq("id", form.id).single()).data?.department_id).toBe(d2);

  // Transfer owner.
  await page.getByRole("combobox", { name: "New owner" }).click();
  await page.getByRole("option", { name: `Heir ${heir.id.slice(0, 6)}` }).click();
  await page.getByRole("button", { name: "Transfer", exact: true }).click();
  await expect.poll(async () => (await serviceClient().from("forms").select("owner_id").eq("id", form.id).single()).data?.owner_id).toBe(heir.id);

  const log = await actions(form.id);
  for (const action of ["form_closed", "form_retagged", "form_transferred"]) {
    expect(log, action).toContainEqual({ action, actor_id: me.id });
  }
});

test("departments: add and archive; archived ones keep their forms", async ({ page, baseURL }) => {
  await as(page, baseURL!, "sec-dept", "superadmin");
  const name = `Dept ${Date.now()}`;
  await page.goto("/admin/departments");
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  const item = page.getByRole("listitem").filter({ hasText: name });
  await expect(item).toBeVisible();

  const { data: dept } = await serviceClient().from("departments").select("id").eq("name", name).single();
  const owner = await createTestUser("sec-dept-owner");
  await setProfile(owner.id, { role: "admin", status: "active", department_id: d1 });
  const form = await createForm({ owner: owner.id, department: dept!.id, category, status: "open" });

  await page.reload();
  await expect(item.getByRole("button", { name: `Delete ${name}` })).toHaveCount(0); // in use: archive only
  await item.getByRole("button", { name: `Archive ${name}` }).click();
  await expect(item).toContainText("Archived");
  const { data: after } = await serviceClient().from("forms").select("department_id").eq("id", form.id).single();
  expect(after?.department_id).toBe(dept!.id);
});

test("save a form as a template, publish it, and admins can use it", async ({ page, baseURL, browser }) => {
  await as(page, baseURL!, "sec-tpl", "superadmin");
  const owner = await createTestUser("sec-tpl-owner");
  await setProfile(owner.id, { role: "admin", status: "active", department_id: d1 });
  const title = `Template source ${Date.now()}`;
  const form = await createForm({ owner: owner.id, department: d1, category, status: "open", title });

  await page.goto(`/admin/forms/${form.id}`);
  await page.getByRole("button", { name: "Save as template" }).click();
  await page.waitForURL(/\/templates\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("textbox", { name: "Template title" })).toHaveValue(title);
  await page.getByRole("switch", { name: "Published" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

  const adminContext = await browser.newContext({ baseURL: baseURL! });
  const adminPage = await adminContext.newPage();
  await as(adminPage, baseURL!, "sec-tpl-user", "admin");
  await adminPage.goto("/templates");
  await expect(adminPage.getByRole("heading", { name: title })).toBeVisible();
  await adminContext.close();
});

test("admins can't reach secretary pages or exports", async ({ page, baseURL }) => {
  await as(page, baseURL!, "sec-intruder", "admin");
  await page.goto("/admin/people");
  await expect(page).toHaveURL(/\/dashboard$/);
  expect((await page.request.get("/api/admin/forms/export")).status()).toBe(403);
});
