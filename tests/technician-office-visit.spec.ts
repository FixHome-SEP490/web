import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { api, push } = vi.hoisted(() => ({ api: { getMine: vi.fn(), book: vi.fn() }, push: vi.fn() }));
vi.mock('../src/api/technician-office-visit.api', () => ({ technicianOfficeVisitApi: api }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));

import TechnicianOfficeVisitPage from '../src/pages/technician/TechnicianOfficeVisitPage.vue';

const SLOT = '2026-12-01T02:00:00.000Z'; // 09:00 giờ Việt Nam
const base = {
  canBook: true, blocked: false, missedVisits: 0, maxMissedVisits: 2, supportPhone: '0900000001', current: null,
  offices: [
    { id: 'o1', name: 'Trụ sở Q1', address: '1 Lê Lợi', phone: null, distanceKm: 2.5, recommended: true, slots: [{ startsAt: SLOT, remaining: 2 }, { startsAt: '2026-12-01T03:00:00.000Z', remaining: 0 }] },
    { id: 'o2', name: 'Trụ sở Q7', address: '7 Nguyễn Thị Thập', phone: null, distanceKm: null, recommended: false, slots: [] },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('TechnicianOfficeVisitPage', () => {
  it('books the chosen office and time, skipping full slots', async () => {
    api.getMine.mockResolvedValue(base);
    api.book.mockResolvedValue({});
    const w = mount(TechnicianOfficeVisitPage);
    await flushPromises();
    expect(w.text()).toContain('Gần nhất');
    expect(w.find('[data-testid="visit-slot-2026-12-01T03:00:00.000Z"]').exists()).toBe(false);
    expect(w.get('[data-testid="visit-confirm"]').attributes('disabled')).toBeDefined();

    await w.get('[data-testid="visit-day-2026-12-01"]').trigger('click');
    await w.get(`[data-testid="visit-slot-${SLOT}"]`).trigger('click');
    await w.get('[data-testid="visit-confirm"]').trigger('click');
    await flushPromises();
    expect(api.book).toHaveBeenCalledWith('o1', SLOT);
  });

  it('shows the current visit with a way to change it', async () => {
    api.getMine.mockResolvedValue({ ...base, current: { id: 'v', officeId: 'o1', officeName: 'Trụ sở Q1', officeAddress: '1 Lê Lợi', officePhone: '028', scheduledAt: SLOT, status: 'scheduled' } });
    const w = mount(TechnicianOfficeVisitPage);
    await flushPromises();
    expect(w.get('[data-testid="visit-current-time"]').text()).toBe('09:00 ngày 01/12/2026');
    await w.get('[data-testid="visit-change"]').trigger('click');
    expect(w.find('[data-testid="visit-form"]').exists()).toBe(true);
  });

  it('blocks booking and offers the support phone after repeated no-shows', async () => {
    api.getMine.mockResolvedValue({ ...base, blocked: true, missedVisits: 2 });
    const w = mount(TechnicianOfficeVisitPage);
    await flushPromises();
    expect(w.get('[data-testid="visit-blocked"]').text()).toContain('0900000001');
    expect(w.find('[data-testid="visit-form"]').exists()).toBe(false);
  });

  it('goes back to the onboarding page', async () => {
    api.getMine.mockResolvedValue(base);
    const w = mount(TechnicianOfficeVisitPage);
    await flushPromises();
    await w.get('[data-testid="visit-back"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/tech/onboarding');
  });
});
