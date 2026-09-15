import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { UserInfo } from '../src/types';
import { UserRole } from '../src/types';
import apiClient from '../src/api/client';

const authApiMock = vi.hoisted(() => ({
  getProfile: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../src/api/auth.api', () => ({ authApi: authApiMock }));

import { useAuthStore as useAuthStoreFromStore } from '../src/stores/auth.store';
import { useAuthStore as useAuthStoreFromAlias } from '../src/stores/auth';
import router from '../src/router';

const adminUser: UserInfo = {
  id: 'admin-1',
  email: 'admin@fixhome.test',
  fullName: 'FixHome Admin',
  role: UserRole.ADMIN,
  status: 'ACTIVE',
};

describe('auth session and Admin navigation', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetAllMocks();
    setActivePinia(createPinia());
    await router.push('/login');
  });

  it('uses one Pinia store through the canonical module and re-export alias', () => {
    const canonicalStore = useAuthStoreFromStore();
    const aliasedStore = useAuthStoreFromAlias();

    expect(aliasedStore).toBe(canonicalStore);
  });

  it('inherits authentication metadata on Admin child routes', () => {
    const route = router.resolve('/console/admin/parts');

    expect(route.meta.requiresAuth).toBe(true);
    expect(route.meta.roles).toEqual(['ADMIN']);
  });

  it('keeps an authenticated Admin session while navigating Console and two Admin pages', async () => {
    const authStore = useAuthStoreFromStore();
    authStore.setAuth('admin-token', adminUser);

    await router.push('/console');
    expect(router.currentRoute.value.path).toBe('/console');

    await router.push('/console/admin/parts');
    expect(router.currentRoute.value.path).toBe('/console/admin/parts');

    await router.push('/console/admin/users');
    expect(router.currentRoute.value.path).toBe('/console/admin/users');
    expect(authStore.isAuthenticated).toBe(true);
    expect(authStore.user).toEqual(adminUser);
  });

  it('does not destroy a persisted session when profile hydration has a transient error', async () => {
    localStorage.setItem('access_token', 'persisted-token');
    setActivePinia(createPinia());
    const authStore = useAuthStoreFromStore();
    authApiMock.getProfile.mockRejectedValueOnce(new Error('network unavailable'));

    await router.push('/console');

    expect(router.currentRoute.value.path).toBe('/login');
    expect(authStore.isAuthenticated).toBe(true);
    expect(localStorage.getItem('access_token')).toBe('persisted-token');
    expect(authApiMock.logout).not.toHaveBeenCalled();
  });

  it('preserves the session and routes a forbidden profile to /403', async () => {
    localStorage.setItem('access_token', 'persisted-token');
    setActivePinia(createPinia());
    const authStore = useAuthStoreFromStore();
    authApiMock.getProfile.mockRejectedValueOnce({ response: { status: 403 } });

    await router.push('/console');

    expect(router.currentRoute.value.path).toBe('/403');
    expect(authStore.isAuthenticated).toBe(true);
    expect(localStorage.getItem('access_token')).toBe('persisted-token');
    expect(authApiMock.logout).not.toHaveBeenCalled();
  });

  it('clears a persisted session when profile returns a genuine 401', async () => {
    localStorage.setItem('access_token', 'expired-token');
    setActivePinia(createPinia());
    const authStore = useAuthStoreFromStore();
    authApiMock.getProfile.mockRejectedValueOnce({ response: { status: 401 } });

    await router.push('/console');

    expect(router.currentRoute.value.path).toBe('/login');
    expect(authStore.isAuthenticated).toBe(false);
    expect(authStore.user).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('invalidates the store on a client 401 without a hard login redirect', async () => {
    const authStore = useAuthStoreFromStore();
    authStore.setAuth('expired-token', adminUser);
    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = vi.fn().mockRejectedValue({ response: { status: 401 } });

    try {
      await expect(apiClient.get('/admin/parts')).rejects.toMatchObject({ response: { status: 401 } });
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }

    expect(authStore.isAuthenticated).toBe(false);
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(router.currentRoute.value.path).toBe('/login');
  });
});
