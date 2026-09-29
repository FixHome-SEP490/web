import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/client')>()),
  default: apiClientMock,
}));

import { warrantyManagerApi, type StaffWarrantyClaim } from '../src/api/warranty-claims.api';
import WarrantyDecisionModal from '../src/components/console/WarrantyDecisionModal.vue';
import ConsoleWarrantyPage from '../src/pages/console/ConsoleWarrantyPage.vue';
import { isResponseOverdue, resolutionCodeLabels, RESOLUTION_CODES } from '../src/pages/console/support-cases.utils';
import { useAuthStore } from '../src/stores/auth.store';

const claim = (overrides: Partial<StaffWarrantyClaim> = {}): StaffWarrantyClaim => ({
  id: 'claim-1',
  serviceOrderId: 'order-1',
  warrantyCoverageId: 'cov-1',
  status: 'inspected',
  description: 'Vòi nước lại rò rỉ sau ba ngày',
  evidenceRefs: null,
  submittedAfterExpiry: false,
  customerResponse: null,
  awaitingPrompt: null,
  resolutionNotes: null,
  submittedAt: '2026-09-29T08:00:00.000Z',
  resolvedAt: null,
  technician: { id: 'tech-1', fullName: 'Kỹ thuật viên A' },
  order: {
    id: 'order-1',
    code: 'SO-1',
    serviceName: 'Sửa đường nước',
    addressSummary: '12 Lê Lợi',
    customerName: 'Khách A',
    customerPhone: '0911',
  },
  coverage: { id: 'cov-1', itemDescription: 'Vòi sen', expiresAt: '2026-10-30T00:00:00.000Z' },
  visit: {
    id: 'visit-1',
    status: 'inspected',
    scheduledAt: null,
    checkedInAt: '2026-09-30T02:00:00.000Z',
    proposedResult: 'covered_part',
    notCoveredReasonCode: null,
    findings: 'Linh kiện bị nứt ở mối ghép',
    evidenceRefs: null,
    reServiceNotes: null,
    reServiceEvidenceRefs: null,
    completedAt: null,
  },
  ...overrides,
});

const listResponse = (claims: StaffWarrantyClaim[]) => ({
  data: { data: claims, meta: { page: 1, limit: 10, total: claims.length, totalPages: 1 } },
});
const routerStub = { 'router-link': { template: '<a><slot /></a>' } };

describe('warrantyManagerApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('drops empty filters, keeps real ones and reads the paginated envelope', async () => {
    apiClientMock.get.mockResolvedValueOnce(listResponse([claim()]));
    const result = await warrantyManagerApi.listQueue({ page: 1, limit: 10, status: undefined, unassigned: false, technicianId: 'tech-1' });
    expect(apiClientMock.get).toHaveBeenCalledWith('/service-manager/warranty-claims', {
      params: { page: 1, limit: 10, technicianId: 'tech-1' },
    });
    expect(result.meta.total).toBe(1);
  });

  it('posts each decision to its own route', async () => {
    apiClientMock.post.mockResolvedValue({ data: { data: claim() } });
    await warrantyManagerApi.assign('claim-1', 'tech-2');
    await warrantyManagerApi.approve('claim-1', { customerNote: 'Đã kiểm tra kỹ' });
    await warrantyManagerApi.reject('claim-1', { reasonCode: 'expired', customerNote: 'Đã hết hạn bảo hành.' });
    await warrantyManagerApi.close('claim-1', { outcome: 'resolved' });
    expect(apiClientMock.post.mock.calls.map((call) => call[0])).toEqual([
      '/service-manager/warranty-claims/claim-1/assign',
      '/service-manager/warranty-claims/claim-1/approve',
      '/service-manager/warranty-claims/claim-1/reject',
      '/service-manager/warranty-claims/claim-1/close',
    ]);
  });

  it('reads eligible technicians and the rates for a window', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: { data: [{ id: 'tech-2', fullName: 'B' }] } });
    expect(await warrantyManagerApi.eligibleTechnicians()).toEqual([{ id: 'tech-2', fullName: 'B' }]);
    apiClientMock.get.mockResolvedValueOnce({ data: { data: [] } });
    await warrantyManagerApi.technicianStats(30);
    expect(apiClientMock.get).toHaveBeenLastCalledWith('/service-manager/warranty-claims/stats/technicians', {
      params: { windowDays: 30 },
    });
  });
});

