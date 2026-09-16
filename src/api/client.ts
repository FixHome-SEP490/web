// src/api/client.ts
import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosResponse, type AxiosError } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const AUTH_SESSION_INVALIDATED_EVENT = 'fixhome:auth-session-invalidated';

type AuthSessionInvalidator = () => void;

let authSessionInvalidator: AuthSessionInvalidator | null = null;
let tokenRefreshed: ((token: string) => void) | null = null;
let refreshing: Promise<string> | null = null;

export function registerTokenRefreshed(callback: ((token: string) => void) | null) {
  tokenRefreshed = callback;
}

export function registerAuthSessionInvalidator(invalidator: AuthSessionInvalidator | null) {
  authSessionInvalidator = invalidator;
}

export function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) return undefined;

  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === 'number' ? response.status : undefined;
}

function invalidateAuthSession() {
  if (authSessionInvalidator) {
    authSessionInvalidator();
  } else {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_INVALIDATED_EVENT));
  }
}

// Request interceptor – attach JWT token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor – handle errors
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    if (getHttpStatus(error) !== 401) return Promise.reject(error);
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (original?.url === '/auth/login' || original?.url === '/auth/register') return Promise.reject(error);
    const refreshToken = localStorage.getItem('refresh_token');
    if (!original || original._retry || !refreshToken) {
      invalidateAuthSession();
      return Promise.reject(error);
    }
    original._retry = true;
    try {
      refreshing ??= axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken }, { timeout: 15000 })
        .then(response => {
          const data = response.data.data;
          if (typeof data?.accessToken !== 'string' || !data.accessToken || typeof data?.refreshToken !== 'string' || !data.refreshToken) throw new Error('Invalid refresh response');
          localStorage.setItem('access_token', data.accessToken);
          localStorage.setItem('refresh_token', data.refreshToken);
          tokenRefreshed?.(data.accessToken);
          return data.accessToken as string;
        }).finally(() => { refreshing = null; });
      const token = await refreshing;
      original.headers.Authorization = `Bearer ${token}`;
      return apiClient(original);
    } catch (refreshError) {
      invalidateAuthSession();
      return Promise.reject(refreshError);
    }
  },
);

export default apiClient;
