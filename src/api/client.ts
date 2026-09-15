// src/api/client.ts
import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';

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
  (error) => {
    if (getHttpStatus(error) === 401) {
      invalidateAuthSession();
    }
    return Promise.reject(error);
  },
);

export default apiClient;
