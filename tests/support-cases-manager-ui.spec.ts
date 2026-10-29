import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../src/stores/auth';
import { UserRole } from '../src/types';
import FhConfirmDialog from '../src/components/FhConfirmDialog.vue';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  useAuthStore().setAuth('test-token', {
    id: 'sm-1', fullName: 'Test Manager', email: 'manager@example.test', status: 'ACTIVE',
    role: UserRole.SERVICE_MANAGER, permissions: ['support:read_all', 'support:resolve'],
  });
});

const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/client')>()),
  default: apiClientMock,
}));

import { supportCasesApi } from '../src/api/support-cases.api';
import SupportDetailPage from '../src/pages/console/SupportDetailPage.vue';
import SupportQueuePage from '../src/pages/console/SupportQueuePage.vue';

const envelope = (data: unknown, meta?: unknown, statusCode = 200) => ({
  data: { success: true, statusCode, message: 'OK', data, ...(meta ? { meta } : {}) },
});

const baseCase = (overrides: Record<string, unknown> = {}) => ({
  id: 'case-1',
  caseType: 'property_damage',
  status: 'open',
  bookingId: 'booking-1',
  serviceOrderId: 'order-1',
  customerId: 'customer-1',
  technicianId: 'tech-1',
  createdByUserId: 'customer-1',
  assignedManagerId: null,
  reason: 'Thợ làm vỡ gạch ốp tường khi khoan',
  description: null,
  resolutionCode: null,
  resolutionReason: null,
  evidenceRefs: null,
  resolvedAt: null,
  isUrgent: true,
  respondBy: '2026-09-29T08:30:00.000Z',
  holdCompletion: false,
  liableParty: null,
  amount: null,
  createdAt: '2026-09-29T08:00:00.000Z',
  updatedAt: '2026-09-29T08:00:00.000Z',
  ...overrides,
});

describe('supportCasesApi manager additions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the urgency, hold and recorded liability fields', async () => {
    apiClientMock.get.mockResolvedValueOnce(
      envelope(baseCase({ holdCompletion: true, liableParty: 'technician', amount: 150000 })),
    );
    const detail = await supportCasesApi.getCase('case-1');
    expect(detail).toMatchObject({ isUrgent: true, holdCompletion: true, liableParty: 'technician', amount: 150000 });
  });

  it('takes a case, toggles the hold and sorts the queue by priority', async () => {
    apiClientMock.post.mockResolvedValue(envelope(baseCase({ status: 'in_review' })));
    await supportCasesApi.startReview('case-1');
    await supportCasesApi.setHold('case-1', true);
    expect(apiClientMock.post).toHaveBeenNthCalledWith(1, '/support/cases/case-1/review');
    expect(apiClientMock.post).toHaveBeenNthCalledWith(2, '/support/cases/case-1/hold', { hold: true });

    apiClientMock.get.mockResolvedValueOnce(envelope([baseCase()], { page: 1, limit: 10, total: 1, totalPages: 1 }));
    await supportCasesApi.listCases({ sort: 'priority' });
    expect(apiClientMock.get).toHaveBeenLastCalledWith('/support/cases', { params: { sort: 'priority' } });
  });

  it('sends the liable party and amount and refuses an invalid amount', async () => {
    apiClientMock.post.mockResolvedValueOnce(envelope(baseCase({ status: 'resolved' })));
    await supportCasesApi.resolveCase('case-1', {
      finalStatus: 'resolved',
      resolutionCode: 'warning_issued',
      reason: 'Đã nhắc nhở kỹ thuật viên và ghi nhận.',
      liableParty: 'technician',
      amount: 100000,
    });
    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/support/cases/case-1/resolve',
      expect.objectContaining({ liableParty: 'technician', amount: 100000 }),
    );

    await expect(
      supportCasesApi.resolveCase('case-1', {
        finalStatus: 'resolved',
        resolutionCode: 'warning_issued',
        reason: 'Đã nhắc nhở kỹ thuật viên và ghi nhận.',
        amount: -1,
      }),
    ).rejects.toThrow('Invalid support case resolve payload.');
  });
});

