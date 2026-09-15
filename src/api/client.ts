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

// Response interceptor – handle errors & auto-refresh token
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config;

    // Do not intercept auth endpoints 401 (e.g. wrong password on login)
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !isAuthEndpoint && !originalRequest?._retry) {
      const refreshToken = localStorage.getItem('refresh_token');

      if (refreshToken) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              return apiClient(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
          const newAccessToken = res.data?.data?.accessToken || res.data?.accessToken;
          const newRefreshToken = res.data?.data?.refreshToken || res.data?.refreshToken;

          if (newAccessToken) {
            localStorage.setItem('access_token', newAccessToken);
            if (newRefreshToken) {
              localStorage.setItem('refresh_token', newRefreshToken);
            }
            apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            }
            processQueue(null, newAccessToken);
            return apiClient(originalRequest);
          }
        } catch (refreshErr) {
          processQueue(refreshErr, null);
        } finally {
          isRefreshing = false;
        }
      }

      // If refresh failed or no refresh token, clean up and redirect
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
