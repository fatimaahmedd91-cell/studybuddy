"use client";

// Who is logged in. The login token is kept in this browser (localStorage), so a refresh
// keeps you logged in. Any page can call useAuth() to read your profile or log out.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import type { OwnProfile } from "./types";

type AuthState = {
  status: "loading" | "anonymous" | "ready";
  me: OwnProfile | null;
  startSession: (token: string, user: OwnProfile) => void;
  setMe: (user: OwnProfile) => void;
  refreshMe: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [me, setMeState] = useState<OwnProfile | null>(null);

  const logout = useCallback(() => {
    setToken(null);
    setMeState(null);
    setStatus("anonymous");
  }, []);

  // On first load: if there is a saved token, ask the server who it belongs to.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) {
      setStatus("anonymous");
      return;
    }
    api
      .me()
      .then((user) => {
        setMeState(user);
        setStatus("ready");
      })
      .catch(() => logout());
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const value: AuthState = {
    status,
    me,
    startSession: (token, user) => {
      setToken(token);
      setMeState(user);
      setStatus("ready");
    },
    setMe: setMeState,
    refreshMe: async () => setMeState(await api.me()),
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}

// For pages that only render when logged in (AppShell makes sure of that).
export function useMe() {
  const { me } = useAuth();
  if (!me) throw new Error("useMe needs a logged-in user");
  return me;
}
