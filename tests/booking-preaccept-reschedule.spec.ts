import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import type { BookingItem } from '../src/api/bookings.api';

const { get, patch, post, push } = vi.hoisted(() => ({
  get: vi.fn(), patch: vi.fn(), post: vi.fn(), push: vi.fn(),
}));
vi.mock('../src/api/client', () => ({ default: { get, patch, post } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'booking-w1' } }), useRouter: () => ({ push }),
}));
import BookingDetailPage from '../src/pages/customer/BookingDetailPage.vue';

const DatePicker = defineComponent({
  props: ['modelValue'], emits: ['update:modelValue'],
  setup: (props, { emit }) => () => h('input', {
    type: 'date', value: props.modelValue,
    onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
  }),
});
const TimePicker = defineComponent({
  props: ['modelValue'], emits: ['update:modelValue'],
  setup: (props, { emit }) => () => h('input', {
    type: 'time', value: props.modelValue,
    onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
  }),
});
const originalStart = '2030-01-02T08:00:37.123+07:00';
const originalEnd = '2030-01-02T12:00:37.123+07:00';
function booking(overrides: Partial<BookingItem> = {}): BookingItem {
  return {
    id: 'booking-w1', customerId: 'customer', serviceId: 'service', addressId: 'address',
    description: 'Original description', preferredAt: originalStart, preferredEndAt: originalEnd,
    status: 'MATCHING', urgency: 'NORMAL', createdAt: '2030-01-01T00:00:00Z',
    invitations: [], ...overrides,
  };
}
const envelope = (value: BookingItem) => ({ data: { data: value } });
let wrapper: ReturnType<typeof mount>;
async function render(value = booking()) {
  get.mockResolvedValue(envelope(value));
  patch.mockResolvedValue(envelope(value));
  wrapper = mount(BookingDetailPage, { global: { stubs: {
    FhDatePicker: DatePicker, FhTimeScrollPicker: TimePicker,
    FhConfirmDialog: true, BookingMediaViewer: true,
  } } });
  await flushPromises();
  return wrapper;
}
const save = () => wrapper.findAll('button').find(button => button.text().includes('Lưu thay đổi'))!;
const choose = () => wrapper.find('[data-testid="booking-choose-technicians"]');
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  get.mockReset(); patch.mockReset(); post.mockReset(); push.mockReset();
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });

describe('W1 pre-Accept schedule and shortlist recovery (mock HTTP only)', () => {
  it.each([
    { status: 'MATCHED', serviceOrderId: 'exact-so' },
    { status: 'MATCHED', serviceOrderId: undefined },
    { status: 'MATCHING', serviceOrderId: 'exact-so' },
  ] as Partial<BookingItem>[])('blocks the form and stale save callback for %j', async (state) => {
    await render();
    const saveComponent = wrapper.findAllComponents({ name: 'FhButton' })
      .find(button => button.text().includes('Lưu thay đổi'))!;
    get.mockResolvedValue(envelope(booking(state)));
    await vi.advanceTimersByTimeAsync(5000); await flushPromises();
    expect(save()).toBeUndefined();
    saveComponent.vm.$emit('click');
    await flushPromises();
    expect(patch).not.toHaveBeenCalled();
    if (state.serviceOrderId) {
      await wrapper.get('[data-testid="booking-open-service-order"]').trigger('click');
      expect(push).toHaveBeenCalledWith({ name: 'customer-order-detail', params: { id: 'exact-so' } });
    } else {
      expect(wrapper.find('[data-testid="booking-open-service-order"]').exists()).toBe(false);
    }
  });

  it('routes a server-confirmed pre-Accept SUBMITTED save to this Booking candidates', async () => {
    await render();
    patch.mockResolvedValue(envelope(booking({ status: 'SUBMITTED' })));
    await save().trigger('click'); await flushPromises();
    expect(patch).toHaveBeenCalledWith('/bookings/booking-w1/schedule', expect.any(Object));
    expect(push).toHaveBeenCalledWith('/app/bookings/booking-w1/candidates');
  });

  it.each(['SUBMITTED', 'CLOSED'] as const)('offers an explicit fresh shortlist for %s without sending invitations', async status => {
    await render(booking({ status }));
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

  it('keeps exact server strings and the four-hour end across mount, poll and description-only save', async () => {
    await render();
    await wrapper.get('textarea').setValue('Updated description');
    await vi.advanceTimersByTimeAsync(5000); await flushPromises();
    expect(patch).not.toHaveBeenCalled();
    await save().trigger('click'); await flushPromises();
    expect(patch).toHaveBeenCalledWith('/bookings/booking-w1/schedule', {
      description: 'Updated description', preferredStartAt: originalStart, preferredEndAt: originalEnd,
    });
    expect(push).not.toHaveBeenCalledWith('/app/bookings/booking-w1/candidates');
  });

  it('preserves the original four-hour duration for an intentionally selected new start', async () => {
    await render();
    await wrapper.get('input[type="date"]').setValue('2030-01-03');
    await wrapper.get('input[type="time"]').setValue('10:30');
    await save().trigger('click'); await flushPromises();
    const start = new Date(2030, 0, 3, 10, 30);
    expect(patch).toHaveBeenCalledWith('/bookings/booking-w1/schedule', {
      description: 'Original description', preferredStartAt: start.toISOString(),
      preferredEndAt: new Date(start.getTime() + 4 * 60 * 60 * 1000).toISOString(),
    });
  });

  it.each([
    { preferredEndAt: undefined }, { preferredEndAt: 'invalid' },
    { preferredEndAt: originalStart }, { preferredAt: 'invalid' },
    { preferredAt: '2029-12-31T08:00:00Z', preferredEndAt: '2029-12-31T12:00:00Z' },
  ])('validates missing, invalid or past windows without fabricating an end %j', async state => {
    await render(booking(state));
    await save().trigger('click'); await flushPromises();
    expect(patch).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="booking-save-error"]').text()).toMatch(/khung giờ/i);
    expect(push).not.toHaveBeenCalled();
  });

  it('does not send duplicate schedule requests while a save is pending', async () => {
    await render();
    let resolve!: (value: ReturnType<typeof envelope>) => void;
    patch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await save().trigger('click'); await save().trigger('click');
    expect(patch).toHaveBeenCalledTimes(1);
    resolve(envelope(booking({ status: 'SUBMITTED' })));
    await flushPromises();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('does not navigate to candidates on a failed save or a response with a linked SO', async () => {
    await render();
    patch.mockRejectedValueOnce(new Error('Save failed'));
    await save().trigger('click'); await flushPromises();
    expect(push).not.toHaveBeenCalled();
    patch.mockResolvedValueOnce(envelope(booking({ status: 'SUBMITTED', serviceOrderId: 'so' })));
    await save().trigger('click'); await flushPromises();
    expect(push).not.toHaveBeenCalledWith('/app/bookings/booking-w1/candidates');
  });
});
