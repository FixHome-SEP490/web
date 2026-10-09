import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// "Cần thay đổi thợ" (PO 08/10/2026): the Service Manager gives the order to
// another technician or cancels it; neither costs the reporter points.
const { getCandidates, replaceTechnicianAfterReport, cancelOrder, resolveCase, getOrder } = vi.hoisted(() => ({
  getCandidates: vi.fn(), replaceTechnicianAfterReport: vi.fn(), cancelOrder: vi.fn(), resolveCase: vi.fn(), getOrder: vi.fn(),
}));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getCandidates, replaceTechnicianAfterReport } }));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { cancelOrder, getOrder } }));
vi.mock('../src/api/support-cases.api', () => ({ supportCasesApi: { resolveCase } }));
import TechnicianReplacementPanel from '../src/components/console/TechnicianReplacementPanel.vue';

const supportCase = {
  id: 'case-1', caseType: 'technician_replacement', status: 'open', bookingId: 'booking-1', serviceOrderId: 'order-1',
  technicianId: 'tech-old', title: 'x', reason: 'Ngoài kỹ năng',
} as never;
const candidates = [
  { id: 'tech-old', fullName: 'Thợ Cũ', completedOrdersCount: 3 },
  { id: 'tech-new', fullName: 'Thợ Mới', distanceKm: 2.4, completedOrdersCount: 12 },
];
const mountPanel = async () => {
  const w = mount(TechnicianReplacementPanel, { props: { supportCase } });
  await flushPromises();
  return w;
};

describe('Replacement panel for the Service Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCandidates.mockResolvedValue(candidates);
  });

  it('offers the other technicians of the booking, never the one who reported', async () => {
    const w = await mountPanel();
    expect(getCandidates).toHaveBeenCalledWith('booking-1');
    expect(w.find('[data-testid="replacement-candidate-tech-old"]').exists()).toBe(false);
    expect(w.get('[data-testid="replacement-candidate-tech-new"]').text()).toContain('Thợ Mới');
  });

  it('needs a technician and a reason before handing the order over', async () => {
    replaceTechnicianAfterReport.mockResolvedValue(undefined);
    const w = await mountPanel();
    await w.get('[data-testid="replacement-assign"]').trigger('click');
    expect(w.text()).toContain('Chọn kỹ thuật viên');
    await w.get('[data-testid="replacement-candidate-tech-new"] input').setValue(true);
    await w.get('[data-testid="replacement-reason"]').setValue('ngắn');
    await w.get('[data-testid="replacement-assign"]').trigger('click');
    expect(w.text()).toContain('tối thiểu 10 ký tự');
    expect(replaceTechnicianAfterReport).not.toHaveBeenCalled();
    await w.get('[data-testid="replacement-reason"]').setValue('Máy công nghiệp, cần thợ có kinh nghiệm');
    await w.get('[data-testid="replacement-assign"]').trigger('click');
    await flushPromises();
    expect(replaceTechnicianAfterReport).toHaveBeenCalledWith('order-1', 'tech-new', 'Máy công nghiệp, cần thợ có kinh nghiệm');
    expect(w.emitted('done')?.[0]?.[0]).toContain('Thợ Mới');
  });

  it('cancels without points and closes the case as cancelled with no fee', async () => {
    cancelOrder.mockResolvedValue({});
    resolveCase.mockResolvedValue({});
    const w = await mountPanel();
    await w.get('[data-testid="replacement-reason"]').setValue('Không có thợ phù hợp trong khu vực');
    await w.get('[data-testid="replacement-cancel"]').trigger('click');
    await flushPromises();
    expect(cancelOrder).toHaveBeenCalledWith('order-1', 'Không có thợ phù hợp trong khu vực');
    expect(resolveCase).toHaveBeenCalledWith('case-1', { finalStatus: 'resolved', resolutionCode: 'order_cancelled_no_fee', reason: 'Không có thợ phù hợp trong khu vực' });
    expect(w.emitted('done')?.[0]?.[0]).toContain('không ai bị trừ điểm');
  });

  it('shows the server reason when the handover is refused', async () => {
    replaceTechnicianAfterReport.mockRejectedValue({ response: { data: { error: { message: 'Khách đã duyệt báo giá của thợ hiện tại, không đổi thợ được' } } } });
    const w = await mountPanel();
    await w.get('[data-testid="replacement-candidate-tech-new"] input').setValue(true);
    await w.get('[data-testid="replacement-reason"]').setValue('Máy công nghiệp, cần thợ khác');
    await w.get('[data-testid="replacement-assign"]').trigger('click');
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('đã duyệt báo giá');
    expect(w.emitted('done')).toBeUndefined();
  });

  it('finds the booking through the order when the case was opened on the order alone', async () => {
    getOrder.mockResolvedValue({ id: 'order-1', bookingId: 'booking-from-order' });
    mount(TechnicianReplacementPanel, { props: { supportCase: { ...(supportCase as object), bookingId: null } as never } });
    await flushPromises();
    expect(getOrder).toHaveBeenCalledWith('order-1');
    expect(getCandidates).toHaveBeenCalledWith('booking-from-order');
  });
});
