import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import type { BookingItem } from '../src/api/bookings.api';

const mocks = vi.hoisted(() => ({
  getBooking: vi.fn(),
  extendMatching: vi.fn(),
  updateBooking: vi.fn(),
  cancelBooking: vi.fn(),
  push: vi.fn(),
  route: { params: { id: 'booking-extension-id' } },
}));

vi.mock('../src/api/bookings.api', () => ({
  bookingsApi: {
    getBooking: mocks.getBooking,
    extendMatching: mocks.extendMatching,
    updateBooking: mocks.updateBooking,
    cancelBooking: mocks.cancelBooking,
  },
}));
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push }),
}));

import BookingDetailPage from '../src/pages/customer/BookingDetailPage.vue';

const ConfirmStub = defineComponent({
  props: { open: Boolean, loading: Boolean, title: String, consequence: String, confirmText: String, cancelText: String },
  emits: ['confirm', 'cancel'],
  setup(props, { emit, slots }) {
    return () => props.open ? h('div', { 'data-testid': 'matching-extension-dialog' }, [
      h('h2', props.title),
      h('p', props.consequence),
      slots.default?.(),
      h('button', { 'data-testid': 'matching-extension-confirm', disabled: props.loading, onClick: () => emit('confirm') }, props.confirmText),
      h('button', { 'data-testid': 'matching-extension-cancel', disabled: props.loading, onClick: () => emit('cancel') }, props.cancelText),
    ]) : null;
  },
});

const global = {
  stubs: {
    BookingMediaViewer: true,
    FhDatePicker: true,
    FhTimeScrollPicker: true,
    FhConfirmDialog: ConfirmStub,
  },
};

function invitation(overrides: Partial<{ id: string; status: string; expiresAt: string | null }> = {}) {
  return {
    id: 'invitation-1',
    bookingId: 'booking-extension-id',
    status: 'PENDING',
    invitedAt: '2030-10-15T04:00:00.000Z',
    expiresAt: '2030-10-15T04:30:00.000Z',
    ...overrides,
  };
}

function booking(overrides: Partial<BookingItem> = {}): BookingItem {
  return {
    id: 'booking-extension-id',
    customerId: 'customer-id',
    serviceId: 'service-id',
    addressId: 'address-id',
    serviceName: 'Sửa điều hoà',
    addressSummary: 'Quận 1',
    description: 'Không lạnh',
    preferredAt: '2030-10-15T04:00:00.000Z',
    preferredEndAt: '2030-10-15T05:00:00.000Z',
    urgency: 'NORMAL',
    status: 'MATCHING',
    createdAt: '2030-10-14T04:00:00.000Z',
    invitations: [invitation()],
    ...overrides,
  };
}

const extensionResult = {
  bookingId: 'booking-extension-id',
  invitationGroupId: 'opaque-group-id',
  expiresAt: '2030-10-15T04:45:00.000Z',
  extendedInvitationCount: 1,
};

