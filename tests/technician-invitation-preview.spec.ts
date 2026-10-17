import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { mockGet, push } = vi.hoisted(() => ({ mockGet: vi.fn(), push: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get: mockGet, post: vi.fn() }, AUTH_SESSION_INVALIDATED_EVENT: 'auth-invalidated' }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));

import { bookingsApi } from '../src/api/bookings.api';
import TechnicianInvitationsPage from '../src/pages/technician/TechnicianInvitationsPage.vue';

const videoMedia = { id: 'media-video', url: null, isPrivate: true, legacyInsecure: false, mimeType: 'video/mp4', sizeBytes: 2048 };
const aiSummary = {
  deviceName: 'Vòi nước', customerText: 'vòi rỉ nước', suspectedFaults: ['Hỏng gioăng'], suggestedActions: [],
  conclusion: null, priceMin: 150000, priceMax: 300000, requiresAssessment: false, recommendedServiceName: null,
  photoCount: 1, notes: ['Khách đã thử siết chặt'], recordedAt: '2030-01-01T07:00:00.000Z',
};
const preview = {
  id: 'booking-synthetic', province: 'Synthetic Province', district: 'Synthetic District',
  serviceName: 'Synthetic repair', quantity: 2, urgency: 'high',
  preferredStartAt: '2030-01-01T09:00:00.000Z', preferredEndAt: '2030-01-01T10:00:00.000Z',
  bookingMode: 'scheduled', slot: 'morning',
  // PO 18/10/2026: these help the technician decide before accepting.
  description: 'Vòi rửa chén rỉ nước dưới chân', aiSummary,
  media: [videoMedia, { url: 'PRIVATE_IMAGE_URL' }, { id: 'm2', url: 'PRIVATE_LEAKED_URL', isPrivate: true, legacyInsecure: false, mimeType: 'image/png' }],
  pricingMode: 'fixed_price', fixedUnitPrice: '250000', distanceBand: { minKm: 3, maxKm: 5 },
  // These never reach the preview, whatever the server sends.
  customerNote: 'PRIVATE_NOTE', customerId: 'PRIVATE_CUSTOMER_ID', addressTextSnapshot: 'PRIVATE_HOUSE_NUMBER',
  latitudeSnapshot: 10.123, longitudeSnapshot: 106.123, diagnosis: { rawResponse: 'PRIVATE_AI' },
};
const invitation = {
  id: 'invite-synthetic', bookingId: 'booking-synthetic', priorityOrder: 1,
  status: 'pending', invitedAt: '2030-01-01T08:00:00.000Z',
  expiresAt: '2030-01-01T08:30:00.000Z', booking: preview,
  technicianId: 'PRIVATE_TECH_ID',
};

beforeEach(() => {
  mockGet.mockReset();
  push.mockReset();
  mockGet.mockImplementation(async (url: string) => {
    if (url.includes('/media/')) return { data: new Blob(['clip'], { type: 'video/mp4' }) };
    if (url === '/invitations/my') return { data: { data: [invitation] } };
    return { data: { data: null } };
  });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:clip'), revokeObjectURL: vi.fn() }));
});

