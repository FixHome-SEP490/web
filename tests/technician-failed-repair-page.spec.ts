import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get, post, patch: vi.fn(), delete: vi.fn() }, getHttpStatus: (e: { response?: { status?: number } }) => e?.response?.status }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'order-B' } }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn(), conversations: [] }) }));
import TechnicianJobDetailPage from '../src/pages/technician/TechnicianJobDetailPage.vue';
enableAutoUnmount(afterEach);
const order = () => ({ id: 'order-B', code: 'FH-B', bookingId: 'booking-B', serviceName: 'Máy B', status: 'under_repair', pricingMode: 'inspection_required', customerName: 'Fixture', customerPhone: '', addressSummary: 'Fixture', scheduledAt: '2026-10-27T02:00:00Z', createdAt: '2026-10-27T01:00:00Z', laborTotal: 100000, partsTotal: 0, grandTotal: 100000, paymentStatus: 'unpaid', quotation: { id: 'quote-B', status: 'approved', laborTotal: 100000, partsTotal: 0, items: [] } });
async function render(overrides = {}, partsReady = true, parts: unknown[] = []) {
  get.mockImplementation(async (path: string) => {
    if (path === '/service-orders/order-B') return { data: { data: { ...order(), ...overrides } } };
    if (path === '/bookings/booking-B') return { data: { data: { id: 'booking-B', status: 'matched', media: [] } } };
    if (path === '/service-orders/order-B/part-requests') {
      if (!partsReady) throw { response: { status: 503 } };
      return { data: { data: parts } };
    }
    return { data: { data: path.endsWith('/invoice') || path.endsWith('/cash-settlement') ? null : [] } };
  });
  const w = mount(TechnicianJobDetailPage, { attachTo: document.body, global: { stubs: { Teleport: true, TechnicianPartsSection: true, BookingMediaViewer: true, AiSummaryDialog: true } } });
  await flushPromises();
  return w;
}
beforeEach(() => { get.mockReset(); post.mockReset(); });
it('page supplies the real technician adapter to the rendered dialog', async () => {
  post.mockResolvedValue({ data: { data: { id: 'order-B', status: 'cancelled', laborTotal: 0, partsTotal: 0, grandTotal: 0 } } });
  const w = await render();
  await w.get('[data-testid="job-more-button"]').trigger('click');
  await w.get('[data-testid="job-repair-failed-menu"]').trigger('click');
  expect(w.text()).not.toContain('Tải ảnh riêng tư hiện chưa sẵn sàng');
  await w.get('input[value="no_part"]').setValue(true);
  await w.get('[data-testid="repair-failed-confirm"]').trigger('click'); await flushPromises();
  expect(post.mock.calls).toEqual([['/service-orders/order-B/repair-failed', { reason: 'no_part', photoEvidenceIds: [], parts: [] }]]);
});
it.each([{ status: 'en_route' }, { quotation: { ...order().quotation, status: 'sent' } }, { completionRequestedAt: '2026-10-27T02:00:00Z' }, { historical: true, status: 'cancelled' }])('does not offer reporting for ineligible %j', async overrides => {
  const w = await render(overrides);
  const more = w.find('[data-testid="job-more-button"]');
  if (more.exists()) await more.trigger('click');
  expect(w.find('[data-testid="job-repair-failed-menu"]').exists()).toBe(false);
  expect(post).not.toHaveBeenCalled();
});
it('blocks reporting before the selected machine parts have been read', async () => {
  const w = await render({}, false);
  await w.get('[data-testid="job-more-button"]').trigger('click');
  await w.get('[data-testid="job-repair-failed-menu"]').trigger('click');
  await w.get('input[value="no_part"]').setValue(true);
  expect(w.get('[data-testid="repair-failed-confirm"]').attributes('disabled')).toBeDefined();
  expect(w.text()).toContain('Chưa kiểm tra được linh kiện');
  expect(post).not.toHaveBeenCalled();
});
it('declares only parts of selected B, without sending stock acceptance or requests for A/C', async () => {
  const parts = ['A', 'B', 'C'].map(id => ({ id: `part-${id}`, serviceOrderId: `order-${id}`, technicianId: 'tech', status: 'received', requestType: 'pre_repair', items: [{ id: `item-${id}`, partNameSnapshot: `Linh kiện ${id}`, quantity: 1, usageStatus: 'pending', partSource: 'fixhome' }] }));
  const w = await render({}, true, parts);
  post.mockResolvedValue({ data: { data: { id: 'order-B', status: 'cancelled', laborTotal: '0', partsTotal: '0', grandTotal: '0' } } });
  await w.get('[data-testid="job-more-button"]').trigger('click');
  await w.get('[data-testid="job-repair-failed-menu"]').trigger('click');
  const dialog = w.get('[data-testid="repair-failed-dialog"]');
  expect(dialog.findAll('select')).toHaveLength(1);
  expect(dialog.text()).toContain('Linh kiện B');
  expect(dialog.text()).not.toContain('Linh kiện A');
  expect(dialog.text()).not.toContain('Linh kiện C');
  await dialog.get('input[value="no_part"]').setValue(true);
  await dialog.get('select').setValue('returned');
  await flushPromises();
  expect(w.get('[data-testid="repair-failed-confirm"]').attributes('disabled'), w.text()).toBeUndefined();
  await w.get('[data-testid="repair-failed-confirm"]').trigger('click'); await flushPromises();
  expect(post.mock.calls).toEqual([['/service-orders/order-B/repair-failed', { reason: 'no_part', photoEvidenceIds: [], parts: [{ partRequestId: 'part-B', outcome: 'returned' }] }]]);
  expect(dialog.text()).toContain('chưa xác nhận kho đã nhận');
});