describe('WarrantyDecisionModal', () => {
  beforeEach(() => vi.clearAllMocks());
  const submit = (wrapper: ReturnType<typeof mountModal>) => wrapper.findAll('button').at(-1)!;
  const mountModal = (mode: 'assign' | 'approve' | 'reject' | 'close', c = claim()) =>
    mount(WarrantyDecisionModal, {
      props: { claim: c, mode, technicians: [{ id: 'tech-1', fullName: 'Kỹ thuật viên A' }, { id: 'tech-2', fullName: 'Kỹ thuật viên B' }] },
      attachTo: document.body,
    });

  it('offers only other technicians and requires a choice', async () => {
    const wrapper = mountModal('assign');
    const options = wrapper.findAll('#warranty-assign option').map((o) => o.text());
    expect(options).toContain('Kỹ thuật viên B');
    expect(options).not.toContain('Kỹ thuật viên A');
    await submit(wrapper).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('chọn kỹ thuật viên');

    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'submitted' }) } });
    await wrapper.get('#warranty-assign').setValue('tech-2');
    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/service-manager/warranty-claims/claim-1/assign', { technicianId: 'tech-2' });
    wrapper.unmount();
  });

  it('approves the proposal as it is without overriding', async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'in_progress' }) } });
    const wrapper = mountModal('approve');
    expect(wrapper.text()).toContain('Linh kiện bị nứt ở mối ghép');
    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/service-manager/warranty-claims/claim-1/approve', {});
    expect(wrapper.emitted('done')).toHaveLength(1);
    wrapper.unmount();
  });

  it('warns on an override and demands a customer note for not covered', async () => {
    const wrapper = mountModal('approve');
    await wrapper.findAll('input[type="radio"]')[2].setValue();
    expect(wrapper.text()).toContain('đổi kết luận so với đề xuất');
    await submit(wrapper).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('giải thích cho khách hàng');

    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'awaiting_customer' }) } });
    await wrapper.get('#warranty-final-reason').setValue('normal_wear');
    await wrapper.get('#warranty-customer-note').setValue('Linh kiện đã hao mòn tự nhiên theo thời gian.');
    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/service-manager/warranty-claims/claim-1/approve', {
      result: 'not_covered',
      reasonCode: 'normal_wear',
      customerNote: 'Linh kiện đã hao mòn tự nhiên theo thời gian.',
    });
    wrapper.unmount();
  });

  it('needs a written explanation to reject', async () => {
    const wrapper = mountModal('reject');
    await submit(wrapper).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();

    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'rejected' }) } });
    await wrapper.get('#warranty-reject-reason').setValue('expired');
    await wrapper.get('#warranty-reject-note').setValue('Hạng mục đã hết hạn bảo hành từ tuần trước.');
    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/service-manager/warranty-claims/claim-1/reject', {
      reasonCode: 'expired',
      customerNote: 'Hạng mục đã hết hạn bảo hành từ tuần trước.',
    });
    wrapper.unmount();
  });

  it('closes without a note when the customer already agreed, otherwise asks for one', async () => {
    const agreed = mountModal('close', claim({ status: 'awaiting_customer', customerResponse: 'agreed' }));
    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'rejected' }) } });
    await submit(agreed).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/service-manager/warranty-claims/claim-1/close', { outcome: 'rejected' });
    agreed.unmount();

    vi.clearAllMocks();
    const silent = mountModal('close', claim({ status: 'awaiting_customer', customerResponse: null }));
    await submit(silent).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(silent.text()).toContain('ghi chú đóng yêu cầu');
    silent.unmount();
  });

  it('shows the Backend rejection and stays open', async () => {
    apiClientMock.post.mockRejectedValueOnce({ response: { data: { message: 'Yêu cầu bị phản đối cần do một quản lý khác xem xét lại.' } } });
    const wrapper = mountModal('close', claim({ status: 'disputed' }));
    await wrapper.get('#warranty-close-note').setValue('Đã xem lại bằng chứng của hai bên.');
    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('một quản lý khác');
    expect(wrapper.emitted('done')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('ConsoleWarrantyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  const asRole = (role: string) => {
    useAuthStore().setAuth('token', { id: 'u1', fullName: 'Quản lý', email: 'sm@test.vn', role } as never);
  };

  it('lists claims with their status, flags and decision buttons for a service manager', async () => {
    asRole('service_manager');
    apiClientMock.get.mockResolvedValueOnce(
      listResponse([
        claim({ id: 'a', status: 'inspected' }),
        claim({ id: 'b', status: 'submitted', technician: null, submittedAfterExpiry: true, visit: null }),
        claim({ id: 'c', status: 'awaiting_customer', customerResponse: 'agreed' }),
        claim({ id: 'd', status: 'resolved' }),
      ]),
    );
    const wrapper = mount(ConsoleWarrantyPage, { global: { stubs: routerStub } });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('Chờ quản lý dịch vụ duyệt');
    expect(text).toContain('Chưa có kỹ thuật viên');
    expect(text).toContain('Gửi sau khi hết hạn');
    expect(text).toContain('Khách đã đồng ý');
    expect(text).toContain('Duyệt kết luận');
    expect(text).toContain('Phân công kỹ thuật viên');
    expect(text).toContain('Đóng yêu cầu');
    // a closed claim offers no decision
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Duyệt kết luận')).toHaveLength(1);
  });

  it('hides every decision button for an administrator (read only)', async () => {
    asRole('admin');
    apiClientMock.get.mockResolvedValueOnce(listResponse([claim({ id: 'a', status: 'inspected' })]));
    const wrapper = mount(ConsoleWarrantyPage, { global: { stubs: routerStub } });
    await flushPromises();
    expect(wrapper.text()).not.toContain('Duyệt kết luận');
    expect(wrapper.text()).toContain('Vòi sen');
  });

  it('loads the rates only when the tab is opened and marks small samples', async () => {
    asRole('service_manager');
    apiClientMock.get.mockResolvedValueOnce(listResponse([]));
    const wrapper = mount(ConsoleWarrantyPage, { global: { stubs: routerStub } });
    await flushPromises();

    apiClientMock.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            technicianId: 'tech-1', fullName: 'Kỹ thuật viên A', ordersWithWarranty: 4, claims: 1, claimRate: 0.25,
            covered: 0, notCovered: 1, notCoveredRate: 1, overridden: 0, overriddenRate: 0,
            disputed: 0, disputedRate: 0, declines: 0, declineRate: 0, lowSample: true,
          },
        ],
      },
    });
    await wrapper.findAll('[role="tab"]').find((b) => b.text().includes('Tỷ lệ'))!.trigger('click');
    await flushPromises();

    expect(apiClientMock.get).toHaveBeenLastCalledWith('/service-manager/warranty-claims/stats/technicians', { params: { windowDays: 90 } });
    expect(wrapper.text()).toContain('Kỹ thuật viên A');
    expect(wrapper.text()).toContain('25%');
    expect(wrapper.text()).toContain('Ít dữ liệu');
  });

  it('shows an empty state and a load error', async () => {
    asRole('service_manager');
    apiClientMock.get.mockResolvedValueOnce(listResponse([]));
    const empty = mount(ConsoleWarrantyPage, { global: { stubs: routerStub } });
    await flushPromises();
    expect(empty.text()).toContain('Không có yêu cầu bảo hành');

    apiClientMock.get.mockRejectedValueOnce({ response: { data: { message: 'Không có quyền.' } } });
    const failed = mount(ConsoleWarrantyPage, { global: { stubs: routerStub } });
    await flushPromises();
    expect(failed.text()).toContain('Không có quyền.');
  });
});

describe('support helpers for the manager console', () => {
  it('offers one Vietnamese label per standard outcome', () => {
    expect(RESOLUTION_CODES).toHaveLength(9);
    for (const code of RESOLUTION_CODES) expect(resolutionCodeLabels[code]).toBeTruthy();
  });

  it('flags only unresolved cases past their response time', () => {
    const now = new Date('2026-09-30T00:00:00.000Z');
    expect(isResponseOverdue('open', '2026-09-29T23:00:00.000Z', now)).toBe(true);
    expect(isResponseOverdue('in_review', '2026-09-30T01:00:00.000Z', now)).toBe(false);
    expect(isResponseOverdue('resolved', '2026-09-29T23:00:00.000Z', now)).toBe(false);
    expect(isResponseOverdue('open', null, now)).toBe(false);
  });
});
