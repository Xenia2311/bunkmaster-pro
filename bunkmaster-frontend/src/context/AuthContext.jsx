import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getMe, login as loginApi, register as registerApi } from "../api/auth";
import { getToken, setToken } from "../api/client";

const AuthContext = createContext(null);

const ACTIVE_SECTION_KEY = "bunkmaster_active_section";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [activeSectionId, setActiveSectionId] = useState(
    () => localStorage.getItem(ACTIVE_SECTION_KEY) || null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshMe = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setMemberships([]);
      setLoading(false);
      return;
    }
    try {
      const data = await getMe();
      setUser(data.user);
      setMemberships(data.memberships);

      // If no active section yet, or the active section is no longer valid,
      // default to the first membership.
      setActiveSectionId((current) => {
        const stillValid = data.memberships.some((m) => m.sectionId === current);
        if (stillValid) return current;
        const fallback = data.memberships[0]?.sectionId || null;
        if (fallback) localStorage.setItem(ACTIVE_SECTION_KEY, fallback);
        return fallback;
      });
    } catch (err) {
      // Token invalid/expired
      setToken(null);
      setUser(null);
      setMemberships([]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const login = useCallback(
    async (credentials) => {
      setError(null);
      const data = await loginApi(credentials);
      setToken(data.token);
      await refreshMe();
      return data;
    },
    [refreshMe]
  );

  const register = useCallback(
    async (details) => {
      setError(null);
      const data = await registerApi(details);
      setToken(data.token);
      await refreshMe();
      return data;
    },
    [refreshMe]
  );

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem(ACTIVE_SECTION_KEY);
    setUser(null);
    setMemberships([]);
    setActiveSectionId(null);
  }, []);

  const switchSection = useCallback((sectionId) => {
    setActiveSectionId(sectionId);
    localStorage.setItem(ACTIVE_SECTION_KEY, sectionId);
  }, []);

  const activeMembership = memberships.find((m) => m.sectionId === activeSectionId) || null;

  const value = {
    user,
    memberships,
    activeSectionId,
    activeMembership,
    isClassAdmin: activeMembership?.role === "cr" || activeMembership?.role === "sr",
    loading,
    error,
    login,
    register,
    logout,
    refreshMe,
    switchSection,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
