import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  loadSession, clearSession, refreshSession,
  login as loginApi, logout as logoutApi,
} from "../api/auth";
import { setAuthToken } from "../api/client";

const AuthContext = createContext(null);

// How many ms before expiry to proactively refresh (2 minutes)
const REFRESH_BEFORE_MS = 2 * 60 * 1000;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const s = loadSession();
    // If expired but have refresh token, we'll attempt refresh in the effect
    if (s && Date.now() < s.expiresAt) return s;
    return null; // will attempt refresh below if refresh token exists
  });
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  // Attempt to refresh the token; returns true on success
  const tryRefresh = useCallback(async () => {
    try {
      const record = await refreshSession();
      setSession(record);
      console.debug("[AuthContext] token refreshed, new expiry:", new Date(record.expiresAt).toISOString());
      return true;
    } catch (err) {
      console.warn("[AuthContext] token refresh failed:", err.message);
      clearSession();
      setSession(null);
      return false;
    }
  }, []);

  // On mount: if we loaded a session but it's already expired, attempt refresh
  useEffect(() => {
    const raw = loadSession();
    if (raw && Date.now() >= raw.expiresAt) {
      if (raw.refreshToken) {
        tryRefresh();
      } else {
        clearSession();
        setSession(null);
      }
    } else if (raw) {
      setAuthToken(raw.token);
      setSession(raw);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Proactive refresh: 2 minutes before expiry, and periodic check every 60s
  useEffect(() => {
    const interval = setInterval(async () => {
      const raw = loadSession();
      if (!raw) { setSession(null); return; }

      const msLeft = raw.expiresAt - Date.now();
      if (msLeft <= 0) {
        // Already expired
        if (raw.refreshToken) {
          await tryRefresh();
        } else {
          clearSession();
          setSession(null);
        }
      } else if (msLeft <= REFRESH_BEFORE_MS && raw.refreshToken) {
        // Within 2-min window — refresh proactively
        console.debug(`[AuthContext] token expiring in ${Math.round(msLeft / 1000)}s — refreshing now`);
        await tryRefresh();
      }
    }, 30_000); // Check every 30 seconds (token is only 15 min)
    return () => clearInterval(interval);
  }, [tryRefresh]);

  // Listen for 401 events from client.js
  useEffect(() => {
    async function handleExpired() {
      console.warn("[AuthContext] session-expired event — attempting refresh");
      const raw = loadSession();
      if (raw?.refreshToken) {
        const ok = await tryRefresh();
        if (ok) return; // recovered
      }
      clearSession();
      setSession(null);
    }
    window.addEventListener("ivy:session-expired", handleExpired);
    return () => window.removeEventListener("ivy:session-expired", handleExpired);
  }, [tryRefresh]);

  const login = useCallback(async (email, password) => {
    setChecking(true);
    setError(null);
    try {
      const record = await loginApi(email, password);
      setSession(record);
      return record;
    } catch (err) {
      setError(err.detail || err.message || "Login failed");
      throw err;
    } finally {
      setChecking(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutApi();
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, login, logout, checking, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
