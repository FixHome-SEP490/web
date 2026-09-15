import { describe, expect, it } from 'vitest';
import router from '../src/router';

describe('Admin Part Catalog route', () => {
  it('is registered at /console/admin/parts and restricted to ADMIN in route metadata', () => {
    const route = router.getRoutes().find((item) => item.name === 'admin-parts');

    expect(route).toBeDefined();
    expect(route?.path).toBe('/console/admin/parts');
    expect(route?.meta.roles).toEqual(['ADMIN']);
  });
});
