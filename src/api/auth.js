import { api, setAuthToken } from "./client";

const STORAGE_KEY = "ivy_session_v1";

// FINDING (auth): The API returns access_token + refresh_token + expires_in:900
// (15 min), not the documented single "token" field with expires_in:86400 (24h).
// There IS a refresh flow at /auth/refresh, contrary to the docs.

const TOKEN_ALIASES = [
  "token", "access_token", "session_token", "auth_token",
  "jwt", "bearer", "api_token", "key", "auth", "id_token",
];

function extractToken(session) {
  for (const alias of TOKEN_ALIASES) {
    if (session[alias] && typeof session[alias] === "string") {
      return { token: session[alias], field: alias };
    }
  }
  // Fallback: any string ≥ 20 chars that isn't an email
  for (const [key, val] of Object.entries(session || {})) {
    if (typeof val === "string" && val.length >= 20 && !val.includes("@")) {
      console.debug(`[auth] token auto-discovered under field: '${key}'`);
      return { token: val, field: key };
    }
  }
  return { token: null, field: null };
}

export function saveSession(session) {
  console.debug("[auth] raw login response keys:", Object.keys(session || {}));

  const { token, field } = extractToken(session);
  if (!token) {
    console.error("[auth] No token found in response. Keys:", Object.keys(session || {}));
    throw new Error("Login response did not include a token.");
  }
  console.debug(`[auth] token from field '${field}':`, token.substring(0, 16) + "…");

  // Refresh token — may be present (undocumented feature we found)
  const refreshToken = session.refresh_token || null;

  // Actual expires_in is 900 seconds (15 min), not 86400 as documented.
  // We never apply a minimum floor — we trust what the server tells us.
  const rawExpiry = session.expires_in ?? session.expiry ?? session.exp ?? 86400;
  const YEAR_2000_S = 946684800;
  let expiresAt;
  if (typeof rawExpiry === "number" && rawExpiry > YEAR_2000_S) {
    expiresAt = rawExpiry * 1000; // absolute unix timestamp
  } else {
    expiresAt = Date.now() + Number(rawExpiry) * 1000;
  }

  const record = {
    token,
    refreshToken,
    refreshUrl: session.refresh_url || "/auth/refresh",
    tokenType: session.token_type || "Bearer",
    user: session.user,
    expiresAt,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  setAuthToken(record.token);
  console.debug("[auth] session saved, expiresAt:", new Date(expiresAt).toISOString());
  return record;
}

export function loadSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    if (!record.token) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    // If already expired, don't restore (caller will trigger refresh if possible)
    if (Date.now() >= record.expiresAt) {
      // Don't remove yet — let AuthContext attempt a refresh if we have a refreshToken
      return record; // Caller checks record.expiresAt < Date.now()
    }
    setAuthToken(record.token);
    return record;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  setAuthToken(null);
}

/** Attempt to refresh the access token using the stored refresh_token. */
export async function refreshSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error("No session to refresh");
  const record = JSON.parse(raw);
  if (!record.refreshToken) throw new Error("No refresh_token in session");

  console.debug("[auth] refreshing session via", record.refreshUrl);
  const res = await api.post(
    record.refreshUrl,
    { refresh_token: record.refreshToken },
    { auth: false } // Don't send the expired access token
  );
  return saveSession(res);
}

export async function login(email, password) {
  const res = await api.post("/auth/login", { email, password }, { auth: false });
  return saveSession(res);
}

export async function logout() {
  try {
    await api.post("/auth/logout", {});
  } catch {
    // Even if server call fails, log out locally
  } finally {
    clearSession();
  }
}