beforeEach(() => {
  mocks.getBooking.mockReset().mockResolvedValue(booking());
  mocks.extendMatching.mockReset().mockResolvedValue(extensionResult);
  mocks.updateBooking.mockReset();
  mocks.cancelBooking.mockReset();
  mocks.push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function render(initial = booking()) {
  mocks.getBooking.mockReset().mockResolvedValue(initial);
  const wrapper = mount(BookingDetailPage, { global });
  await flushPromises();
  return wrapper;
}

async function openExtension(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.find('[data-testid="booking-start-matching-extension"]');
  expect(button.exists()).toBe(true);
  await button.trigger('click');
  expect(wrapper.find('[data-testid="matching-extension-dialog"]').exists()).toBe(true);
}

describe('customer one-time matching extension', () => {
  it('requires explicit confirmation, then shows server expiry/count and refreshes the owner Booking', async () => {
    const refreshed = booking({ invitations: [invitation({ expiresAt: extensionResult.expiresAt })] });
    const wrapper = await render();
    mocks.getBooking.mockResolvedValueOnce(refreshed);

    await openExtension(wrapper);
    expect(mocks.extendMatching).not.toHaveBeenCalled();
    await wrapper.find('[data-testid="matching-extension-cancel"]').trigger('click');
    expect(mocks.extendMatching).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="matching-extension-dialog"]').exists()).toBe(false);

    await openExtension(wrapper);
    await wrapper.find('[data-testid="matching-extension-confirm"]').trigger('click');
    await flushPromises();

    expect(mocks.extendMatching).toHaveBeenCalledTimes(1);
    expect(mocks.extendMatching).toHaveBeenCalledWith('booking-extension-id');
    expect(mocks.getBooking).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Đã gia hạn thời gian chờ thợ');
    expect(wrapper.text()).toContain('1 lời mời');
    expect(wrapper.text()).toContain('15/10/2030');
    expect(wrapper.text()).not.toContain('opaque-group-id');
    wrapper.unmount();
  });

  it.each([
    ['wrong status', { status: 'SUBMITTED' }],
    ['linked ServiceOrder', { serviceOrderId: 'service-order-id' }],
    ['missing invitations', { invitations: undefined }],
    ['expired pending invitation', { invitations: [invitation({ expiresAt: '2020-01-01T00:00:00.000Z' })] }],
    ['missing future arrival end', { preferredEndAt: null }],
  ])('hides the CTA for %s', async (_label, overrides) => {
    const wrapper = await render(booking(overrides));
    expect(wrapper.find('[data-testid="booking-start-matching-extension"]').exists()).toBe(false);
    expect(mocks.extendMatching).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('sends only one request for repeated confirm clicks while loading', async () => {
    let resolveExtension!: (value: typeof extensionResult) => void;
    mocks.extendMatching.mockImplementationOnce(() => new Promise(resolve => { resolveExtension = resolve; }));
    const wrapper = await render();
    await openExtension(wrapper);
    await wrapper.find('[data-testid="matching-extension-confirm"]').trigger('click');
    await wrapper.find('[data-testid="matching-extension-confirm"]').trigger('click');
    expect(mocks.extendMatching).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="matching-extension-notice"]').exists()).toBe(false);
    resolveExtension(extensionResult);
    await flushPromises();
    wrapper.unmount();
  });

  it('ignores a deferred poll result that started before extension confirmation', async () => {
    vi.useFakeTimers();
    let resolvePoll!: (value: BookingItem) => void;
    const refreshed = booking({ invitations: [invitation({ expiresAt: extensionResult.expiresAt })] });
    mocks.getBooking.mockReset()
      .mockResolvedValueOnce(booking())
      .mockImplementationOnce(() => new Promise(resolve => { resolvePoll = resolve; }))
      .mockResolvedValueOnce(refreshed);
    const wrapper = mount(BookingDetailPage, { global });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.getBooking).toHaveBeenCalledTimes(2);

    await openExtension(wrapper);
    await wrapper.find('[data-testid="matching-extension-confirm"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="matching-extension-notice"]').exists()).toBe(true);

    resolvePoll(booking({ status: 'MATCHED', serviceOrderId: 'stale-order', invitations: [] }));
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-open-service-order"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="matching-extension-notice"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the one-time lock when the same group loses pending members, then re-enables for a new pending ID', async () => {
    const original = booking({ invitations: [invitation(), invitation({ id: 'invitation-2' })] });
    const wrapper = await render(original);
    mocks.getBooking.mockResolvedValueOnce(original);
    await openExtension(wrapper);
    await wrapper.find('[data-testid="matching-extension-confirm"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-start-matching-extension"]').exists()).toBe(false);

    const sameGroupMatched = booking({ status: 'MATCHED', invitations: [invitation()] });
    mocks.getBooking.mockResolvedValueOnce(sameGroupMatched);
    await wrapper.find('[data-testid="booking-refresh-order-link"]').trigger('click');
    await flushPromises();
    const sameGroupMatching = booking({ status: 'MATCHING', invitations: [invitation()] });
    mocks.getBooking.mockResolvedValueOnce(sameGroupMatching);
    await wrapper.find('[data-testid="booking-refresh-order-link"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-start-matching-extension"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="matching-extension-notice"]').exists()).toBe(true);

    const newGroup = booking({ status: 'MATCHING', invitations: [invitation({ id: 'new-invitation-id' })] });
    mocks.getBooking.mockResolvedValueOnce(newGroup);
    await wrapper.find('[data-testid="booking-refresh-order-link"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-start-matching-extension"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="matching-extension-notice"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('reconciles a 409 race with a winner without claiming extension success', async () => {
    const matched = booking({ status: 'MATCHED', serviceOrderId: 'winner-order', invitations: [] });
    mocks.extendMatching.mockRejectedValueOnce({ response: { status: 409 } });
    const wrapper = await render();
    mocks.getBooking.mockResolvedValueOnce(matched);
    await openExtension(wrapper);
    await wrapper.find('[data-testid="matching-extension-confirm"]').trigger('click');
    await flushPromises();

    expect(mocks.getBooking).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Trạng thái ghép thợ đã thay đổi');
    expect(wrapper.text()).not.toContain('Đã gia hạn thời gian chờ thợ');
    expect(wrapper.find('[data-testid="booking-open-service-order"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it.each([401, 403, 409])('shows an honest error for HTTP %i and reconciles with GET', async (status) => {
    mocks.extendMatching.mockRejectedValueOnce({ response: { status } });
    mocks.getBooking.mockReset().mockResolvedValueOnce(booking()).mockResolvedValueOnce(booking());
    const wrapper = await render();
    await openExtension(wrapper);
    await wrapper.find('[data-testid="matching-extension-confirm"]').trigger('click');
    await flushPromises();

    expect(mocks.getBooking).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain(status === 401 ? 'Phiên đăng nhập' : status === 403 ? 'không có quyền' : 'không còn khả dụng');
    expect(wrapper.text()).not.toContain('Đã gia hạn thời gian chờ thợ');
    wrapper.unmount();
  });

  it('reconciles a transport failure without claiming extension success', async () => {
    mocks.extendMatching.mockRejectedValueOnce(new Error('network unavailable'));
    const wrapper = await render();
    await openExtension(wrapper);
    await wrapper.find('[data-testid="matching-extension-confirm"]').trigger('click');
    await flushPromises();

    expect(mocks.getBooking).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Chưa thể xác nhận gia hạn');
    expect(wrapper.text()).not.toContain('Đã gia hạn thời gian chờ thợ');
    wrapper.unmount();
  });

  it('does not apply a late success after the detail is unmounted', async () => {
    let resolveExtension!: (value: typeof extensionResult) => void;
    mocks.extendMatching.mockImplementationOnce(() => new Promise(resolve => { resolveExtension = resolve; }));
    const wrapper = await render();
    await openExtension(wrapper);
    await wrapper.find('[data-testid="matching-extension-confirm"]').trigger('click');
    wrapper.unmount();
    resolveExtension(extensionResult);
    await flushPromises();

    expect(mocks.getBooking).toHaveBeenCalledTimes(1);
  });
});
