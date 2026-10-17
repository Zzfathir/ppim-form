/** Google Sheets live sync against the local database, with a fake Google. */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/database.types";
import { decryptSecret, encryptSecret, signPayload, verifyPayload } from "@/lib/google/crypto";
import { GoogleApiError, type Cell, type SheetsApi } from "@/lib/google/api";
import { columnLetter, linkFormSheet, syncFormSheet, type SyncDeps } from "@/lib/google/sync";
import { assertLocalDatabase, cleanupUsers, createTestUser, firstDepartments, serviceClient, setProfile, type TestUser } from "../helpers/db";
import { createForm, firstCategory } from "../helpers/forms";

const key = randomBytes(32);
const labels = { timestamp: "Timestamp", name: "Name", email: "Email", deleted: "deleted question" };

/** In-memory Google: one grid per spreadsheet, plus a switch to simulate revoked access. */
function fakeGoogle() {
  const sheets = new Map<string, Cell[][]>();
  const state = { revoked: false, appendCalls: 0, delayMs: 0 };
  const api: SheetsApi = {
    async accessToken(refresh) {
      if (state.revoked) throw new GoogleApiError("revoked", 400, "access_revoked");
      return `access-for-${refresh}`;
    },
    async createSpreadsheet(_token, title) {
      const id = `sheet-${sheets.size + 1}`;
      sheets.set(id, []);
      return { id, url: `https://docs.google.com/spreadsheets/d/${id}?title=${encodeURIComponent(title)}` };
    },
    async writeRange(_token, id, a1, rows) {
      const grid = sheets.get(id)!;
      const [, cell] = a1.split("!");
      const col = cell.replace(/\d+/g, "");
      const colIndex = [...col].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
      const rowIndex = Number(cell.replace(/[A-Z]+/g, "")) - 1;
      rows.forEach((r, i) => {
        grid[rowIndex + i] ??= [];
        r.forEach((v, j) => (grid[rowIndex + i][colIndex + j] = v));
      });
    },
    async appendRows(_token, id, _title, rows) {
      state.appendCalls++;
      if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
      sheets.get(id)!.push(...rows.map((r) => [...r]));
    },
  };
  return { api, sheets, state };
}

let owner: TestUser, d1: string, category: string;

beforeAll(async () => {
  assertLocalDatabase();
  [{ id: d1 }] = await firstDepartments(1);
  category = await firstCategory();
  owner = await createTestUser("sheets-owner");
  await setProfile(owner.id, { role: "admin", status: "active", department_id: d1 });
  await serviceClient()
    .from("google_connections")
    .upsert({ profile_id: owner.id, google_email: owner.email, refresh_token_enc: encryptSecret("refresh-1", key), scopes: "drive.file" });
});
afterAll(cleanupUsers);

async function formWith(responses: Record<string, Json>[] = []) {
  const form = await createForm({
    owner: owner.id,
    department: d1,
    category,
    status: "open",
    questions: [
      { type: "short_text", title: "Name?" },
      { type: "section", title: "Page 2" },
      { type: "scale", title: "Rate", settings: { min: 1, max: 5 } },
    ],
  });
  const [nameQ, , rateQ] = form.questionIds;
  for (const [i, a] of responses.entries()) {
    await serviceClient()
      .from("responses")
      .insert({ form_id: form.id, answers: a, submitted_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() });
  }
  return { ...form, nameQ, rateQ };
}

const deps = (api: SheetsApi): SyncDeps => ({ db: serviceClient(), api, tokenKey: key, labels });

describe("helpers", () => {
  it("column letters", () => {
    expect([1, 3, 26, 27, 52, 703].map(columnLetter)).toEqual(["A", "C", "Z", "AA", "AZ", "AAA"]);
  });

  it("tokens are encrypted and tamper-evident", () => {
    const sealed = encryptSecret("secret-refresh-token", key);
    expect(sealed).not.toContain("secret");
    expect(decryptSecret(sealed, key)).toBe("secret-refresh-token");
    expect(() => decryptSecret(sealed.replace(/.$/, (c) => (c === "A" ? "B" : "A")), key)).toThrow();
    const signed = signPayload({ formId: "x" }, key);
    expect(verifyPayload<{ formId: string }>(signed, key)?.formId).toBe("x");
    expect(verifyPayload(signed.replace(/^./, "Z"), key)).toBeNull();
    expect(verifyPayload(signed, randomBytes(32))).toBeNull();
  });
});

