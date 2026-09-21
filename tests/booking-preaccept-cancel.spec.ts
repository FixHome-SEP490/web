// WEB-H04 pre-accept Booking cancellation: synthetic HTTP and mounted customer page.
// No live account, Backend request, customer data or database mutation.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

const { mockGet, mockPost, push } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn(), push: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get: mockGet, post: mockPost } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'booking-real-id' } }),
  useRouter: () => ({ push }),
}));

import BookingDetailPage from '../src/pages/customer/BookingDetailPage.vue';
const ConfirmStub = defineComponent({
  props: { open: Boolean, loading: Boolean },
  emits: ['confirm', 'cancel'],
  setup(props, { slots, emit }) {
    return () => props.open ? h('div', { 'data-testid': 'booking-cancel-dialog' }, [
      slots.default?.(),
      h('button', { 'data-testid': 'booking-confirm-cancel', disabled: props.loading, onClick: () => emit('confirm') }, 'Confirm'),
      h('button', { 'data-testid': 'booking-close-cancel', disabled: props.loading, onClick: () => emit('cancel') }, 'Back'),
    ]) : null;
  },
});

function booking(status: string = 'SUBMITTED', serviceOrderId?: string | null) {
  return {
    id: 'booking-real-id', customerId: 'mock-customer', serviceId: 'mock-service',
    addressId: 'mock-address', serviceNameSnapshot: 'Mock service', addressTextSnapshot: 'Mock address',
    description: 'Mock problem', preferredStartAt: '2026-10-01T09:00:00Z',
    urgency: 'normal', status, createdAt: '2026-09-21T09:00:00Z', serviceOrderId,
  };
}
const response = (item: ReturnType<typeof booking>) => ({ data: { data: item } });
const cancelButton = '[data-testid="booking-start-cancel"]';
const confirmButton = '[data-testid="booking-confirm-cancel"]';
const reasonInput = '[data-testid="booking-cancel-reason"]';
const errorBox = '[data-testid="booking-cancel-error"]';
const linkedOrder = '[data-testid="booking-open-service-order"]';

async function render() {
  const wrapper = mount(BookingDetailPage, {
    global: { stubs: { FhDatePicker: true, FhTimeScrollPicker: true, FhConfirmDialog: ConfirmStub } },
  });
  await flushPromises();
  return wrapper;
}
async function openCancel(wrapper: Awaited<ReturnType<typeof render>>) {
  await wrapper.find(cancelButton).trigger('click');
  expect(wrapper.find('[data-testid="booking-cancel-dialog"]').exists()).toBe(true);
}

beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); push.mockReset(); });

