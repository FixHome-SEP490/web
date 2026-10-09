import { describe, expect, it } from 'vitest';
import router from '../src/router';

// Console pages added for the admin on 09/10/2026 and who may open them.
describe('Admin console routes (PO 09/10/2026)', () => {
  const route = (name: string) => router.getRoutes().find((item) => item.name === name);

  it.each([
    ['admin-customer-wallets', '/console/admin/customer-wallets'],
    ['admin-payments', '/console/admin/payments'],
    ['admin-reviews', '/console/admin/reviews'],
  ])('%s is at %s and only for the admin', (name, path) => {
    expect(route(name)?.path).toBe(path);
    expect(route(name)?.meta.roles).toEqual(['ADMIN']);
  });

  it('lets the admin read the warranty queue next to the service manager', () => {
    expect(route('console-warranty')?.path).toBe('/console/warranty');
    expect(route('console-warranty')?.meta.roles).toEqual(['SERVICE_MANAGER', 'ADMIN']);
  });
});
