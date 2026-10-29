import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';

const { listMine, readRepairFailureSources, push } = vi.hoisted(() => ({ listMine: vi.fn(), readRepairFailureSources: vi.fn(), push: vi.fn() }));
vi.mock('../src/api/support-cases.api', () => ({ supportCasesApi: { listMine } }));
vi.mock('../src/api/failed-repair.api', () => ({ readRepairFailureSources }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
import CustomerCancelledRebookAction from '../src/components/customer/CustomerCancelledRebookAction.vue';

const makeCase = (caseType = 'mid_job_interruption', overrides = {}) => ({
  id: 'case-1', caseType, status: 'resolved', bookingId: 'booking-1', serviceOrderId: 'order-1',
  resolutionCode: 'interrupted_for_rebook', ...overrides,
});
const mountAction = () => mount(CustomerCancelledRebookAction, { props: { bookingId: 'booking-1', orderId: 'order-1', status: 'CANCELLED' } });

describe('CustomerCancelledRebookAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    readRepairFailureSources.mockResolvedValue(null);
    listMine.mockResolvedValue({ data: [] });
  });

  it.each(['mid_job_interruption', 'technician_replacement'])('routes the linked %s manager result to the interruption wizard', async caseType => {
    listMine.mockResolvedValueOnce({ data: [makeCase(caseType)] });
    const wrapper = mountAction();
    await flushPromises();
    expect(wrapper.find('[data-testid="cancelled-rebook-legacy"]').exists()).toBe(false);
    await wrapper.get('[data-testid="cancelled-rebook-interrupted"]').trigger('click');
    expect(push).toHaveBeenCalledWith({ path: '/app/bookings/new', query: { interruptionRebook: 'booking-1' } });
  });

  it('routes a technician replacement case with null bookingId only when its ServiceOrder matches', async () => {
    listMine.mockResolvedValueOnce({ data: [makeCase('technician_replacement', { bookingId: null })] });
    const wrapper = mountAction();
    await flushPromises();
    await wrapper.get('[data-testid="cancelled-rebook-interrupted"]').trigger('click');
    expect(push).toHaveBeenCalledWith({ path: '/app/bookings/new', query: { interruptionRebook: 'booking-1' } });
  });

  it('classifies normal cancellations before showing the old technician rebook action', async () => {
    let release!: (value: null) => void;
    readRepairFailureSources.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const wrapper = mountAction();
    await nextTick();
    expect(wrapper.find('[data-testid="cancelled-rebook-classifying"]').exists()).toBe(true);
    release(null);
    await flushPromises();
    await wrapper.get('[data-testid="cancelled-rebook-legacy"]').trigger('click');
    expect(wrapper.emitted('legacy')).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('does not route a failed repair through legacy and preserves every verified source booking', async () => {
    readRepairFailureSources.mockResolvedValueOnce(['booking-1', 'booking-2']);
    const wrapper = mountAction();
    await flushPromises();
    await wrapper.get('[data-testid="cancelled-rebook-repair-failure"]').trigger('click');
    expect(push).toHaveBeenCalledWith({ path: '/app/bookings/new', query: { repairFailure: 'booking-1,booking-2' } });
    expect(wrapper.find('[data-testid="cancelled-rebook-legacy"]').exists()).toBe(false);
  });

  it('hides the legacy action for mismatched, unresolved, or unrelated cases', async () => {
    listMine.mockResolvedValueOnce({ data: [makeCase('technician_replacement', { bookingId: 'other' })] });
    const wrongLink = mountAction();
    await flushPromises();
    expect(wrongLink.find('[data-testid="cancelled-rebook-legacy"]').exists()).toBe(false);
    expect(wrongLink.find('[data-testid="cancelled-rebook-error"]').exists()).toBe(true);
    wrongLink.unmount();

    listMine.mockResolvedValueOnce({ data: [makeCase('mid_job_interruption', { bookingId: null })] });
    const missingCustomerBooking = mountAction();
    await flushPromises();
    expect(missingCustomerBooking.find('[data-testid="cancelled-rebook-interrupted"]').exists()).toBe(false);
    expect(missingCustomerBooking.find('[data-testid="cancelled-rebook-legacy"]').exists()).toBe(false);
    missingCustomerBooking.unmount();

    listMine.mockResolvedValueOnce({ data: [makeCase('quality')] });
    const wrongType = mountAction();
    await flushPromises();
    expect(wrongType.find('[data-testid="cancelled-rebook-interrupted"]').exists()).toBe(false);
    expect(wrongType.find('[data-testid="cancelled-rebook-legacy"]').exists()).toBe(false);
    wrongType.unmount();

    listMine.mockResolvedValueOnce({ data: [makeCase('technician_replacement', { status: 'open' })] });
    const unresolved = mountAction();
    await flushPromises();
    expect(unresolved.find('[data-testid="cancelled-rebook-interrupted"]').exists()).toBe(false);
    expect(unresolved.find('[data-testid="cancelled-rebook-legacy"]').exists()).toBe(false);
    unresolved.unmount();
  });

  it('fails closed on classification errors and retries before offering any action', async () => {
    readRepairFailureSources.mockRejectedValueOnce(new Error('read failed')).mockResolvedValueOnce(null);
    const wrapper = mountAction();
    await flushPromises();
    expect(wrapper.find('[data-testid="cancelled-rebook-legacy"]').exists()).toBe(false);
    await wrapper.get('[data-testid="cancelled-rebook-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="cancelled-rebook-legacy"]').exists()).toBe(true);
  });
});
