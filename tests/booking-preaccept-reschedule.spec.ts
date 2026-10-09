import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { BookingItem } from '../src/api/bookings.api';

// Rescheduling by session (PO 08/10/2026): morning 8-12 or afternoon 13-18 of
// one day, Vietnam time. Before a technician accepts the whole booking is
// editable; once one holds the order (not yet set out) only the session moves,
// and only to a session that technician is free for.
const { get, patch, post, push } = vi.hoisted(() => ({
  get: vi.fn(), patch: vi.fn(), post: vi.fn(), push: vi.fn(),
}));
vi.mock('../src/api/client', () => ({ default: { get, patch, post } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'booking-w1' } }), useRouter: () => ({ push }),
}));
import BookingDetailPage from '../src/pages/customer/BookingDetailPage.vue';

// 08:00 on 02/01/2030 in Vietnam: the morning session of that day.
const originalStart = '2030-01-02T01:00:00.000Z';
const originalEnd = '2030-01-02T05:00:00.000Z';
function booking(overrides: Partial<BookingItem> = {}): BookingItem {
  return {
    id: 'booking-w1', customerId: 'customer', serviceId: 'service', addressId: 'address',
    description: 'Original description', preferredAt: originalStart, preferredEndAt: originalEnd,
    bookingMode: 'scheduled', slot: 'morning',
    status: 'MATCHING', urgency: 'NORMAL', createdAt: '2030-01-01T00:00:00Z',
    invitations: [], ...overrides,
  };
}
const sessions = [
  { date: '2030-01-03', slot: 'morning', label: 'Buổi sáng', available: false, reason: 'Thợ đã có lịch buổi này' },
  { date: '2030-01-03', slot: 'afternoon', label: 'Buổi chiều', available: true, reason: null },
];
const envelope = (value: unknown) => ({ data: { data: value } });
let wrapper: ReturnType<typeof mount>;
let current: BookingItem;
let orderStatus = 'accepted';
async function render(value = booking()) {
  current = value;
  get.mockImplementation(async (url: string) => {
    if (url.includes('/available-slots')) return envelope({ technicianId: 'tech-1', sessions });
    if (url.startsWith('/service-orders/')) return envelope({ id: 'so-1', status: orderStatus, paymentStatus: 'unpaid', laborTotal: 0, partsTotal: 0, grandTotal: 0 });
    return envelope(current);
  });
  patch.mockResolvedValue(envelope(value));
  wrapper = mount(BookingDetailPage, { global: { stubs: { FhConfirmDialog: true, BookingMediaViewer: true } } });
  await flushPromises();
  return wrapper;
}
const save = () => wrapper.findAll('button').find(button => button.text().includes('Lưu thay đổi') || button.text().includes('Đổi lịch'));
const choose = () => wrapper.find('[data-testid="booking-choose-technicians"]');
const openPicker = async () => { await wrapper.get('[data-testid="booking-open-reschedule"]').trigger('click'); await flushPromises(); };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  get.mockReset(); patch.mockReset(); post.mockReset(); push.mockReset();
  orderStatus = 'accepted';
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });

