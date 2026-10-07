import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

// PO 07/10/2026: every screen shows real backend data only. These guard the
// spots that used to make values up: seed credentials on the login page, a
// 5-star rating and a 100% reliability for technicians nobody has rated, and
// "always available" when the server did not say.
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../src/api/client', () => ({
  default: { get, post: vi.fn(), patch: vi.fn() },
  getHttpStatus: () => undefined,
  registerAuthSessionInvalidator: vi.fn(),
  registerTokenRefreshed: vi.fn(),
}));

import LoginPage from '../src/pages/auth/LoginPage.vue';
import { technicianProfileApi } from '../src/api/technician-profile.api';
import { NO_RATING_LABEL, hasRating, ratingLabel } from '../src/utils/formatters';

describe('Login page', () => {
  it('offers no demo accounts and exposes no seed credentials', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: ['/', '/login', '/register', '/forgot-password'].map((path) => ({ path, component: { template: '<div />' } })),
    });
    await router.push('/login');
    await router.isReady();
    const wrapper = mount(LoginPage, {
      global: { plugins: [createPinia(), router], stubs: { GoogleSignInButton: true } },
    });

    const html = wrapper.html();
    expect(wrapper.text()).not.toContain('Tài khoản Demo');
    expect(html).not.toContain('Password123!');
    expect(html).not.toContain('@fixhome.vn');
    wrapper.unmount();
  });
});

describe('Ratings without reviews', () => {
  it('labels a null or unreviewed rating as "Chưa có đánh giá"', () => {
    expect(NO_RATING_LABEL).toBe('Chưa có đánh giá');
    expect(ratingLabel(null)).toBe('Chưa có đánh giá');
    expect(ratingLabel(undefined)).toBe('Chưa có đánh giá');
    expect(ratingLabel(0)).toBe('Chưa có đánh giá');
    expect(ratingLabel(4.8, 0)).toBe('Chưa có đánh giá');
    expect(ratingLabel(null, 3)).toBe('Chưa có đánh giá');
    expect(ratingLabel(4.75, 12)).toBe('4.8');
    expect(ratingLabel('4.5')).toBe('4.5');
    expect(hasRating(null, 0)).toBe(false);
    expect(hasRating(4.2, 5)).toBe(true);
  });

  it('keeps the technician profile honest when the server sends nulls', async () => {
    get.mockResolvedValueOnce({
      data: {
        data: {
          bio: null,
          yearsExperience: 2,
          averageRating: null,
          ratingCount: 0,
          reliabilityScore: null,
          serviceRadiusKm: 10,
          skills: [],
          serviceAreas: [],
          schedules: [],
        },
      },
    });
    const profile = await technicianProfileApi.getMyProfile();
    expect(profile.averageRating).toBeNull();
    expect(profile.reliabilityScore).toBeNull();
    expect(profile.isAvailable).toBeNull();
    expect(ratingLabel(profile.averageRating, profile.ratingCount)).toBe('Chưa có đánh giá');
  });

  it('ignores a stored average when there are no reviews behind it', async () => {
    get.mockResolvedValueOnce({
      data: { data: { averageRating: 5, ratingCount: 0, reliabilityScore: 87, isAvailable: false } },
    });
    const profile = await technicianProfileApi.getMyProfile();
    expect(profile.averageRating).toBeNull();
    expect(profile.reliabilityScore).toBe(87);
    expect(profile.isAvailable).toBe(false);
  });
});
