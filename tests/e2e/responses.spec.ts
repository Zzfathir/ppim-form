import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { expect, test as base, type Page } from "@playwright/test";
import type { Json } from "@/lib/database.types";
import { assertLocalDatabase, cleanupUsers, firstDepartments, serviceClient, setProfile } from "../helpers/db";
import { createForm, firstCategory } from "../helpers/forms";
import { signInAs } from "./session";

/** Responses tab (acceptance checklist "Responses"), desktop viewport. */

const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push(m.text()));
      await use(errors);
      expect(errors, "browser console errors").toEqual([]);
    },
    { auto: true },
  ],
});

let d1: string, d2: string, category: string;
const users: string[] = [];
const RESPONSES = 30;

test.beforeAll(async () => {
  assertLocalDatabase();
  [{ id: d1 }, { id: d2 }] = await firstDepartments(2);
  category = await firstCategory();
});
test.afterAll(async () => {
  await Promise.all(users.map((id) => serviceClient().auth.admin.deleteUser(id)));
  await cleanupUsers();
});

async function admin(page: Page, baseURL: string, label: string, department: string) {
  const user = await signInAs(page.context(), baseURL, label);
  users.push(user.id);
  await setProfile(user.id, { role: "admin", status: "active", department_id: department });
  return user;
}

async function formWithResponses(ownerId: string) {
  const form = await createForm({
    owner: ownerId,
    department: d1,
    category,
    status: "open",
    title: "Survei Kepuasan",
    questions: [
      { type: "single_choice", title: "Datang?", required: true, options: ["Ya", "Tidak"] },
      { type: "multiple_choice", title: "Minat", options: ["Olahraga", "Seni"] },
      { type: "scale", title: "Nilai", settings: { min: 1, max: 5 } },
      { type: "short_text", title: "Komentar" },
    ],
  });
  const [come, interests, score, comment] = form.questionIds;
  const rows = Array.from({ length: RESPONSES }, (_, i) => ({
    form_id: form.id,
    submitted_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
    answers: {
      [come]: i % 3 === 0 ? "Tidak" : "Ya",
      [interests]: i % 2 === 0 ? ["Olahraga", "Seni"] : ["Seni"],
      [score]: (i % 5) + 1,
      [comment]: i === 7 ? "=SUM(1,1)" : `komentar ${i}`,
    } as Record<string, Json>,
  }));
  const { error } = await serviceClient().from("responses").insert(rows);
  if (error) throw error;
  return form;
}

test("summary, table and exports match the stored responses", async ({ page, baseURL }) => {
  const owner = await admin(page, baseURL!, "resp-owner", d1);
  const form = await formWithResponses(owner.id);

  await page.goto(`/forms/${form.id}?tab=responses`);
  await expect(page.getByRole("heading", { name: "30 responses" })).toBeVisible();

  // Summary: "Ya" 20 of 30 (67%), "Tidak" 10 (33%); scale average 3.
  const come = page.getByRole("region", { name: "Datang?" });
  await expect(come.getByRole("listitem").filter({ hasText: "Ya" })).toContainText("20");
  await expect(come.getByRole("listitem").filter({ hasText: "Ya" })).toContainText("67%");
  await expect(come.getByRole("listitem").filter({ hasText: "Tidak" })).toContainText("10");
  await expect(page.getByRole("region", { name: "Nilai" })).toContainText("Average 3 out of 5");
  await expect(page.getByRole("region", { name: "Minat" }).getByRole("listitem").filter({ hasText: "Seni" })).toContainText("30");

  // Table: 25 per page, newest first, search.
  await page.getByRole("button", { name: "Responses", exact: true }).click();
  await expect(page.getByRole("row")).toHaveCount(26); // header + 25
  await expect(page.getByText("1–25 of 30")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("26–30 of 30")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search responses" }).fill("komentar 12");
  await expect(page.getByRole("row")).toHaveCount(2);

  // CSV export: every response, columns in question order, formulas neutralized.
  await page.getByRole("button", { name: "Export" }).click();
  const [csvDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download CSV" }).click()]);
  expect(csvDownload.suggestedFilename()).toMatch(/^Survei-Kepuasan-responses-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = (await readFile(await csvDownload.path())).toString("utf8").replace(/^﻿/, "");
  const lines = csv.trim().split("\r\n");
  expect(lines[0]).toBe("Timestamp,Datang?,Minat,Nilai,Komentar");
  expect(lines).toHaveLength(RESPONSES + 1);
  expect(lines[1]).toBe("2026-10-01 08:00:00,Tidak,Olahraga; Seni,1,komentar 0");
  expect(csv).toContain(`"'=SUM(1,1)"`);

  // XLSX export: same data, scale numeric.
  await page.getByRole("button", { name: "Export" }).click();
  const [xlsxDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Excel (.xlsx)" }).click()]);
  const workbook = new ExcelJS.Workbook();
  const file = await readFile(await xlsxDownload.path());
  await workbook.xlsx.load(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  expect(sheet.rowCount).toBe(RESPONSES + 1);
  expect(sheet.getRow(1).values).toEqual([undefined, "Timestamp", "Datang?", "Minat", "Nilai", "Komentar"]);
  expect(sheet.getRow(2).values).toEqual([undefined, "2026-10-01 08:00:00", "Tidak", "Olahraga; Seni", 1, "komentar 0"]);
  expect(sheet.getRow(9).getCell(5).value).toBe("=SUM(1,1)"); // stored as text, not a formula
  expect(sheet.getRow(9).getCell(5).formula).toBeUndefined();
});

test("same-department admins can view and export; other departments get nothing", async ({ page, baseURL, browser }) => {
  const owner = await admin(page, baseURL!, "resp-owner2", d1);
  const form = await formWithResponses(owner.id);

  const peerContext = await browser.newContext({ baseURL: baseURL! });
  const peer = await peerContext.newPage();
  await admin(peer, baseURL!, "resp-peer", d1);
  await peer.goto(`/forms/${form.id}?tab=responses`);
  await expect(peer.getByRole("heading", { name: "30 responses" })).toBeVisible();
  expect((await peer.request.get(`/api/forms/${form.id}/export?format=csv`)).status()).toBe(200);
  await peerContext.close();

  const outsiderContext = await browser.newContext({ baseURL: baseURL! });
  const outsider = await outsiderContext.newPage();
  await admin(outsider, baseURL!, "resp-out", d2);
  expect((await outsider.request.get(`/api/forms/${form.id}/export?format=csv`)).status()).toBe(404);
  // The page streams behind its loading skeleton, so the status is 200, but no form data is sent.
  await outsider.goto(`/forms/${form.id}`);
  await expect(outsider.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(outsider.getByText("Survei Kepuasan")).toHaveCount(0);
  await outsiderContext.close();

  // Signed out: no export.
  expect((await page.context().request.fetch(`${baseURL}/api/forms/${form.id}/export?format=xlsx`, { headers: { cookie: "" } })).status()).toBe(401);
});
