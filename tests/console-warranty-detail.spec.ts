import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', async (original) => ({
  ...(await original<typeof import('../src/api/client')>()),
  default: apiClientMock,
}));
const ordersMock = vi.hoisted(() => ({ getEvidence: vi.fn() }));
vi.mock('../src/api/orders.api', async (original) => ({ ...(await original<typeof import('../src/api/orders.api')>()), ordersApi: ordersMock }));
vi.mock('../src/api/parts-catalog.api', () => ({ partsCatalogApi: { getCatalog: vi.fn().mockResolvedValue({ data: [] }) } }));
vi.mock('vue-router', async (original) => ({
  ...(await original<typeof import('vue-router')>()),
  useRoute: () => ({ params: { id: 'claim-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}));

import type { WarrantyClaimDetail } from '../src/api/warranty-claims.api';
import ConsoleWarrantyDetailPage from '../src/pages/console/ConsoleWarrantyDetailPage.vue';
import { useAuthStore } from '../src/stores/auth.store';

const claim = (overrides: Record<string, unknown> = {}, detail: Record<string, unknown> = {}): WarrantyClaimDetail => ({
  id: 'claim-1', serviceOrderId: 'order-1', warrantyCoverageId: 'cov-1', status: 'inspected',
  description: 'Máy giặt lại không vắt được sau ba ngày', evidenceRefs: ['https://cdn.test/c.jpg'],
  submittedAfterExpiry: false, customerResponse: null, awaitingPrompt: null, resolutionNotes: null,
  submittedAt: '2026-10-31T08:00:00.000Z', resolvedAt: null,
  technician: { id: 'tech-2', fullName: 'Thợ Hai' },
  order: { id: 'order-1', code: 'SO-1', bookingId: 'b-1', serviceName: 'Sửa máy giặt', addressSummary: '12 Lê Lợi, Quận 1', customerName: 'Khách A', customerPhone: '0911222333' },
  coverage: { id: 'cov-1', itemDescription: 'Board X', expiresAt: '2027-01-20T00:00:00.000Z' },
  visit: null,
  declineReview: null, declineReasonCode: null, outcomeCode: null, refundAmount: null, noShowFlaggedAt: null,
  detail: {
    decision: { finalResult: null, finalReasonCode: null, smOverrodeProposal: false, reviewedBy: null, reviewedAt: null, customerRespondedAt: null, awaitingSince: null, escalatedSupportCaseId: null },
    declined: null,
    originalJob: {
      completedAt: '2026-10-20T08:00:00.000Z', paymentStatus: 'paid', laborTotal: 300000, partsTotal: 700000, grandTotal: 1000000, laborWarrantyDays: 30,
      technicians: [{ id: 'tech-1', fullName: 'Thợ Một', assignedAt: '2026-10-19T08:00:00.000Z', isActive: true }],
      lines: [
        { id: 'line-1', type: 'labor', description: 'Công thay bo mạch', quantity: 1, unitPrice: 300000, lineTotal: 300000, warrantyDays: 30, partSource: null, partWarrantyOption: null, covered: false },
        { id: 'line-2', type: 'parts_equipment', description: 'Board X', quantity: 1, unitPrice: 700000, lineTotal: 700000, warrantyDays: 90, partSource: 'fixhome', partWarrantyOption: 'included', covered: true },
      ],
    },
    coverage: { id: 'cov-1', startsAt: '2026-10-20T08:00:00.000Z', expiresAt: '2027-01-20T00:00:00.000Z', warrantyDays: 90, status: 'active' },
    visits: [{
      id: 'v1', status: 'inspected', scheduledAt: null, checkedInAt: '2026-11-01T02:00:00.000Z', proposedResult: 'covered_part',
      notCoveredReasonCode: null, findings: 'Bo mạch cháy ở chân cắm', evidenceRefs: ['https://cdn.test/v.jpg'],
      reServiceNotes: null, reServiceEvidenceRefs: null, completedAt: null, technician: { id: 'tech-2', fullName: 'Thợ Hai' },
    }],
    partRequest: null,
    otherClaims: [],
    ...detail,
  },
  ...overrides,
}) as WarrantyClaimDetail;

const routerStub = { 'router-link': { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : \'\'"><slot /></a>' } };
const stubs = { ...routerStub, FhMoney: { props: ['amount'], template: '<span data-money>{{ amount }}</span>' } };

const mountPage = async (data: WarrantyClaimDetail | Error, role = 'service_manager') => {
  setActivePinia(createPinia());
  useAuthStore().setAuth('token', { id: 'u1', fullName: 'Quản lý', email: 'sm@test.vn', role } as never);
  if (data instanceof Error) apiClientMock.get.mockRejectedValueOnce(data);
  else apiClientMock.get.mockResolvedValueOnce({ data: { data } });
  const wrapper = mount(ConsoleWarrantyDetailPage, { global: { stubs } });
  await flushPromises();
  return wrapper;
};
const button = (wrapper: ReturnType<typeof mount>, label: string) => wrapper.findAll('button').find((b) => b.text() === label);

beforeEach(() => {
  vi.clearAllMocks();
  ordersMock.getEvidence.mockResolvedValue([{ id: 'e1', type: 'before', mediaUrl: 'https://cdn.test/before.jpg' }, { id: 'e2', type: 'additional', mediaUrl: 'https://cdn.test/x.jpg' }]);
});

describe('service manager warranty claim page', () => {
  it('loads the full claim and shows what is needed to judge it', async () => {
    const wrapper = await mountPage(claim());

    expect(wrapper.find('[data-testid="warranty-detail-missing"]').exists()).toBe(false);
    expect(apiClientMock.get).toHaveBeenCalledWith('/service-manager/warranty-claims/claim-1');
    const text = wrapper.text();
    for (const expected of ['Board X', '#SO-1', 'Máy giặt lại không vắt được', '0911222333', '12 Lê Lợi, Quận 1', 'Thợ Hai',
      'Thợ Một', 'Đã thanh toán', '90 ngày', 'Công thay bo mạch', 'Bo mạch cháy ở chân cắm', 'Đề xuất: Được bảo hành: lỗi do linh kiện', 'Chưa duyệt']) {
      expect(text).toContain(expected);
    }
  });

  it('marks the invoice line the customer is claiming on and shows the money', async () => {
    const wrapper = await mountPage(claim());
    expect(wrapper.get('[data-testid="warranty-line-line-2"]').text()).toContain('Đang yêu cầu');
    expect(wrapper.get('[data-testid="warranty-line-line-1"]').text()).not.toContain('Đang yêu cầu');
    expect(wrapper.get('[data-testid="warranty-line-line-2"]').text()).toContain('FixHome');
    expect(wrapper.findAll('[data-money]').map((m) => m.text())).toEqual(expect.arrayContaining(['700000', '1000000']));
  });

  it('shows only the before and after photos of the original job', async () => {
    const wrapper = await mountPage(claim());
    const photos = wrapper.findAll('img[alt$="khi sửa"]');
    expect(photos).toHaveLength(1);
    expect(photos[0].attributes('src')).toBe('https://cdn.test/before.jpg');
  });

  it('shows who decided, that the manager changed the technician proposal, and the customer reply', async () => {
    const wrapper = await mountPage(claim({ status: 'awaiting_customer', customerResponse: 'agreed' }, {
      decision: { finalResult: 'covered_workmanship', finalReasonCode: null, smOverrodeProposal: true, reviewedBy: { id: 'sm-1', fullName: 'Quản lý B' }, reviewedAt: '2026-11-02T01:00:00.000Z', customerRespondedAt: '2026-11-03T01:00:00.000Z', awaitingSince: null, escalatedSupportCaseId: null },
    }));
    const text = wrapper.text();
    expect(text).toContain('Quản lý B');
    expect(text).toContain('Được bảo hành: lỗi do công sửa chữa');
    expect(text).toContain('đã đổi kết luận so với đề xuất');
    expect(text).toContain('Đồng ý');
  });

  it('shows who declined and why, and that a manager still has to judge it', async () => {
    const wrapper = await mountPage(claim({ status: 'submitted', technician: null, declineReview: 'pending' }, {
      declined: { by: { id: 'tech-9', fullName: 'Thợ Chín' }, at: '2026-11-01T01:00:00.000Z', reasonCode: 'busy', note: 'Tuần này kẹt lịch' },
    }));
    const text = wrapper.text();
    expect(text).toContain('Thợ Chín');
    expect(text).toContain('Tuần này kẹt lịch');
    expect(text).toContain('Chờ quản lý xét');
    expect(button(wrapper, 'Xét từ chối')).toBeTruthy();
  });

  it('shows the warranty part with the faulty-part inspection and who pays', async () => {
    const wrapper = await mountPage(claim({}, {
      partRequest: { id: 'pr-1', status: 'requested', chargeTechnician: true, faultyInspectionResult: 'installation', faultyInspectionNote: 'Đấu sai cực dây nguồn', faultyInspectionEvidence: ['https://cdn.test/f.jpg'], faultyInspectedAt: '2026-11-02T01:00:00.000Z', items: [{ id: 'i1', name: 'Board X', quantity: 1, unitPrice: 700000, usageStatus: 'pending' }] },
    }));
    const text = wrapper.text();
    expect(text).toContain('Do lắp đặt, thợ trả tiền');
    expect(text).toContain('Kỹ thuật viên');
    expect(text).toContain('Đấu sai cực dây nguồn');
  });

  it('links to the other claims of the same order', async () => {
    const wrapper = await mountPage(claim({}, { otherClaims: [{ id: 'claim-0', status: 'resolved', submittedAt: '2026-10-25T01:00:00.000Z', itemDescription: 'Công thay bo mạch' }] }));
    expect(wrapper.find('a[href="/console/warranty/claim-0"]').exists()).toBe(true);
  });

  it('offers the next decision for the state of the claim, to a service manager only', async () => {
    const approve = await mountPage(claim({ status: 'inspected' }));
    expect(button(approve, 'Duyệt kết luận')).toBeTruthy();

    const close = await mountPage(claim({ status: 'in_progress' }));
    expect(button(close, 'Đóng yêu cầu')).toBeTruthy();

    const assign = await mountPage(claim({ status: 'submitted', technician: null }));
    expect(button(assign, 'Phân công kỹ thuật viên')).toBeTruthy();

    const done = await mountPage(claim({ status: 'rejected' }));
    expect(done.findAll('button').filter((b) => ['Duyệt kết luận', 'Đóng yêu cầu', 'Phân công kỹ thuật viên'].includes(b.text()))).toHaveLength(0);

    const admin = await mountPage(claim({ status: 'inspected' }), 'admin');
    expect(button(admin, 'Duyệt kết luận')).toBeUndefined();
    expect(admin.text()).toContain('Chỉ xem');
  });

  it('opens the decision form from the header and reloads the claim after it', async () => {
    const proposed = { id: 'v1', status: 'inspected', scheduledAt: null, checkedInAt: null, proposedResult: 'covered_part', notCoveredReasonCode: null, findings: 'Nứt', evidenceRefs: null, reServiceNotes: null, reServiceEvidenceRefs: null, completedAt: null };
    const wrapper = await mountPage(claim({ status: 'inspected', visit: proposed }));
    await button(wrapper, 'Duyệt kết luận')!.trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'in_progress' }) } });
    apiClientMock.get.mockResolvedValueOnce({ data: { data: claim({ status: 'in_progress' }) } });
    await wrapper.findAll('[role="dialog"] button').at(-1)!.trigger('click');
    await flushPromises();

    expect(apiClientMock.post).toHaveBeenCalledWith('/service-manager/warranty-claims/claim-1/approve', {});
    expect(apiClientMock.get).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Đã ghi nhận quyết định');
  });

  it('still shows the claim when the server sends no detail block yet, instead of a blank page', async () => {
    const withoutDetail: Record<string, unknown> = { ...claim() };
    delete withoutDetail.detail;
    const wrapper = await mountPage(withoutDetail as unknown as WarrantyClaimDetail);
    expect(wrapper.text()).toContain('Máy giặt lại không vắt được');
    expect(wrapper.text()).toContain('Board X');
    // Blocks that would only be empty because the data did not arrive are not shown as if they were data.
    expect(wrapper.find('[data-testid="warranty-detail-missing"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Chưa có kỹ thuật viên nào từ chối hoặc vắng mặt.');
    expect(wrapper.text()).not.toContain('Chưa có kỹ thuật viên nhận và hẹn kiểm tra.');
    expect(wrapper.text()).not.toContain('Không tìm thấy hạng mục bảo hành.');
  });

  it('shows a retryable error when the claim cannot be loaded', async () => {
    const wrapper = await mountPage(Object.assign(new Error('x'), { response: { status: 500, data: { message: 'Lỗi máy chủ.' } } }));
    expect(wrapper.text()).toContain('Lỗi máy chủ.');
  });
});
