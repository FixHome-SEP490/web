import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { listMine, requestStopOrReplace } = vi.hoisted(() => ({ listMine: vi.fn(), requestStopOrReplace: vi.fn() }));
vi.mock('../src/api/support-cases.api', () => ({ supportCasesApi: { listMine, requestStopOrReplace } }));
import CustomerStopReplaceRequest from '../src/components/customer/CustomerStopReplaceRequest.vue';

const activeRequest = {
  id: 'case-1', caseType: 'mid_job_interruption', status: 'open', bookingId: 'booking-1', serviceOrderId: 'order-1',
  reason: 'Khách muốn quản lý xem xét việc dừng sửa hoặc đổi thợ.', description: null, resolutionReason: null,
  evidenceRefs: null, isUrgent: true, respondBy: null, resolvedAt: null, holdCompletion: true,
  requestIntent: 'stop_or_replace', createdAt: '2026-10-28T06:00:00.000Z', updatedAt: '2026-10-28T06:00:00.000Z',
};

describe('CustomerStopReplaceRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMine.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  });

  it('offers the explicit request only while the selected order is under repair', async () => {
    const wrapper = mount(CustomerStopReplaceRequest, { props: { orderId: 'order-1', orderStatus: 'UNDER_REPAIR' } });
    await flushPromises();
    expect(wrapper.get('[data-testid="stop-replace-open"]').text()).toContain('Yêu cầu dừng sửa / Đổi thợ');
    await wrapper.setProps({ orderStatus: 'COMPLETED' });
    expect(wrapper.find('[data-testid="stop-replace-open"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the existing server case instead of offering a duplicate action', async () => {
    listMine.mockResolvedValueOnce({ data: [activeRequest], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    const wrapper = mount(CustomerStopReplaceRequest, { props: { orderId: 'order-1', orderStatus: 'UNDER_REPAIR' } });
    await flushPromises();
    expect(wrapper.text()).toContain('Đã gửi yêu cầu');
    expect(wrapper.find('[data-testid="stop-replace-open"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps an ambiguous submit pending until a read confirms the server result', async () => {
    requestStopOrReplace.mockRejectedValueOnce(new Error('network unavailable'));
    listMine.mockResolvedValueOnce({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } })
      .mockResolvedValueOnce({ data: [activeRequest], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    const wrapper = mount(CustomerStopReplaceRequest, { props: { orderId: 'order-1', orderStatus: 'UNDER_REPAIR' } });
    await flushPromises();
    await wrapper.get('[data-testid="stop-replace-open"]').trigger('click');
    await wrapper.get('[data-testid="stop-replace-reason"]').setValue('Xin quản lý xem xét phương án dừng sửa hoặc đổi thợ.');
    await wrapper.get('[data-testid="stop-replace-submit"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Chưa xác nhận');
    await wrapper.get('[data-testid="stop-replace-check-status"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Đã gửi yêu cầu');
    expect(requestStopOrReplace).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
