import { describe, expect, it } from 'vitest';
import router from '../src/router';

describe('Service Manager Support routes', () => {
  it.each([
    ['support-queue', '/console/support'],
    ['support-detail', '/console/support/:id'],
    ['support-cash-detail', '/console/support/cash/:id'],
  ])('registers %s as SERVICE_MANAGER-only', (name, path) => {
    const route = router.getRoutes().find((item) => item.name === name);

    expect(route).toBeDefined();
    expect(route?.path).toBe(path);
    expect(route?.meta.roles).toEqual(['SERVICE_MANAGER']);
  });
});