describe('WEB-H04 pre-accept cancellation', () => {
  it.each(['SUBMITTED', 'MATCHING', 'CLOSED'])('offers confirmation for unassigned %s Booking', async status => {
    mockGet.mockResolvedValue(response(booking(status)));
    const wrapper = await render();
    expect(wrapper.find(cancelButton).exists()).toBe(true);
    expect(wrapper.find('[data-testid="booking-cancel-dialog"]').exists()).toBe(false);
    await openCancel(wrapper);
    expect(mockPost).not.toHaveBeenCalled();
    await wrapper.find('[data-testid="booking-close-cancel"]').trigger('click');
    expect(wrapper.find('[data-testid="booking-cancel-dialog"]').exists()).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each(['MATCHED', 'CANCELLED'])('never offers pre-accept cancel for %s', async status => {
    mockGet.mockResolvedValue(response(booking(status)));
    const wrapper = await render();
    expect(wrapper.find(cancelButton).exists()).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not offer Booking cancellation if a ServiceOrder already exists; preserves H02 exact link', async () => {
    mockGet.mockResolvedValue(response(booking('CLOSED', 'server-order-id')));
    const wrapper = await render();
    expect(wrapper.find(cancelButton).exists()).toBe(false);
    expect(wrapper.find(linkedOrder).exists()).toBe(true);
    await wrapper.find(linkedOrder).trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'customer-order-detail', params: { id: 'server-order-id' } });
    wrapper.unmount();
  });

  it('requires nonblank reason and rejects reasons longer than backend 2000-character limit', async () => {
    mockGet.mockResolvedValue(response(booking()));
    const wrapper = await render();
    await openCancel(wrapper);
    await wrapper.find(confirmButton).trigger('click');
    expect(mockPost).not.toHaveBeenCalled();
    expect(wrapper.find(errorBox).exists()).toBe(true);
    await wrapper.find(reasonInput).setValue('x'.repeat(2001));
    await wrapper.find(confirmButton).trigger('click');
    expect(mockPost).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('posts trimmed reason to Booking endpoint only after confirmation, then shows cancelled status', async () => {
    mockGet.mockResolvedValue(response(booking('MATCHING')));
    mockPost.mockResolvedValue(response(booking('cancelled')));
    const wrapper = await render();
    await openCancel(wrapper);
    await wrapper.find(reasonInput).setValue('  Không còn nhu cầu  ');
    await wrapper.find(confirmButton).trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/bookings/booking-real-id/cancel', { reason: 'Không còn nhu cầu' });
    expect(wrapper.find(cancelButton).exists()).toBe(false);
    expect(wrapper.find('[data-testid="booking-cancel-dialog"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Đã huỷ');
    expect(push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps one request in flight even on repeated confirmation clicks', async () => {
    let release!: (value: ReturnType<typeof response>) => void;
    mockGet.mockResolvedValue(response(booking()));
    mockPost.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const wrapper = await render();
    await openCancel(wrapper);
    await wrapper.find(reasonInput).setValue('No longer needed');
    await wrapper.find(confirmButton).trigger('click');
    await wrapper.find(confirmButton).trigger('click');
    expect(mockPost).toHaveBeenCalledTimes(1);
    release(response(booking('CANCELLED')));
    await flushPromises();
    expect(wrapper.find(cancelButton).exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the modal and safe retry when POST fails and GET confirms Booking is still eligible', async () => {
    mockGet.mockResolvedValueOnce(response(booking())).mockResolvedValueOnce(response(booking('MATCHING')));
    mockPost.mockRejectedValueOnce(new Error('private server failure')).mockResolvedValueOnce(response(booking('CANCELLED')));
    const wrapper = await render();
    await openCancel(wrapper);
    await wrapper.find(reasonInput).setValue('Changed plan');
    await wrapper.find(confirmButton).trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(wrapper.find(errorBox).exists()).toBe(true);
    expect(wrapper.text()).not.toContain('private server failure');
    await wrapper.find(confirmButton).trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(wrapper.find(cancelButton).exists()).toBe(false);
    wrapper.unmount();
  });

  it('on POST failure reconciles a now-assigned Booking and never retries pre-accept cancellation', async () => {
    mockGet.mockResolvedValueOnce(response(booking('MATCHING')))
      .mockResolvedValueOnce(response(booking('MATCHED', 'accepted-order-id')));
    mockPost.mockRejectedValueOnce(new Error('no longer cancellable'));
    const wrapper = await render();
    await openCancel(wrapper);
    await wrapper.find(reasonInput).setValue('Changed plan');
    await wrapper.find(confirmButton).trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(wrapper.find(cancelButton).exists()).toBe(false);
    expect(wrapper.find('[data-testid="booking-cancel-dialog"]').exists()).toBe(false);
    expect(wrapper.find(linkedOrder).exists()).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('on ambiguous network failure reconciles server-cancelled Booking without claiming POST success', async () => {
    mockGet.mockResolvedValueOnce(response(booking('MATCHING')))
      .mockResolvedValueOnce(response(booking('CANCELLED')));
    mockPost.mockRejectedValueOnce(new Error('network response lost'));
    const wrapper = await render();
    await openCancel(wrapper);
    await wrapper.find(reasonInput).setValue('Changed plan');
    await wrapper.find(confirmButton).trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(wrapper.find(cancelButton).exists()).toBe(false);
    expect(wrapper.find('[data-testid="booking-cancel-dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });
});