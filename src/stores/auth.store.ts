// src/stores/auth.store.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UserInfo, UserRole, LoginRequest, RegisterRequest } from '../types';
import { authApi } from '../api/auth.api';

export const useAuthStore = defineStore('auth', () => {
  const savedUser = localStorage.getItem('user');
  let initialUser: UserInfo | null = null;
  try {
    initialUser = savedUser ? JSON.parse(savedUser) : null;
  } catch {
    initialUser = null;
  }

  // State
  const token = ref<string | null>(localStorage.getItem('access_token'));
  const user = ref<UserInfo | null>(initialUser);
  const loading = ref<boolean>(false);

  // Getters
  const isAuthenticated = computed(() => !!token.value);
  const userRole = computed(() => user.value?.role?.toUpperCase() ?? null);
  const permissions = computed(() => user.value?.permissions ?? []);

  // Actions
  function setAuth(accessToken: string, userInfo: UserInfo, refreshToken?: string) {
    token.value = accessToken;
    user.value = userInfo;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('user', JSON.stringify(userInfo));
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
  }

  async function login(credentials: LoginRequest) {
    loading.value = true;
    try {
      const response = await authApi.login(credentials);
      setAuth(response.accessToken, response.user, response.refreshToken);
      return response.user;
    } finally {
      loading.value = false;
    }
  }

  async function register(data: RegisterRequest) {
    loading.value = true;
    try {
      const response = await authApi.register(data);
      setAuth(response.accessToken, response.user, response.refreshToken);
      return response.user;
    } finally {
      loading.value = false;
    }
  }

  async function fetchProfile() {
    if (!token.value) return null;
    try {
      const profile = await authApi.getProfile();
      user.value = profile;
      localStorage.setItem('user', JSON.stringify(profile));
      return profile;
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      // Only logout if token is truly rejected by server (401)
      if (error?.response?.status === 401) {
        logout();
      }
      return null;
    }
  }

  async function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    try {
      await authApi.logout();
    } catch {
      // ignore network error on logout
    }
  }

  function hasRole(role: UserRole | string): boolean {
    if (!user.value?.role) return false;
    return user.value.role.toUpperCase() === role.toUpperCase();
  }

  function hasAnyRole(roles: (UserRole | string)[]): boolean {
    if (!user.value?.role) return false;
    const current = user.value.role.toUpperCase();
    return roles.map((r) => r.toUpperCase()).includes(current);
  }

  function hasPermission(permissionCode: string): boolean {
    if (user.value?.role?.toUpperCase() === 'ADMIN') return true;
    return permissions.value.includes(permissionCode);
  }

  return {
    token,
    user,
    loading,
    isAuthenticated,
    userRole,
    permissions,
    setAuth,
    login,
    register,
    fetchProfile,
    logout,
    hasRole,
    hasAnyRole,
    hasPermission,
  };
});
