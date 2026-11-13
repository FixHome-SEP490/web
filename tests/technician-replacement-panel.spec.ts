import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { getCandidates, replacementOptions, resolveInterruption, getOrder } = vi.hoisted(() => ({
  getCandidates: vi.fn(), replacementOptions: vi.fn(), resolveInterruption: vi.fn(), getOrder: vi.fn(),
}));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getCandidates } }));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getOrder } }));
vi.mock('../src/api/support-cases.api', () => ({ supportCasesApi: { replacementOptions, resolveInterruption } }));
import TechnicianReplacementPanel from '../src/components/console/TechnicianReplacementPanel.vue';

const supportCase = {
  id: 'case-1', caseType: 'mid_job_interruption', requestIntent: 'stop_or_replace', status: 'open', workflowVersion: 2,
  bookingId: 'booking-1', serviceOrderId: 'order-1', technicianId: 'tech-old', reason: 'Khách muốn đổi phương án sửa.',
} as never;
const candidates = [
  { id: 'tech-old', fullName: 'Thợ Cũ', completedOrdersCount: 3 },
  { id: 'tech-new', fullName: 'Thợ Mới', distanceKm: 2.4, completedOrdersCount: 12 },
];
const options = (overrides: Record<string, unknown> = {}) => ({
  caseId: 'case-1', caseStatus: 'open', caseVersion: 2, serviceOrderId: 'order-1', visitGroupId: null,
  requestIntent: 'stop_or_replace',
  flags: { approvedQuote: false, invoice: false, payment: false, voucher: false, parts: false, incompleteSiblings: false },
  actions: {
    DIRECT_REASSIGN_SOLO: { allowed: true, reasons: [] },
    CLOSE_FOR_REBOOK: { allowed: true, reasons: [] },
    REJECT_REQUEST: { allowed: true, reasons: [] },
  },
  ...overrides,
});
const commandResult = {
  case: { ...supportCase, status: 'resolved', workflowVersion: 3 },
  order: { id: 'order-1', status: 'ACCEPTED' }, nextAction: 'none',
};
const mountPanel = async () => {
  const wrapper = mount(TechnicianReplacementPanel, { props: { supportCase } });
  await flushPromises();
  return wrapper;
};

describe('Replacement panel for the Service Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCandidates.mockResolvedValue(candidates);
    replacementOptions.mockResolvedValue(options());
  });

  it('never offers to pick or swap a technician, even when the server would allow it (PO 12/11/2026)', async () => {
    const wrapper = await mountPanel();
    expect(replacementOptions).toHaveBeenCalledWith('case-1');
    expect(getCandidates).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="replacement-action-DIRECT_REASSIGN_SOLO"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid^="replacement-candidate-"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Đổi thợ');
    expect(wrapper.text()).toContain('Hóa đơn: Không');
    wrapper.unmount();
  });

  it('retries an unknown command with the exact same idempotency key and body', async () => {
    resolveInterruption.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce(commandResult);
    const wrapper = await mountPanel();
    await wrapper.get('[data-testid="replacement-reason"]').setValue('Khách muốn đặt lại lịch khác');
    await wrapper.get('[data-testid="replacement-action-CLOSE_FOR_REBOOK"]').trigger('click');
    await wrapper.get('[data-testid="replacement-confirm"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Chưa xác nhận');
    await wrapper.get('[data-testid="replacement-command-retry"]').trigger('click');
    await flushPromises();
    expect(resolveInterruption).toHaveBeenCalledTimes(2);
    expect(resolveInterruption.mock.calls[1]).toEqual(resolveInterruption.mock.calls[0]);
    expect(resolveInterruption.mock.calls[0][1]).not.toHaveProperty('technicianId');
    wrapper.unmount();
  });

  it('offers close-for-rebook only when allowed by preflight and sends one atomic command', async () => {
    resolveInterruption.mockResolvedValue({ ...commandResult, nextAction: 'interruption_rebook' });
    const wrapper = await mountPanel();
    await wrapper.get('[data-testid="replacement-reason"]').setValue('Customer requested a fresh schedule');
    await wrapper.get('[data-testid="replacement-action-CLOSE_FOR_REBOOK"]').trigger('click');
    await wrapper.get('[data-testid="replacement-confirm"]').trigger('click');
    await flushPromises();
    expect(resolveInterruption).toHaveBeenCalledWith('case-1', expect.objectContaining({ action: 'CLOSE_FOR_REBOOK', expectedCaseVersion: 2 }));
    expect(wrapper.emitted('done')?.[0]?.[0]).toContain('khách cần xác nhận lịch và giá mới');
    wrapper.unmount();
  });

  it('shows server preflight blockers', async () => {
    replacementOptions.mockResolvedValueOnce(options({
      flags: { approvedQuote: true, invoice: true, payment: false, voucher: false, parts: true, incompleteSiblings: true },
      actions: {
        DIRECT_REASSIGN_SOLO: { allowed: false, reasons: ['VISIT_GROUP_CHILD', 'APPROVED_QUOTE', 'INVOICE_EXISTS', 'PARTS_CUSTODY_REVIEW'] },
        CLOSE_FOR_REBOOK: { allowed: false, reasons: ['INVOICE_EXISTS', 'PARTS_CUSTODY_REVIEW'] },
        REJECT_REQUEST: { allowed: true, reasons: [] },
      },
    }));
    const wrapper = await mountPanel();
    expect(wrapper.find('[data-testid="replacement-action-DIRECT_REASSIGN_SOLO"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Đã có hóa đơn');
    expect(wrapper.text()).toContain('Linh kiện còn nghĩa vụ');
    expect(getCandidates).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