describe('WEB technician invitation preview (PO 18/10/2026)', () => {
  it('maps the preview into an allowlisted invitation: the job in full, never the address or the customer', async () => {
    const result = await bookingsApi.getMyInvitations();
    expect(mockGet).toHaveBeenCalledWith('/invitations/my');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('PENDING');
    expect(result[0].booking).toEqual({
      id: 'booking-synthetic', serviceName: 'Synthetic repair',
      addressSummary: 'Synthetic District, Synthetic Province',
      quantity: 2, urgency: 'high',
      preferredStartAt: preview.preferredStartAt, preferredEndAt: preview.preferredEndAt,
      bookingMode: 'scheduled', slot: 'morning',
      description: 'Vòi rửa chén rỉ nước dưới chân', aiSummary,
      // Malformed items and a "private" item that carries a URL are dropped.
      media: [videoMedia],
      pricingMode: 'fixed_price', fixedUnitPrice: 250000, distanceBand: { minKm: 3, maxKm: 5 },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  });

  it('shows the area with an estimated distance, the description, the price basis, the media and the AI summary', async () => {
    const wrapper = mount(TechnicianInvitationsPage, {
      global: { stubs: { FhCountdown: true, FhButton: true } },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Synthetic repair');
    expect(wrapper.text()).toContain('Synthetic District, Synthetic Province');
    expect(wrapper.get('[data-testid="invitation-distance"]').text()).toBe('Cách bạn khoảng 3-5 km');
    expect(wrapper.get('[data-testid="invitation-description"]').text()).toBe('Vòi rửa chén rỉ nước dưới chân');
    // The session the technician commits to by accepting (PO 08/10/2026).
    expect(wrapper.get('[data-testid="invitation-session"]').text()).toContain('Buổi sáng (8:00 - 12:00)');
    expect(wrapper.text()).not.toContain('PRIVATE_');

    await wrapper.get('button.w-full').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="invitation-detail-description"]').text()).toBe('Vòi rửa chén rỉ nước dưới chân');
    expect(wrapper.get('[data-testid="invitation-detail-distance"]').text()).toBe('Cách bạn khoảng 3-5 km');
    expect(wrapper.get('[data-testid="invitation-detail-price"]').text()).toMatch(/Giá niêm yết\s*250\.000\s*₫\s*× 2/);
    expect(wrapper.get('[data-testid="booking-media-viewer"]').text()).toContain('Ảnh và video hiện trường');
    expect(wrapper.find('video').exists()).toBe(true);
    expect(mockGet).toHaveBeenCalledWith('/bookings/booking-synthetic/media/media-video/content', { responseType: 'blob' });
    expect(wrapper.get('[data-testid="invitation-detail-privacy"]').text()).toBe('Địa chỉ cụ thể, số điện thoại và ghi chú riêng của khách hiện sau khi bạn nhận đơn.');

    await wrapper.get('[data-testid="invitation-detail-ai-summary"]').trigger('click');
    expect(wrapper.find('[data-testid="ai-summary-dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Hỏng gioăng');
    expect(wrapper.text()).not.toContain('PRIVATE_');
    expect(wrapper.find('a[href="PRIVATE_IMAGE_URL"]').exists()).toBe(false);
    // No raw booking id posing as an order code, no jargon.
    expect(wrapper.text()).not.toContain('booking-synthetic');
    expect(wrapper.text()).not.toMatch(/TTL|Inbox/);
    wrapper.unmount();
  });

  it('says under 1 km plainly and falls back to a quote after inspection', async () => {
    const near = { ...invitation, booking: { ...preview, distanceBand: { minKm: 0, maxKm: 1 }, pricingMode: 'inspection_required', fixedUnitPrice: null, aiSummary: null, media: [], description: '' } };
    mockGet.mockImplementation(async () => ({ data: { data: [near] } }));
    const wrapper = mount(TechnicianInvitationsPage, { global: { stubs: { FhCountdown: true, FhButton: true } } });
    await flushPromises();
    expect(wrapper.get('[data-testid="invitation-distance"]').text()).toBe('Cách bạn dưới 1 km');
    expect(wrapper.find('[data-testid="invitation-description"]').exists()).toBe(false);
    await wrapper.get('button.w-full').trigger('click');
    expect(wrapper.get('[data-testid="invitation-detail-price"]').text()).toBe('Báo giá sau khi kiểm tra tại nhà khách');
    expect(wrapper.text()).toContain('Khách chưa ghi mô tả.');
    expect(wrapper.find('[data-testid="invitation-detail-ai-summary"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="booking-media-viewer"]').exists()).toBe(false);
  });

  it('says "hơn 40 km" for the open band and drops a band that makes no sense', async () => {
    mockGet.mockImplementation(async () => ({ data: { data: [
      { ...invitation, id: 'far', booking: { ...preview, distanceBand: { minKm: 40, maxKm: null } } },
      { ...invitation, id: 'odd', booking: { ...preview, distanceBand: { minKm: 5, maxKm: 3 } } },
      { ...invitation, id: 'exact', booking: { ...preview, distanceBand: undefined, distanceKm: 3.24 } },
    ] } }));
    const result = await bookingsApi.getMyInvitations();
    expect(result.map((i) => i.booking?.distanceBand)).toEqual([{ minKm: 40, maxKm: null }, null, null]);
    const wrapper = mount(TechnicianInvitationsPage, { global: { stubs: { FhCountdown: true, FhButton: true } } });
    await flushPromises();
    expect(wrapper.findAll('[data-testid="invitation-distance"]').map((n) => n.text())).toEqual(['Cách bạn hơn 40 km']);
  });

  it('shows no distance when the server could not measure it', async () => {
    const unknown = { ...invitation, booking: { ...preview, distanceBand: null } };
    mockGet.mockImplementation(async () => ({ data: { data: [unknown] } }));
    const wrapper = mount(TechnicianInvitationsPage, { global: { stubs: { FhCountdown: true, FhButton: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain('Synthetic District, Synthetic Province');
    expect(wrapper.find('[data-testid="invitation-distance"]').exists()).toBe(false);
  });
});
