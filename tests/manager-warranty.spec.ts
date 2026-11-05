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
    await warrantyManagerApi.reviewDecline('claim-1', { valid: false, note: 'Lịch của thợ còn trống.' });
    expect(apiClientMock.post.mock.calls.map((call) => call[0])).toEqual([
      '/service-manager/warranty-claims/claim-1/assign',
      '/service-manager/warranty-claims/claim-1/approve',
      '/service-manager/warranty-claims/claim-1/reject',
      '/service-manager/warranty-claims/claim-1/close',
      '/service-manager/warranty-claims/claim-1/review-decline',
    ]);
  });

  it('asks only for the claims waiting for a decline review when told to', async () => {
    apiClientMock.get.mockResolvedValueOnce(listResponse([]));
    await warrantyManagerApi.listQueue({ page: 1, limit: 10, declineReview: 'pending' });
    expect(apiClientMock.get).toHaveBeenCalledWith('/service-manager/warranty-claims', {
      params: { page: 1, limit: 10, declineReview: 'pending' },
    });
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
  const mountModal = (mode: 'assign' | 'approve' | 'reject' | 'close' | 'review', c = claim()) =>
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

  it('demands a customer note for not covered and a written reason for changing the technician proposal', async () => {
    const wrapper = mountModal('approve');
    await wrapper.findAll('input[type="radio"]')[2].setValue();
    expect(wrapper.find('#warranty-override-reason').exists()).toBe(true);
    await submit(wrapper).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('giải thích cho khách hàng');

    await wrapper.get('#warranty-final-reason').setValue('normal_wear');
    await wrapper.get('#warranty-customer-note').setValue('Linh kiện đã hao mòn tự nhiên theo thời gian.');
    await submit(wrapper).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('lý do đổi kết luận');

    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'awaiting_customer' }) } });
    await wrapper.get('#warranty-override-reason').setValue('Ảnh cho thấy linh kiện mòn đều theo thời gian.');
    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/service-manager/warranty-claims/claim-1/approve', {
      result: 'not_covered',
      reasonCode: 'normal_wear',
      customerNote: 'Linh kiện đã hao mòn tự nhiên theo thời gian.',
      overrideReason: 'Ảnh cho thấy linh kiện mòn đều theo thời gian.',
    });
    wrapper.unmount();
  });

  it('offers a FixHome part for a workmanship fault and sends it with the approval', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountModal('approve');
      await wrapper.findAll('input[type="radio"]')[0].setValue();
      await wrapper.get('#warranty-override-reason').setValue('Mối nối lỏng là do lắp, không phải linh kiện.');

      apiClientMock.get.mockResolvedValueOnce({ data: { data: [{ id: 'part-9', name: 'Bo mạch điều hoà', sellingPrice: 400000 }], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } } });
      await wrapper.get('input[type="search"]').setValue('bo mạch');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();
      expect(apiClientMock.get).toHaveBeenCalledWith('/parts/catalog', { params: { search: 'bo mạch', limit: 10 } });

      await wrapper.get('select[aria-label="Linh kiện"]').setValue('part-9');
      apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'in_progress' }) } });
      await submit(wrapper).trigger('click');
      await flushPromises();
      expect(apiClientMock.post).toHaveBeenCalledWith('/service-manager/warranty-claims/claim-1/approve', {
        result: 'covered_workmanship',
        overrideReason: 'Mối nối lỏng là do lắp, không phải linh kiện.',
        replacementParts: [{ partCatalogId: 'part-9', quantity: 1 }],
      });
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not offer the part picker for a part fault, where FixHome supplies it', () => {
    const wrapper = mountModal('approve');
    expect(wrapper.find('input[type="search"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('judges a decline: a note is required and "not justified" is sent as valid false', async () => {
    const wrapper = mountModal('review', claim({ status: 'submitted', technician: null, declineReview: 'pending', declineReasonCode: 'busy' }));
    expect(wrapper.text()).toContain('Xét việc từ chối bảo hành');
    await submit(wrapper).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('nhận xét');

    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'submitted', declineReview: 'invalid' }) } });
    await wrapper.findAll('input[type="radio"]')[1].setValue();
    await wrapper.get('#warranty-review-note').setValue('Lịch của kỹ thuật viên còn trống hôm đó.');
    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/service-manager/warranty-claims/claim-1/review-decline', {
      valid: false,
      note: 'Lịch của kỹ thuật viên còn trống hôm đó.',
    });
    wrapper.unmount();
  });

  it('titles a no-show review differently from a decline review', () => {
    const wrapper = mountModal('review', claim({ status: 'accepted', declineReview: 'pending', noShowFlaggedAt: '2026-11-03T00:00:00.000Z' }));
    expect(wrapper.text()).toContain('Xét việc không đến kiểm tra');
    wrapper.unmount();
  });

  it('closes an unfixed claim with a refund: needs a note even when the customer agreed, and a whole-VND amount', async () => {
    const wrapper = mountModal('close', claim({ status: 'awaiting_customer', customerResponse: 'agreed' }));
    await wrapper.get('input[value="unfixed"]').setValue();
    await submit(wrapper).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('ghi chú đóng yêu cầu');

    await wrapper.get('#warranty-close-note').setValue('Đã thử hai lần nhưng không khắc phục được.');
    await wrapper.get('#warranty-refund').setValue('12,5');
    await submit(wrapper).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('số nguyên');

    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'resolved', outcomeCode: 'unfixed', refundAmount: 250000 }) } });
    await wrapper.get('#warranty-refund').setValue('250000');
    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/service-manager/warranty-claims/claim-1/close', {
      outcome: 'unfixed',
      note: 'Đã thử hai lần nhưng không khắc phục được.',
      refundAmount: 250000,
    });
    wrapper.unmount();
  });

  it('leaves the refund blank to refund the whole covered line', async () => {
    const wrapper = mountModal('close', claim({ status: 'in_progress' }));
    await wrapper.get('input[value="unfixed"]').setValue();
    await wrapper.get('#warranty-close-note').setValue('Linh kiện không còn bán, không sửa được.');
    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'resolved' }) } });
    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/service-manager/warranty-claims/claim-1/close', {
      outcome: 'unfixed',
      note: 'Linh kiện không còn bán, không sửa được.',
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
    expect(text).toContain('Chờ duyệt kết luận');
    expect(text).toContain('Chờ phân công');
    expect(text).toContain('Gửi sau hạn');
    expect(text).toContain('Khách đồng ý, chờ đóng');
    expect(text).toContain('Duyệt kết luận');
    expect(text).toContain('Phân công kỹ thuật viên');
    expect(text).toContain('Đóng yêu cầu');
    // a closed claim offers no decision
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Duyệt kết luận')).toHaveLength(1);
    expect(wrapper.find('[data-testid="warranty-read-only"]').exists()).toBe(false);
  });

  it('flags a claim waiting for a decline review and opens the review instead of the usual action', async () => {
    asRole('service_manager');
    apiClientMock.get.mockResolvedValueOnce(
      listResponse([
        claim({ id: 'a', status: 'submitted', technician: null, visit: null, declineReview: 'pending', declineReasonCode: 'busy' }),
        claim({ id: 'b', status: 'accepted', declineReview: 'pending', noShowFlaggedAt: '2026-11-03T00:00:00.000Z' }),
        claim({ id: 'c', status: 'resolved', outcomeCode: 'unfixed', refundAmount: 250000 }),
      ]),
    );
    const wrapper = mount(ConsoleWarrantyPage, { global: { stubs: routerStub } });
    await flushPromises();

    expect(wrapper.text()).toContain('Chờ xét từ chối');
    expect(wrapper.text()).toContain('Chờ xét không đến');
    expect(wrapper.text()).toContain('Không khắc phục được, đã hoàn tiền');
    const buttons = wrapper.findAll('button').map((b) => b.text());
    expect(buttons).toContain('Xét từ chối');
    expect(buttons).toContain('Xét không đến');
  });

  it('filters the queue to the claims waiting for a decline review', async () => {
    asRole('service_manager');
    apiClientMock.get.mockResolvedValue(listResponse([]));
    const wrapper = mount(ConsoleWarrantyPage, { global: { stubs: routerStub } });
    await flushPromises();

    await wrapper.findAll('input[type="checkbox"]')[1].setValue(true);
    await flushPromises();
    expect(apiClientMock.get).toHaveBeenLastCalledWith('/service-manager/warranty-claims', {
      params: { page: 1, limit: 10, declineReview: 'pending' },
    });
  });

  it('hides every decision button for an administrator (read only)', async () => {
    asRole('admin');
    apiClientMock.get.mockResolvedValueOnce(listResponse([claim({ id: 'a', status: 'inspected' })]));
    const wrapper = mount(ConsoleWarrantyPage, { global: { stubs: routerStub } });
    await flushPromises();
    expect(wrapper.text()).not.toContain('Duyệt kết luận');
    expect(wrapper.text()).toContain('Vòi sen');
    expect(wrapper.get('[data-testid="warranty-read-only"]').text()).toContain('chỉ đọc');
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
    // Mirrors the backend COMPLAINT_RESOLUTION_CODES, refund_to_wallet included (PO 08/10/2026).
    expect(RESOLUTION_CODES).toHaveLength(10);
    expect(resolutionCodeLabels.refund_to_wallet).toBe('Hoàn tiền vào ví khách');
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
