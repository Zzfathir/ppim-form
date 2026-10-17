import "server-only";

/**
 * Minimal Google OAuth + Sheets client over fetch. The sync code depends on
 * the `SheetsApi` interface so tests can supply a fake Google.
 */

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SCOPES = ["openid", "email", SHEETS_SCOPE].join(" ");

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Stable reason for the UI: access_revoked | not_found | quota | failed */
    readonly reason: "access_revoked" | "not_found" | "quota" | "failed",
  ) {
    super(message);
  }
}

export type Cell = string | number;

export interface SheetsApi {
  /** Exchange a refresh token for a short-lived access token. */
  accessToken(refreshToken: string): Promise<string>;
  createSpreadsheet(token: string, title: string, sheetTitle: string): Promise<{ id: string; url: string }>;
  /** Overwrite a rectangle starting at `a1` (e.g. "Responses!A1"). */
  writeRange(token: string, spreadsheetId: string, a1: string, rows: Cell[][]): Promise<void>;
  /** Append rows below the last row of the sheet. */
  appendRows(token: string, spreadsheetId: string, sheetTitle: string, rows: Cell[][]): Promise<void>;
}

export function authUrl(opts: { clientId: string; redirectUri: string; state: string; codeChallenge: string; loginHint?: string }) {
  const q = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  if (opts.loginHint) q.set("login_hint", opts.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

export async function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<{ refreshToken: string | null; scope: string; email: string | null }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
      code: opts.code,
      code_verifier: opts.codeVerifier,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleApiError(`token exchange failed: ${body.error ?? res.status}`, res.status, "failed");
  let email: string | null = null;
  if (typeof body.id_token === "string") {
    // The id_token comes straight from Google's token endpoint over TLS; only the email claim is read.
    try {
      email = JSON.parse(Buffer.from(body.id_token.split(".")[1], "base64url").toString("utf8")).email ?? null;
    } catch {
      email = null;
    }
  }
  return { refreshToken: body.refresh_token ?? null, scope: body.scope ?? "", email };
}

async function google(token: string, url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const reason = res.status === 401 || res.status === 403 ? "access_revoked" : res.status === 404 ? "not_found" : res.status === 429 ? "quota" : "failed";
    throw new GoogleApiError(`Google API ${res.status} for ${new URL(url).pathname}`, res.status, reason);
  }
  return res;
}

/** The real Google, with a small in-process access-token cache. */
export function googleSheetsApi(clientId: string, clientSecret: string): SheetsApi {
  const cache = new Map<string, { token: string; expires: number }>();
  return {
    async accessToken(refreshToken) {
      const hit = cache.get(refreshToken);
      if (hit && hit.expires > Date.now() + 60_000) return hit.token;
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // invalid_grant = the person revoked access (or the grant expired).
        throw new GoogleApiError(`token refresh failed: ${body.error ?? res.status}`, res.status, body.error === "invalid_grant" ? "access_revoked" : "failed");
      }
      cache.set(refreshToken, { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 });
      return body.access_token as string;
    },
    async createSpreadsheet(token, title, sheetTitle) {
      const res = await google(token, "https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        body: JSON.stringify({
          properties: { title },
          sheets: [{ properties: { title: sheetTitle, gridProperties: { frozenRowCount: 1 } } }],
        }),
      });
      const body = await res.json();
      return { id: body.spreadsheetId, url: body.spreadsheetUrl };
    },
    async writeRange(token, spreadsheetId, a1, rows) {
      // RAW: values are stored as-is, so answers can never become formulas.
      await google(
        token,
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(a1)}?valueInputOption=RAW`,
        { method: "PUT", body: JSON.stringify({ values: rows }) },
      );
    },
    async appendRows(token, spreadsheetId, sheetTitle, rows) {
      await google(
        token,
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetTitle}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values: rows }) },
      );
    },
  };
}
