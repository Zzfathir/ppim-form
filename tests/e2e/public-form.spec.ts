import { expect, test as base } from "@playwright/test";
import type { Database } from "@/lib/database.types";
import { assertLocalDatabase, cleanupUsers, createTestUser, firstDepartments, serviceClient, setProfile } from "../helpers/db";
import { createForm, firstCategory } from "../helpers/forms";
import { signInAs } from "./session";

/** Respondent experience on a 360 px phone (acceptance checklist "Answering"). */

// Every test also fails on browser console errors (hydration mismatches, React warnings, crashes).
const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        // 404 resources are expected on the not-found test.
        if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text());
      });
      await use(errors);
      expect(errors, "browser console errors").toEqual([]);
    },
    { auto: true },
  ],
});

let owner: string, dept: string, category: string;

const QUESTIONS = [
  { type: "short_text" as const, title: "Full name", required: true },
  { type: "single_choice" as const, title: "Which session?", required: true, options: ["Morning", "Evening"], settings: { allow_other: true } },
  { type: "multiple_choice" as const, title: "Topics", required: false, options: ["Scholarships", "Housing", "Visa"] },
  { type: "dropdown" as const, title: "Year", required: false, options: ["1", "2", "3", "4"] },
  { type: "scale" as const, title: "Excitement", required: true, settings: { min: 1, max: 5, min_label: "Low", max_label: "High" } },
  { type: "date" as const, title: "Arrival date", required: false },
  { type: "paragraph" as const, title: "Anything else?", required: false },
];

async function makeForm(settings: Database["public"]["Tables"]["forms"]["Update"] = {}, status: "open" | "closed" = "open") {
  const form = await createForm({ owner, department: dept, category, status, title: "Welcoming Party 2026", questions: QUESTIONS });
  await serviceClient().from("forms").update({ description: "Daftar ulang mahasiswa baru.", ...settings }).eq("id", form.id);
  const { data } = await serviceClient().from("forms").select("share_slug").eq("id", form.id).single();
  return { ...form, slug: data!.share_slug };
}

test.beforeAll(async () => {
  assertLocalDatabase();
  [{ id: dept }] = await firstDepartments(1);
  category = await firstCategory();
  const o = await createTestUser("e2e-owner");
  await setProfile(o.id, { role: "admin", status: "active", department_id: dept });
  owner = o.id;
});
test.afterAll(cleanupUsers);

test("an anonymous visitor completes every question type and submits on a 360 px screen", async ({ page }) => {
  const form = await makeForm({ confirmation_message: "Terima kasih! Sampai jumpa." });
  await page.goto(`/f/${form.slug}`);

  await expect(page.getByRole("heading", { name: "Welcoming Party 2026" })).toBeVisible();
  await expect(page.getByText(/· PPI Malaysia/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // No app chrome on the public form.
  await expect(page.getByRole("navigation")).toHaveCount(0);

  // Submit empty: inline required errors, nothing sent.
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("This is a required question")).toHaveCount(3);

  await page.getByRole("textbox", { name: "Full name" }).fill("Siti Rahma");
  await page.getByRole("radio", { name: "Evening" }).click();
  await page.getByRole("checkbox", { name: "Housing" }).click();
  await page.getByRole("checkbox", { name: "Visa" }).click();
  await page.getByRole("combobox", { name: "Year" }).click();
  await page.getByRole("option", { name: "2" }).click();
  await page.getByRole("radio", { name: "4" }).click();
  await page.getByLabel("Arrival date").fill("2026-11-02");
  await page.getByRole("textbox", { name: "Anything else?" }).fill("See you there");
  await expect(page.getByText("This is a required question")).toHaveCount(0);

  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Terima kasih! Sampai jumpa.")).toBeVisible();

  const { data } = await serviceClient().from("responses").select("answers, respondent_id").eq("form_id", form.id);
  expect(data).toHaveLength(1);
  const [name, session, topics, year, scale, date, note] = form.questionIds;
  expect(data![0]).toEqual({
    respondent_id: null,
    answers: {
      [name]: "Siti Rahma",
      [session]: "Evening",
      [topics]: ["Housing", "Visa"],
      [year]: "2",
      [scale]: 4,
      [date]: "2026-11-02",
      [note]: "See you there",
    },
  });
});

test("the 'Other' option is stored as the typed text", async ({ page }) => {
  const form = await makeForm();
  await page.goto(`/f/${form.slug}`);
  await page.getByRole("textbox", { name: "Full name" }).fill("Budi");
  await page.getByRole("textbox", { name: "Other answer" }).fill("Afternoon");
  await page.getByRole("radio", { name: "3" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Your response has been recorded.")).toBeVisible();
  const { data } = await serviceClient().from("responses").select("answers").eq("form_id", form.id).single();
  expect((data!.answers as Record<string, unknown>)[form.questionIds[1]]).toBe("Afternoon");
});

test("not found, not accepting, and sign-in required states", async ({ page }) => {
  const missing = await page.goto("/f/NoSuchForm9");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Form not found" })).toBeVisible();

  const closed = await makeForm({}, "closed");
  await page.goto(`/f/${closed.slug}`);
  await expect(page.getByRole("heading", { name: "Welcoming Party 2026" })).toBeVisible();
  await expect(page.getByText("This form is no longer accepting responses.")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);

  const login = await makeForm({ requires_login: true });
  await page.goto(`/f/${login.slug}`);
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("a signed-in respondent fills a sign-in form once, then sees 'already responded'; no onboarding", async ({ page, context, baseURL }) => {
  const form = await makeForm({ requires_login: true, limit_one_response: true });
  const user = await signInAs(context, baseURL!, "respondent");

  await page.goto(`/f/${form.slug}`);
  await expect(page).toHaveURL(new RegExp(`/f/${form.slug}$`)); // not sent to /onboarding
  await expect(page.getByText(`Signed in as ${user.email}`)).toBeVisible();
  await page.getByRole("textbox", { name: "Full name" }).fill("Respondent One");
  await page.getByRole("radio", { name: "Morning" }).click();
  await page.getByRole("radio", { name: "5" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Your response has been recorded.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("You've already responded")).toBeVisible();

  const { data: profile } = await serviceClient().from("profiles").select("role").eq("id", user.id).single();
  expect(profile?.role).toBe("respondent");
  const { data: rows } = await serviceClient().from("responses").select("respondent_email").eq("form_id", form.id);
  expect(rows).toEqual([{ respondent_email: user.email }]);
  await serviceClient().auth.admin.deleteUser(user.id);
});

test("the submit endpoint validates on the server and only accepts JSON", async ({ request }) => {
  const form = await makeForm();
  const url = `/api/public/forms/${form.slug}/submit`;

  const notJson = await request.post(url, { form: { answers: "x" } });
  expect(notJson.status()).toBe(415);

  // "Year" is a dropdown (no "Other"), so an unlisted value is invalid.
  const missing = await request.post(url, { data: { answers: { [form.questionIds[3]]: "Nope" } } });
  expect(missing.status()).toBe(422);
  const body = await missing.json();
  expect(body.errors[form.questionIds[0]]).toBe("required");
  expect(body.errors[form.questionIds[3]]).toBe("invalid_option");

  const get = await request.get(`/api/public/forms/${form.slug}`);
  const json = await get.json();
  expect(json.state).toBe("open");
  expect(JSON.stringify(json)).not.toContain(owner);
  expect((await serviceClient().from("responses").select("id").eq("form_id", form.id)).data).toEqual([]);
});
