// Fails when en.json and id.json don't have exactly the same message keys.
//   node scripts/check-messages.mjs
import { readFileSync } from "node:fs";

const flat = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
const load = (locale) => new Set(flat(JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"))));

const en = load("en");
const id = load("id");
const missingInId = [...en].filter((k) => !id.has(k));
const missingInEn = [...id].filter((k) => !en.has(k));

if (missingInId.length || missingInEn.length) {
  console.error("Message keys differ.", { missingInId, missingInEn });
  process.exit(1);
}
console.log(`messages ok: ${en.size} keys in en and id`);
