import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import * as SecureStore from "expo-secure-store";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  ACCESS_TOKEN_KEY,
  CSRF_TOKEN_KEY,
  clearSession,
  onSessionExpired,
  setAccessToken,
  setSession,
} from "../api/client";
import type { Parent } from "../types/models";
import { unregisterPushToken } from "./pushNotifications";

type AuthContextValue = {
  parent: Parent | null;
  loading: boolean;
  signIn: (
    school: string,
    email: string,
    password: string,
  ) => Promise<{ requiresTwoFactor: boolean; challengeToken?: string }>;
  verifyCode: (challengeToken: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [parent, setParent] = useState<Parent | null>(null);
  const [loading, setLoading] = useState(true);

  const loadParent = useCallback(async (token: string, csrf?: string) => {
    if (csrf) await setSession(token, csrf);
    else await setAccessToken(token);
    const response = await api.get<Parent>("/auth/me");
    if (response.data.role !== "parent") {
      await clearSession();
      throw new Error(
        "This app is for a parent or guardian account. Please sign in with your parent account.",
      );
    }
    setParent(response.data);
  }, []);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
      .then(async (token) => {
        if (!token) return;
        const csrf = await SecureStore.getItemAsync(CSRF_TOKEN_KEY);
        try {
          let currentToken = token;
          let currentCsrf = csrf;
          if (csrf) {
            try {
              const { data } = await api.post<{
                access_token: string;
                csrf_token: string;
              }>("/auth/refresh", {}, { headers: { "X-CSRF-Token": csrf } });
              currentToken = data.access_token;
              currentCsrf = data.csrf_token;
            } catch {
              /* The saved access token may still be valid if native cookie storage is unavailable. */
            }
          }
          await loadParent(currentToken, currentCsrf ?? undefined);
        } catch {
          await clearSession();
          if (active) setParent(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadParent]);

  useEffect(() => {
    onSessionExpired(() => {
      queryClient.clear();
      setParent(null);
    });
    return () => onSessionExpired(null);
  }, [queryClient]);

  const signIn = useCallback(
    async (school: string, email: string, password: string) => {
      const { data } = await api.post<{
        access_token?: string;
        csrf_token?: string;
        requires_two_factor?: boolean;
        challenge_token?: string;
      }>("/auth/login", {
        school_slug: school.trim(),
        email: email.trim(),
        password,
      });
      if (data.requires_two_factor && data.challenge_token)
        return {
          requiresTwoFactor: true,
          challengeToken: data.challenge_token,
        };
      if (!data.access_token)
        throw new Error("The login response was incomplete. Please try again.");
      await loadParent(data.access_token, data.csrf_token);
      return { requiresTwoFactor: false };
    },
    [loadParent],
  );

  const verifyCode = useCallback(
    async (challengeToken: string, code: string) => {
      const { data } = await api.post<{
        access_token: string;
        csrf_token: string;
      }>("/auth/login/verify-totp", { challenge_token: challengeToken, code });
      await loadParent(data.access_token, data.csrf_token);
    },
    [loadParent],
  );

  const signOut = useCallback(async () => {
    const csrf = await SecureStore.getItemAsync(CSRF_TOKEN_KEY);
    try {
      await unregisterPushToken();
    } catch {
      /* Network cleanup can be retried after the next sign-in. */
    }
    try {
      await api.post(
        "/auth/logout",
        {},
        { headers: csrf ? { "X-CSRF-Token": csrf } : {} },
      );
    } finally {
      await clearSession();
      queryClient.clear();
      setParent(null);
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ parent, loading, signIn, verifyCode, signOut }),
    [parent, loading, signIn, verifyCode, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
