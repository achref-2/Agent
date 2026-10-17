import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { AiStatus, User } from "./types";

interface AuthState {
  user: User | null;
  ai: AiStatus | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ user: User; ai: AiStatus }>("/settings");
      setUser(res.user);
      setAi(res.ai);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUnauthorized = () => setUser(null);
    window.addEventListener("gm:unauthorized", onUnauthorized);
    return () => window.removeEventListener("gm:unauthorized", onUnauthorized);
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, ai, loading, setUser, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