describe('Reschedule by session (mock HTTP only)', () => {
  it.each([
    { status: 'MATCHED', serviceOrderId: 'exact-so' },
    { status: 'MATCHED', serviceOrderId: undefined },
    { status: 'MATCHING', serviceOrderId: 'exact-so' },
  ] as Partial<BookingItem>[])('drops the pre-Accept form once the booking turns %j', async (state) => {
    orderStatus = 'en_route';
    await render();
    current = booking(state);
    await vi.advanceTimersByTimeAsync(5000); await flushPromises();
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(save()).toBeUndefined();
    expect(patch).not.toHaveBeenCalled();
    if (state.serviceOrderId) {
      await wrapper.get('[data-testid="booking-open-service-order"]').trigger('click');
      expect(push).toHaveBeenCalledWith({ name: 'customer-order-detail', params: { id: 'exact-so' } });
    } else {
      expect(wrapper.find('[data-testid="booking-open-service-order"]').exists()).toBe(false);
    }
  });

  it('shows the session the booking is for', async () => {
    await render(booking({ customerNote: 'Gọi trước khi tới' }));
    expect(wrapper.get('[data-testid="booking-current-session"]').text()).toContain('Buổi sáng (8:00 - 12:00), 02/01/2030');
    expect(wrapper.text()).toContain('Ghi chú cho thợ: Gọi trước khi tới');
  });

  it('keeps the booking session on a description-only save and stays out of candidates', async () => {
    await render();
    await wrapper.get('textarea').setValue('Updated description');
    await save()!.trigger('click'); await flushPromises();
    expect(patch).toHaveBeenCalledWith('/bookings/booking-w1/schedule', {
      mode: 'scheduled', description: 'Updated description', date: '2030-01-02', slot: 'morning',
    });
    expect(push).not.toHaveBeenCalledWith('/app/bookings/booking-w1/candidates');
  });

  it('routes a server-confirmed pre-Accept SUBMITTED save to this Booking candidates', async () => {
    await render();
    patch.mockResolvedValue(envelope(booking({ status: 'SUBMITTED' })));
    await save()!.trigger('click'); await flushPromises();
    expect(push).toHaveBeenCalledWith('/app/bookings/booking-w1/candidates');
  });

  it('loads the sessions only when asked, keeps a busy one out of reach and sends the picked one', async () => {
    await render();
    expect(get.mock.calls.some(([url]) => String(url).includes('/available-slots'))).toBe(false);
    await openPicker();
    const busy = wrapper.get('[data-testid="session-2030-01-03-morning"]');
    expect(busy.attributes('disabled')).toBeDefined();
    expect(busy.text()).toContain('Thợ đã có lịch buổi này');
    await wrapper.get('[data-testid="session-2030-01-03-afternoon"]').trigger('click');
    await save()!.trigger('click'); await flushPromises();
    expect(patch).toHaveBeenCalledWith('/bookings/booking-w1/schedule', {
      mode: 'scheduled', description: 'Original description', date: '2030-01-03', slot: 'afternoon',
    });
  });

  it('asks for a session when an older booking has none, without calling the server', async () => {
    await render(booking({ slot: null, bookingMode: undefined }));
    await save()!.trigger('click'); await flushPromises();
    expect(patch).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="booking-save-error"]').text()).toMatch(/buổi/i);
  });

  it('moves an accepted order to a free session of its technician and says so', async () => {
    await render(booking({ status: 'MATCHED', serviceOrderId: 'so-1' }));
    expect(wrapper.find('textarea').exists()).toBe(false);
    await openPicker();
    expect(save()!.attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="session-2030-01-03-afternoon"]').trigger('click');
    await save()!.trigger('click'); await flushPromises();
    expect(patch).toHaveBeenCalledWith('/bookings/booking-w1/schedule', { mode: 'scheduled', date: '2030-01-03', slot: 'afternoon' });
    expect(push).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="booking-schedule-notice"]').text()).toContain('Kỹ thuật viên đã được báo');
  });

  it('does not offer a reschedule once the technician has set out', async () => {
    orderStatus = 'en_route';
    await render(booking({ status: 'MATCHED', serviceOrderId: 'so-1' }));
    expect(wrapper.find('[data-testid="booking-open-reschedule"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('không thể đổi lịch');
  });

  it.each(['SUBMITTED', 'CLOSED'] as const)('offers an explicit fresh shortlist for %s without sending invitations', async status => {
    await render(booking({ status, preferredEndAt: '2030-01-02T05:00:00.000Z' }));
    expect(choose().exists()).toBe(true);
    expect(push).not.toHaveBeenCalled();
    await choose().trigger('click');
    expect(push).toHaveBeenCalledWith('/app/bookings/booking-w1/candidates');
    expect(patch).not.toHaveBeenCalled(); expect(post).not.toHaveBeenCalled();
  });

  it.each([
    { serviceOrderId: 'so' }, { preferredEndAt: undefined },
    { preferredEndAt: '2029-12-31T00:00:00Z' }, { preferredEndAt: 'invalid' },
    { preferredEndAt: originalStart },
    { invitations: [{ id: 'pending', bookingId: 'booking-w1', priorityOrder: 1, status: 'PENDING', invitedAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-02T02:00:00Z' }] },
    { invitations: [{ id: 'standby', bookingId: 'booking-w1', priorityOrder: 1, status: 'STANDBY', invitedAt: '2030-01-01T00:00:00Z', expiresAt: null }] },
  ])('does not offer CLOSED retry for unsafe state %j', async state => {
    await render(booking({ status: 'CLOSED', ...state } as Partial<BookingItem>));
    expect(choose().exists()).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('does not send duplicate schedule requests while a save is pending', async () => {
    await render();
    let resolve!: (value: ReturnType<typeof envelope>) => void;
    patch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await save()!.trigger('click'); await save()!.trigger('click');
    expect(patch).toHaveBeenCalledTimes(1);
    resolve(envelope(booking({ status: 'SUBMITTED' })));
    await flushPromises();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('does not navigate to candidates on a failed save or a response with a linked SO', async () => {
    await render();
    patch.mockRejectedValueOnce(new Error('Save failed'));
    await save()!.trigger('click'); await flushPromises();
    expect(push).not.toHaveBeenCalled();
    patch.mockResolvedValueOnce(envelope(booking({ status: 'SUBMITTED', serviceOrderId: 'so' })));
    await save()!.trigger('click'); await flushPromises();
    expect(push).not.toHaveBeenCalledWith('/app/bookings/booking-w1/candidates');
  });
});
