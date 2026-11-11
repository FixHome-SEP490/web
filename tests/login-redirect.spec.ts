import { describe, expect, it } from 'vitest';
import router from '../src/router';
import { usableLoginRedirect } from '../src/utils/login-redirect';

describe('redirect after signing in (BUG DETECTOR 67)', () => {
  it('follows a page the signed-in role may open', () => {
    expect(usableLoginRedirect(router, '/app/bookings/new', 'customer')).toBe('/app/bookings/new');
    expect(usableLoginRedirect(router, '/tech', 'TECHNICIAN')).toBe('/tech');
  });

  it("ignores another role's page left by an expired session, so no access-denied page", () => {
    expect(usableLoginRedirect(router, '/tech', 'customer')).toBeNull();
    expect(usableLoginRedirect(router, '/app/bookings/new', 'technician')).toBeNull();
  });

  it('ignores outside sites, unknown pages and the login page itself', () => {
    expect(usableLoginRedirect(router, 'https://evil.example', 'customer')).toBeNull();
    expect(usableLoginRedirect(router, '//evil.example/app', 'customer')).toBeNull();
    expect(usableLoginRedirect(router, '/khong-co-trang-nay', 'customer')).toBeNull();
    expect(usableLoginRedirect(router, '/login', 'customer')).toBeNull();
    expect(usableLoginRedirect(router, undefined, 'customer')).toBeNull();
  });
});