describe("linkFormSheet + syncFormSheet", () => {
  it("creates the sheet with a header (sections skipped) and back-fills every response in order", async () => {
    const g = fakeGoogle();
    const f = await formWith();
    await serviceClient().from("responses").insert([
      { form_id: f.id, answers: { [f.nameQ]: "Siti", [f.rateQ]: 5 }, submitted_at: "2026-01-01T00:00:00Z", respondent_name: "Siti R" },
      { form_id: f.id, answers: { [f.nameQ]: "=1+1" }, submitted_at: "2026-01-01T00:05:00Z" },
    ]);

    const res = await linkFormSheet(deps(g.api), { formId: f.id, formTitle: "T", profileId: owner.id, sheetName: "T (Responses)" });
    expect(res.status).toBe("ok");
    const grid = g.sheets.get("sheet-1")!;
    expect(grid[0]).toEqual(["Timestamp", "Name", "Email", "Name?", "Rate"]);
    expect(grid[1]).toEqual(["2026-01-01 08:00:00", "Siti R", "", "Siti", 5]);
    // Formula-looking answers are passed as data (the API writes them RAW).
    expect(grid[2]).toEqual(["2026-01-01 08:05:00", "", "", "=1+1", ""]);

    const { data: link } = await serviceClient().from("form_sheets").select("status, last_synced_at, spreadsheet_url").eq("form_id", f.id).single();
    expect(link).toMatchObject({ status: "ok" });
    expect(link!.last_synced_at).not.toBeNull();
    const { count } = await serviceClient().from("responses").select("*", { count: "exact", head: true }).eq("form_id", f.id).is("sheet_synced_at", null);
    expect(count).toBe(0);
  });

  it("appends only new responses, and new questions get new columns at the end", async () => {
    const g = fakeGoogle();
    const f = await formWith([{}]);
    await linkFormSheet(deps(g.api), { formId: f.id, formTitle: "T", profileId: owner.id, sheetName: "T" });

    const { data: added } = await serviceClient()
      .from("questions")
      .insert({ form_id: f.id, position: 9, type: "date", title: "When?", settings: {} })
      .select("id")
      .single();
    await serviceClient().from("responses").insert({ form_id: f.id, answers: { [f.nameQ]: "Budi", [added!.id]: "2026-02-02" } });

    const res = await syncFormSheet(deps(g.api), f.id);
    expect(res).toEqual({ status: "ok", appended: 1 });
    const grid = g.sheets.get("sheet-1")!;
    expect(grid[0]).toEqual(["Timestamp", "Name", "Email", "Name?", "Rate", "When?"]);
    expect(grid).toHaveLength(3);
    expect(grid[2].slice(3)).toEqual(["Budi", "", "2026-02-02"]);
    expect((await syncFormSheet(deps(g.api), f.id)).appended).toBe(0);
  });

  it("concurrent syncs never duplicate rows (one holds the lease)", async () => {
    const g = fakeGoogle();
    g.state.delayMs = 150;
    const f = await formWith([{}, {}, {}]);
    await linkFormSheet(deps(g.api), { formId: f.id, formTitle: "T", profileId: owner.id, sheetName: "T" });
    await serviceClient().from("responses").insert([{ form_id: f.id, answers: {} }, { form_id: f.id, answers: {} }]);

    const results = await Promise.all([1, 2, 3].map(() => syncFormSheet(deps(g.api), f.id)));
    expect(results.filter((r) => r.status === "busy").length).toBeGreaterThanOrEqual(2);
    expect(g.sheets.get("sheet-1")!).toHaveLength(1 + 5); // header + every response exactly once
  });

  it("revoked Google access marks the link as broken and keeps rows pending until it works again", async () => {
    const g = fakeGoogle();
    const f = await formWith([{}]);
    await linkFormSheet(deps(g.api), { formId: f.id, formTitle: "T", profileId: owner.id, sheetName: "T" });
    await serviceClient().from("responses").insert({ form_id: f.id, answers: {} });

    g.state.revoked = true;
    expect((await syncFormSheet(deps(g.api), f.id)).status).toBe("access_revoked");
    const { data: broken } = await serviceClient().from("form_sheets").select("status, last_error, sync_lock_until").eq("form_id", f.id).single();
    expect(broken).toEqual({ status: "error", last_error: "access_revoked", sync_lock_until: null });

    g.state.revoked = false;
    expect(await syncFormSheet(deps(g.api), f.id)).toEqual({ status: "ok", appended: 1 });
    const { data: fixed } = await serviceClient().from("form_sheets").select("status, last_error").eq("form_id", f.id).single();
    expect(fixed).toEqual({ status: "ok", last_error: null });
  });

  it("does nothing for forms that aren't linked or people without a Google connection", async () => {
    const g = fakeGoogle();
    const f = await formWith([{}]);
    expect((await syncFormSheet(deps(g.api), f.id)).status).toBe("not_linked");
    const other = await createTestUser("sheets-nolink");
    await setProfile(other.id, { role: "admin", status: "active", department_id: d1 });
    expect((await linkFormSheet(deps(g.api), { formId: f.id, formTitle: "T", profileId: other.id, sheetName: "T" })).status).toBe("not_connected");
    expect(g.sheets.size).toBe(0);
  });

  it("only people who can read the form see its link status; tokens are never readable", async () => {
    const g = fakeGoogle();
    const f = await formWith();
    await linkFormSheet(deps(g.api), { formId: f.id, formTitle: "T", profileId: owner.id, sheetName: "T" });
    expect((await owner.client.from("form_sheets").select("spreadsheet_url").eq("form_id", f.id)).data).toHaveLength(1);
    expect((await owner.client.from("google_connections").select("*")).data ?? []).toEqual([]);
    const outsider = await createTestUser("sheets-out");
    const [, { id: d2 }] = await firstDepartments(2);
    await setProfile(outsider.id, { role: "admin", status: "active", department_id: d2 });
    expect((await outsider.client.from("form_sheets").select("form_id").eq("form_id", f.id)).data).toEqual([]);
  });
});
