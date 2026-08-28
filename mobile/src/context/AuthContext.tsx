import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "expo-router";
import { api, loadToken, setToken, clearToken } from "@/lib/api";
import { registerForPushNotifications } from "@/lib/pushNotifications";
import { User } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = async () => {
    try {
      const token = await loadToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      const data = await api.getMe();
      setUser(data as User);
      registerForPushNotifications();
    } catch {
      await clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    await setToken(res.access_token);
    setUser(res.user as User);
    registerForPushNotifications();
    router.replace("/(tabs)/feed");
  };

  const signup = async (data: Record<string, unknown>) => {
    const res = await api.signup(data);
    await setToken(res.access_token);
    setUser(res.user as User);
    registerForPushNotifications();
    router.replace("/(tabs)/feed");
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
    router.replace("/(auth)/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
