import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { RouteLocationNormalized } from 'vue-router';
import router from '../src/router';
import { authGuard } from '../src/router/guards';
import { useAuthStore } from '../src/stores/auth';
import { UserRole } from '../src/types';

describe('Service Manager Support routes', () => {
  it.each([
    ['support-cash-detail', '/console/support/cash/:id'],
  ])('registers %s as SERVICE_MANAGER-only', (name, path) => {
    const route = router.getRoutes().find((item) => item.name === name);

    expect(route).toBeDefined();
    expect(route?.path).toBe(path);
    expect(route?.meta.roles).toEqual(['SERVICE_MANAGER']);
  });

  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

  it.each([
    ['support-queue', '/console/support'], ['support-detail', '/console/support/:id'],
  ])('opens %s for staff with the existing read permission', (name, path) => {
    const route = router.getRoutes().find(item => item.name === name);
    expect(route?.path).toBe(path);
    expect(route?.meta.roles).toEqual(['SERVICE_MANAGER', 'ADMIN']);
    expect(route?.meta.permission).toBe('support:read_all');
  });

  it.each([
    [UserRole.ADMIN, '/console/support', true],
    [UserRole.ADMIN, '/console/support/case-1', true],
    [UserRole.ADMIN, '/console/support/cash/case-1', false],
    [UserRole.ADMIN, '/console/part-returns', false],
    [UserRole.SERVICE_MANAGER, '/console/support/case-1', true],
    [UserRole.SERVICE_MANAGER, '/console/part-returns', true],
    [UserRole.CUSTOMER, '/console/support', false],
    [UserRole.CUSTOMER, '/console/support/case-1', false],
    [UserRole.TECHNICIAN, '/console/support/case-1', false],
  ])('gates direct URL %s %s', async (role, path, allowed) => {
    useAuthStore().setAuth('test-token', { id: 'user-1', email: 'user@example.test', fullName: 'Test User',
      status: 'ACTIVE', role, permissions: ['support:read_all', 'support:resolve'],
    });
    const next = vi.fn();
    const target = router.resolve(path) as unknown as RouteLocationNormalized;
    await authGuard(target, target, next);
    expect(next.mock.calls).toEqual(allowed ? [[]] : [['/403']]);
  });

  it('denies a manager without support read permission and a guest deep link', async () => {
    const auth = useAuthStore();
    auth.setAuth('test-token', { id: 'sm-1', email: 'sm@example.test', fullName: 'Test Manager', status: 'ACTIVE', role: UserRole.SERVICE_MANAGER, permissions: [] });
    const target = router.resolve('/console/support/case-1') as unknown as RouteLocationNormalized;
    const next = vi.fn();
    await authGuard(target, target, next);
    expect(next).toHaveBeenLastCalledWith('/403');
    auth.token = null;
    auth.user = null;
    await authGuard(target, target, next);
    expect(next).toHaveBeenLastCalledWith({ path: '/login', query: { redirect: '/console/support/case-1' } });
  });
});