describe('SupportDetailPage for a complaint', () => {
  beforeEach(() => vi.clearAllMocks());

  const mountPage = async (data = baseCase()) => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/console/support/:id', component: SupportDetailPage },
        { path: '/console/support', component: { template: '<div />' } },
        { path: '/console/orders/:id', component: { template: '<div />' } },
      ],
    });
    apiClientMock.get.mockResolvedValueOnce(envelope(data));
    await router.push('/console/support/case-1');
    const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] }, attachTo: document.body });
    await router.isReady();
    await flushPromises();
    return wrapper;
  };
  const button = (wrapper: Awaited<ReturnType<typeof mountPage>>, label: string) =>
    wrapper.findAll('button').find((b) => b.text() === label);

  it.each(['property_damage', 'cash_mismatch', 'parts_dispute', 'technician_replacement'])(
    'lets Admin read %s without any manager operation or replacement preflight', async (caseType) => {
      const auth = useAuthStore();
      auth.user!.role = UserRole.ADMIN;
      const wrapper = await mountPage(baseCase({ caseType, evidenceRefs: ['https://example.test/evidence.jpg'],
        ...(caseType === 'technician_replacement' ? {
          reasonClass: 'technician_skill_gap', reasonCode: 'skill_gap', responsibility: 'pending', workflowVersion: 0,
        } : {}),
      }));
      try {
        expect(wrapper.text()).toContain('Thợ làm vỡ gạch');
        expect(wrapper.text()).toContain('Chỉ xem');
        expect(wrapper.find('a[href="https://example.test/evidence.jpg"]').exists()).toBe(true);
        expect(wrapper.findAll('form, textarea, input, select')).toHaveLength(0);
        for (const label of ['Nhận xử lý case này', 'Giữ đơn không tự hoàn tất', 'Kiểm tra lại hoàn tất đơn', 'Xem đối soát tiền mặt']) {
          expect(button(wrapper, label)).toBeUndefined();
        }
        expect(wrapper.find('[data-testid="replacement-panel"]').exists()).toBe(false);
        expect(wrapper.findComponent(FhConfirmDialog).exists()).toBe(false);
        expect(apiClientMock.get.mock.calls.map(([path]) => path)).toEqual(['/support/cases/case-1']);
        expect(apiClientMock.post).not.toHaveBeenCalled();
        expect(wrapper.text()).not.toContain('Thiếu phiên bản quy trình');
      } finally { wrapper.unmount(); }
    },
  );

  it('blocks a pending resolution callback if the role changes to Admin', async () => {
    const wrapper = await mountPage();
    await wrapper.findAll('select')[1].setValue('warning_issued');
    await wrapper.get('textarea').setValue('Đã kiểm tra bằng chứng và ghi nhận kết quả.');
    await wrapper.get('form').trigger('submit');
    const dialog = wrapper.getComponent(FhConfirmDialog);
    useAuthStore().user!.role = UserRole.ADMIN;
    dialog.vm.$emit('confirm');
    await flushPromises();
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.find('form').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not offer manager operations without support resolve permission', async () => {
    useAuthStore().user!.permissions = ['support:read_all'];
    const wrapper = await mountPage();
    try {
      expect(wrapper.text()).toContain('Thợ làm vỡ gạch');
      expect(wrapper.find('form').exists()).toBe(false);
      expect(button(wrapper, 'Nhận xử lý case này')).toBeUndefined();
      expect(button(wrapper, 'Giữ đơn không tự hoàn tất')).toBeUndefined();
      expect(apiClientMock.post).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  it('clears case data if the server denies an Admin detail read', async () => {
    useAuthStore().user!.role = UserRole.ADMIN;
    const wrapper = await mountPage();
    try {
      apiClientMock.get.mockRejectedValueOnce({ response: { status: 403, data: { message: 'Private server detail' } } });
      await wrapper.getComponent(SupportDetailPage).vm.$router.push('/console/support/forbidden-case');
      await flushPromises();
      expect(wrapper.text()).toContain('Chưa tải được');
      expect(wrapper.text()).not.toContain('Thợ làm vỡ gạch');
      expect(wrapper.text()).not.toContain('Private server detail');
      expect(wrapper.find('form').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('does not claim resolution success when the server rejects it', async () => {
    const wrapper = await mountPage();
    await wrapper.findAll('select')[1].setValue('warning_issued');
    await wrapper.get('textarea').setValue('Đã kiểm tra bằng chứng và ghi nhận kết quả.');
    await wrapper.get('form').trigger('submit');
    apiClientMock.post.mockRejectedValueOnce(new Error('Forbidden'));
    wrapper.getComponent(FhConfirmDialog).vm.$emit('confirm');
    await flushPromises();
    expect(wrapper.text()).not.toContain('Đã lưu kết quả xử lý.');
    expect(wrapper.get('[role="alert"]').text()).toContain('Chưa lưu được');
    wrapper.unmount();
  });

  it('drops a pending resolution when navigating to another case', async () => {
    const wrapper = await mountPage();
    await wrapper.findAll('select')[1].setValue('warning_issued');
    await wrapper.get('textarea').setValue('Kết quả chỉ dành cho yêu cầu hỗ trợ đầu tiên.');
    await wrapper.get('form').trigger('submit');
    const dialog = wrapper.getComponent(FhConfirmDialog);
    apiClientMock.get.mockResolvedValueOnce(envelope(baseCase({ id: 'case-2', reason: 'Yêu cầu hỗ trợ khác' })));
    await wrapper.getComponent(SupportDetailPage).vm.$router.push('/console/support/case-2');
    await flushPromises();
    dialog.vm.$emit('confirm');
    await flushPromises();
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.getComponent(FhConfirmDialog).props('open')).toBe(false);
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('');
    wrapper.unmount();
  });

  it('ignores a late detail response from a previously selected case', async () => {
    const wrapper = await mountPage();
    let resolveOld!: (value: unknown) => void;
    apiClientMock.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const router = wrapper.getComponent(SupportDetailPage).vm.$router;
    await router.push('/console/support/case-2');
    await flushPromises();
    apiClientMock.get.mockResolvedValueOnce(envelope(baseCase({ id: 'case-3', reason: 'Nội dung hồ sơ hiện tại' })));
    await router.push('/console/support/case-3');
    await flushPromises();
    resolveOld(envelope(baseCase({ id: 'case-2', reason: 'Nội dung hồ sơ cũ' })));
    await flushPromises();
    expect(wrapper.text()).toContain('Nội dung hồ sơ hiện tại');
    expect(wrapper.text()).not.toContain('Nội dung hồ sơ cũ');
    wrapper.unmount();
  });

  it('does not apply a late claim result or success message to another case', async () => {
    const wrapper = await mountPage();
    let resolveClaim!: (value: unknown) => void;
    apiClientMock.post.mockImplementationOnce(() => new Promise(resolve => { resolveClaim = resolve; }));
    await button(wrapper, 'Nhận xử lý case này')!.trigger('click');
    apiClientMock.get.mockResolvedValueOnce(envelope(baseCase({ id: 'case-2', reason: 'Hồ sơ đang xem' })));
    await wrapper.getComponent(SupportDetailPage).vm.$router.push('/console/support/case-2');
    await flushPromises();
    resolveClaim(envelope(baseCase({ status: 'in_review', reason: 'Hồ sơ đã rời đi' })));
    await flushPromises();
    try {
      expect(wrapper.text()).toContain('Hồ sơ đang xem');
      expect(wrapper.text()).not.toContain('Hồ sơ đã rời đi');
      expect(wrapper.text()).not.toContain('Bạn đã nhận xử lý case này.');
    } finally { wrapper.unmount(); }
  });

  it('shows urgency, the overdue response time and the intervention tools', async () => {
    const wrapper = await mountPage();
    const text = wrapper.text();
    expect(text).toContain('Cần xử lý ngay');
    expect(text).toContain('Quá hạn phản hồi');
    expect(text).toContain('Nhận xử lý case này');
    expect(text).toContain('Giữ đơn không tự hoàn tất');
    wrapper.unmount();
  });

  it('takes the case and toggles the hold through the Backend', async () => {
    const wrapper = await mountPage();
    apiClientMock.post.mockResolvedValueOnce(envelope(baseCase({ status: 'in_review', assignedManagerId: 'sm-1' })));
    await button(wrapper, 'Nhận xử lý case này')!.trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/support/cases/case-1/review');
    expect(wrapper.text()).toContain('Bạn đã nhận xử lý case này');
    expect(button(wrapper, 'Nhận xử lý case này')).toBeUndefined();

    apiClientMock.post.mockResolvedValueOnce(envelope(baseCase({ status: 'in_review', holdCompletion: true })));
    await button(wrapper, 'Giữ đơn không tự hoàn tất')!.trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenLastCalledWith('/support/cases/case-1/hold', { hold: true });
    expect(wrapper.text()).toContain('Bỏ giữ hoàn tất đơn');
    expect(button(wrapper, 'Kiểm tra lại hoàn tất đơn')).toBeUndefined();
    wrapper.unmount();
  });

  it('asks the Backend to re-check completion after a release', async () => {
    const wrapper = await mountPage();
    apiClientMock.post.mockResolvedValueOnce(envelope({ completed: false, status: 'under_repair' }));
    await button(wrapper, 'Kiểm tra lại hoàn tất đơn')!.trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/service-orders/order-1/retry-completion');
    expect(wrapper.text()).toContain('chưa đủ điều kiện hoàn tất');
    wrapper.unmount();
  });

  it('resolves with a standard outcome, the liable party and the amount', async () => {
    const wrapper = await mountPage();
    const options = wrapper.findAll('select option').map((o) => o.text());
    expect(options).toContain('Cảnh cáo');
    expect(options).toContain('Ghi nhận hoàn tiền');

    const selects = wrapper.findAll('select');
    await selects[1].setValue('warning_issued');
    await selects[2].setValue('technician');
    await wrapper.get('input[type="number"]').setValue('150000');
    await wrapper.get('textarea').setValue('Đã nhắc nhở kỹ thuật viên và ghi nhận vào hồ sơ.');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    apiClientMock.post.mockResolvedValueOnce(envelope(baseCase({ status: 'resolved', resolutionCode: 'warning_issued' })));
    const confirm = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes('Gửi kết quả'));
    expect(confirm).toBeDefined();
    confirm!.click();
    await flushPromises();

    expect(apiClientMock.post).toHaveBeenCalledWith('/support/cases/case-1/resolve', {
      finalStatus: 'resolved',
      resolutionCode: 'warning_issued',
      reason: 'Đã nhắc nhở kỹ thuật viên và ghi nhận vào hồ sơ.',
      liableParty: 'technician',
      amount: 150000,
    });
    wrapper.unmount();
  });

  it('settles a cash case with the exact code the backend acts on', async () => {
    const wrapper = await mountPage(baseCase({ caseType: 'cash_mismatch', isUrgent: false, respondBy: null }));
    expect(wrapper.find('input[type="text"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Bên chịu trách nhiệm');
    const selects = wrapper.findAll('select');
    expect(selects[1].findAll('option').map((o) => o.text())).toContain('Xác nhận khách đã trả đủ tiền mặt theo hoá đơn');
    await selects[1].setValue('CASH_SETTLEMENT_CONFIRMED_BY_MANAGER');
    expect(wrapper.text()).toContain('phí nền tảng trừ vào ví kỹ thuật viên');
    await wrapper.get('textarea').setValue('Đã gọi khách, khách xác nhận trả đủ tiền mặt.');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    apiClientMock.post.mockResolvedValueOnce(envelope(baseCase({ caseType: 'cash_mismatch', status: 'resolved' })));
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes('Gửi kết quả'))!.click();
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/support/cases/case-1/resolve', {
      finalStatus: 'resolved',
      resolutionCode: 'CASH_SETTLEMENT_CONFIRMED_BY_MANAGER',
      reason: 'Đã gọi khách, khách xác nhận trả đủ tiền mặt.',
    });
    wrapper.unmount();
  });

  it('shows the typed technician report and posts a versioned manager responsibility decision', async () => {
    const typedCase = baseCase({
      caseType: 'technician_replacement',
      reason: 'Thao tác khoan sai quy trình làm hỏng dây cấp nguồn.',
      reasonClass: 'technician_skill_gap',
      reasonCode: 'skill_gap',
      responsibility: 'pending',
      responsibilityCommandId: null,
      responsibilityActorId: null,
      responsibilityReason: null,
      responsibilityEvidenceRefs: null,
      responsibilityDecidedAt: null,
      workflowVersion: 0,
      evidenceRefs: ['media-1'],
    });
    const resolvedCase = baseCase({
      ...typedCase,
      status: 'resolved',
      responsibility: 'technician_fault',
      workflowVersion: 2,
    });
    apiClientMock.get.mockImplementation(async (path: string) => {
      if (path === '/support/cases/case-1/replacement-options') return envelope({
        caseId: 'case-1', caseStatus: 'open', caseVersion: 1, serviceOrderId: 'order-1', visitGroupId: null,
        requestIntent: null,
        flags: { approvedQuote: false, invoice: false, payment: false, voucher: false, parts: false, incompleteSiblings: false },
        actions: {
          DIRECT_REASSIGN_SOLO: { allowed: false, reasons: ['ASSIGNMENT_CHANGED'] },
          CLOSE_FOR_REBOOK: { allowed: true, reasons: [] },
          REJECT_REQUEST: { allowed: true, reasons: [] },
        },
      });
      if (path === '/support/cases/case-1') return envelope(resolvedCase);
      return envelope([]);
    });
    const wrapper = await mountPage(typedCase);

    expect(wrapper.text()).toContain('Đánh giá trách nhiệm');
    expect(wrapper.text()).toContain('Lỗi thuộc kỹ năng hoặc thao tác kỹ thuật');
    expect(wrapper.text()).toContain('Thiếu kỹ năng hoặc thao tác chưa đúng');
    expect(wrapper.text()).toContain('Báo cáo không tự trừ điểm kỹ thuật viên.');
    await wrapper.get('[data-testid="responsibility-decision"]').setValue('technician_fault');
    await wrapper.get('[data-testid="responsibility-reason"]').setValue('Ảnh kiểm tra cho thấy thao tác sai quy trình.');

    apiClientMock.post.mockResolvedValueOnce(envelope(baseCase({
      caseType: 'technician_replacement',
      reason: 'Thao tác khoan sai quy trình làm hỏng dây cấp nguồn.',
      reasonClass: 'technician_skill_gap',
      reasonCode: 'skill_gap',
      responsibility: 'technician_fault',
      responsibilityReason: 'Ảnh kiểm tra cho thấy thao tác sai quy trình.',
      workflowVersion: 1,
    })));
    await wrapper.get('[data-testid="responsibility-form"]').trigger('submit');
    await flushPromises();

    expect(apiClientMock.post).toHaveBeenCalledTimes(1);
    expect(apiClientMock.post).toHaveBeenCalledWith('/support/cases/case-1/responsibility', {
      commandId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      workflowVersion: 0,
      decision: 'technician_fault',
      reason: 'Ảnh kiểm tra cho thấy thao tác sai quy trình.',
    });
    expect(wrapper.text()).toContain('Lỗi thuộc trách nhiệm kỹ thuật viên');
    const replacement = wrapper.get('[data-testid="replacement-panel"]');
    expect(replacement.text()).toContain('Đây là xử lý vận hành của đơn, tách biệt với kết luận trách nhiệm');
    await replacement.get('[data-testid="replacement-reason"]').setValue('Khách đã xác nhận muốn chọn lịch mới.');
    await replacement.get('[data-testid="replacement-action-CLOSE_FOR_REBOOK"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="replacement-confirm-dialog"]').text()).toContain('khách cần chọn lịch và xác nhận giá mới');
    apiClientMock.post.mockResolvedValueOnce(envelope({
      case: {
        id: 'case-1', status: 'resolved', workflowVersion: 2, requestIntent: null,
        resolutionCode: 'interrupted_for_rebook', resolutionReason: 'Khách đã xác nhận muốn chọn lịch mới.',
        serviceOrderId: 'order-1', holdCompletion: false,
      },
      order: { id: 'order-1', status: 'CANCELLED' },
      nextAction: 'interruption_rebook',
    }));
    await wrapper.get('[data-testid="replacement-confirm"]').trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenLastCalledWith('/support/cases/case-1/resolve-interruption', expect.objectContaining({
      action: 'CLOSE_FOR_REBOOK',
      expectedCaseVersion: 1,
      reason: 'Khách đã xác nhận muốn chọn lịch mới.',
    }));
    expect(wrapper.text()).toContain('khách cần xác nhận lịch và giá mới');
    wrapper.unmount();
  });

  it('keeps device-too-old in the non-technician exception responsibility path', async () => {
    const wrapper = await mountPage(baseCase({
      caseType: 'technician_replacement',
      reason: 'Thiết bị đã quá cũ để sửa tại nhà.',
      reasonClass: 'non_technician_exception',
      reasonCode: 'device_too_old',
      responsibility: 'pending',
      workflowVersion: 0,
    }));
    expect(wrapper.text()).toContain('Ngoại lệ thiết bị hoặc khách hàng');
    expect(wrapper.text()).toContain('Thiết bị đã quá cũ');
    expect(wrapper.text()).toContain('Chưa có quyết định về điểm uy tín.');
    wrapper.unmount();
  });

  it('does not offer settling the cash when the cash case is rejected', async () => {
    const wrapper = await mountPage(baseCase({ caseType: 'cash_non_response', isUrgent: false, respondBy: null }));
    const selects = wrapper.findAll('select');
    await selects[1].setValue('CASH_SETTLEMENT_CONFIRMED_BY_MANAGER');
    await selects[0].setValue('rejected');
    await flushPromises();
    const codes = wrapper.findAll('select')[1].findAll('option').map((o) => o.attributes('value'));
    expect(codes).not.toContain('CASH_SETTLEMENT_CONFIRMED_BY_MANAGER');
    expect((wrapper.findAll('select')[1].element as HTMLSelectElement).value).toBe('');
    wrapper.unmount();
  });

  it('submits an approved funded gross separately from customer NET, including 0 wallet due', async () => {
    const wrapper = await mountPage(baseCase({ caseType: 'parts_dispute' }));
    await wrapper.findAll('select')[1].setValue('refund_to_wallet');
    await flushPromises();
    expect(wrapper.find('[data-testid="funded-gross-refund-field"]').exists()).toBe(true);
    const amounts = wrapper.findAll('input[type="number"]');
    await amounts[0].setValue('0');
    await wrapper.get('[data-testid="funded-gross-refund-input"]').setValue('150000');
    await wrapper.get('textarea').setValue('Đã xác minh hoàn phần tiền gốc được FixHome tài trợ theo voucher.');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    const confirm = Array.from(document.body.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Gửi kết quả'));
    expect(confirm).toBeDefined();
    apiClientMock.post.mockResolvedValueOnce(envelope(baseCase({ status: 'resolved', resolutionCode: 'refund_to_wallet' })));
    confirm!.click();
    await flushPromises();

    expect(apiClientMock.post).toHaveBeenCalledWith('/support/cases/case-1/resolve',
      expect.objectContaining({ resolutionCode: 'refund_to_wallet', amount: 0, grossRefundVnd: 150000, liableParty: 'platform' }));
    wrapper.unmount();
  });

  it('offers a wallet refund only for a faulty part or a warranty, borne by FixHome', async () => {
    const quality = await mountPage(baseCase({ caseType: 'quality' }));
    expect(quality.findAll('select')[1].findAll('option').map((o) => o.attributes('value'))).not.toContain('refund_to_wallet');
    quality.unmount();

    for (const caseType of ['parts_dispute', 'warranty_dispute']) {
      const wrapper = await mountPage(baseCase({ caseType }));
      const selects = wrapper.findAll('select');
      expect(selects[1].findAll('option').map((o) => o.attributes('value'))).toContain('refund_to_wallet');
      await selects[1].setValue('refund_to_wallet');
      await flushPromises();
      expect(wrapper.get('[data-testid="refund-wallet-hint"]').text()).toContain('FixHome chịu khoản hoàn');
      expect((wrapper.findAll('select')[2].element as HTMLSelectElement).value).toBe('platform');
      wrapper.unmount();
    }
  });
});

describe('SupportQueuePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens a cash case in the Admin read-only detail instead of the SM cash page', async () => {
    useAuthStore().user!.role = UserRole.ADMIN;
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/console/support', component: SupportQueuePage },
      { path: '/console/support/:id', component: { template: '<div />' } },
      { path: '/console/support/cash/:id', component: { template: '<div />' } },
      { path: '/console/orders/:id', component: { template: '<div />' } },
    ] });
    apiClientMock.get.mockResolvedValueOnce(envelope([baseCase({ caseType: 'cash_mismatch' })], { page: 1, limit: 10, total: 1, totalPages: 1 }));
    await router.push('/console/support');
    const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] } });
    await flushPromises();
    expect(wrapper.text()).toContain('Chỉ xem');
    await wrapper.get('button[aria-label^="Mở chi tiết"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/console/support/case-1');
    wrapper.unmount();
  });

  it('asks for the priority order and flags urgent, overdue and held cases', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/console/support', component: SupportQueuePage }],
    });
    apiClientMock.get.mockResolvedValueOnce(
      envelope(
        [baseCase({ holdCompletion: true }), baseCase({ id: 'case-2', isUrgent: false, respondBy: null })],
        { page: 1, limit: 10, total: 2, totalPages: 1 },
      ),
    );
    await router.push('/console/support');
    const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] } });
    await router.isReady();
    await flushPromises();

    expect(apiClientMock.get).toHaveBeenCalledWith('/support/cases', {
      params: expect.objectContaining({ sort: 'priority' }),
    });
    const text = wrapper.text();
    expect(text).toContain('Cần xử lý ngay');
    expect(text).toContain('Quá hạn phản hồi');
    expect(text).toContain('Đang giữ đơn');
    expect(text).toContain('Hư hại hoặc mất tài sản');
  });

  it('opens already filtered from a link and offers the "Cần thay đổi thợ" type', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/console/support', component: SupportQueuePage }],
    });
    apiClientMock.get.mockResolvedValue(envelope([], { page: 1, limit: 10, total: 0, totalPages: 0 }));
    await router.push('/console/support?caseType=technician_replacement&status=open');
    const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] } });
    await router.isReady();
    await flushPromises();
    expect(apiClientMock.get).toHaveBeenCalledWith('/support/cases', {
      params: expect.objectContaining({ caseType: 'technician_replacement', status: 'open' }),
    });
    expect(wrapper.text()).toContain('Cần thay đổi thợ (ngoài kỹ năng)');
  });

  it('ignores an unknown filter in the link', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/console/support', component: SupportQueuePage }],
    });
    apiClientMock.get.mockResolvedValue(envelope([], { page: 1, limit: 10, total: 0, totalPages: 0 }));
    await router.push('/console/support?caseType=drop_table&status=x');
    mount({ template: '<router-view />' }, { global: { plugins: [router] } });
    await router.isReady();
    await flushPromises();
    const params = apiClientMock.get.mock.calls.at(-1)?.[1]?.params ?? {};
    expect(params.caseType).toBeUndefined();
    expect(params.status).toBeUndefined();
  });
});
