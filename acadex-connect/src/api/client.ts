import { create, isAxiosError } from "axios";
import * as SecureStore from "expo-secure-store";

const baseURL = process.env.EXPO_PUBLIC_API_URL?.trim();
let accessToken: string | null = null;
export const ACCESS_TOKEN_KEY = "acadex-connect.access-token";
export const CSRF_TOKEN_KEY = "acadex-connect.csrf-token";
let unauthorizedHandler: (() => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const api = create({
  baseURL: baseURL
    ? `${baseURL.replace(/\/$/, "")}/api/v1`
    : "http://localhost:8001/api/v1",
  timeout: 15_000,
  withCredentials: true,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

async function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    const csrf = await SecureStore.getItemAsync(CSRF_TOKEN_KEY);
    if (!csrf) return null;
    try {
      const { data } = await api.post<{
        access_token: string;
        csrf_token: string;
      }>(
        `${api.defaults.baseURL}/auth/refresh`,
        {},
        {
          timeout: 15_000,
          withCredentials: true,
          headers: { "X-CSRF-Token": csrf },
        },
      );
      await setSession(data.access_token, data.csrf_token);
      return data.access_token;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError(error) || error.response?.status !== 401) throw error;
    const config = error.config as typeof error.config & {
      _acadexRetried?: boolean;
    };
    if (
      !config ||
      config._acadexRetried ||
      String(config.url ?? "").includes("/auth/")
    ) {
      if (config && !String(config.url ?? "").includes("/auth/"))
        unauthorizedHandler?.();
      throw error;
    }
    config._acadexRetried = true;
    const fresh = await refreshAccessToken();
    if (!fresh) {
      await clearSession();
      unauthorizedHandler?.();
      throw error;
    }
    config.headers.Authorization = `Bearer ${fresh}`;
    return api.request(config);
  },
);

export async function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

export async function setSession(access: string, csrf: string) {
  accessToken = access;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access),
    SecureStore.setItemAsync(CSRF_TOKEN_KEY, csrf),
  ]);
}

export async function clearSession() {
  accessToken = null;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(CSRF_TOKEN_KEY),
  ]);
}

export function onSessionExpired(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export function apiErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (error.code === "ECONNABORTED")
      return "The connection timed out. Please try again.";
    if (!error.response)
      return "We could not reach the school. Check your connection and try again.";
    return `Something went wrong (${error.response.status}). Please try again.`;
  }
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
