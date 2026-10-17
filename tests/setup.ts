import { resolve } from "node:path";
import { config } from "dotenv";
import { vi } from "vitest";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

// `server-only` throws outside a React Server environment; tests import server modules directly.
vi.mock("server-only", () => ({}));
