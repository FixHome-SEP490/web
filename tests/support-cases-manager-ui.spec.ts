import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

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
});
