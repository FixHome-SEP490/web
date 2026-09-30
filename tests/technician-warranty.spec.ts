import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: apiClientMock }));

const mediaMock = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('../src/api/media.api', () => ({
  mediaApi: mediaMock,
  ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_MEDIA_SIZE_BYTES: 10 * 1024 * 1024,
}));

import { warrantyClaimsApi, type StaffWarrantyClaim } from '../src/api/warranty-claims.api';
import OrderComplaintPanel from '../src/components/customer/OrderComplaintPanel.vue';
import TechnicianWarrantyActionModal from '../src/components/technician/TechnicianWarrantyActionModal.vue';
import TechnicianWarrantyPage from '../src/pages/technician/TechnicianWarrantyPage.vue';
import { allowedComplaintTypes, complaintTypeLabel } from '../src/utils/order-complaint';

const claim = (overrides: Partial<StaffWarrantyClaim> = {}): StaffWarrantyClaim => ({
  id: 'claim-1',
  serviceOrderId: 'order-1',
  warrantyCoverageId: 'cov-1',
  status: 'submitted',
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
    addressSummary: '12 Lê Lợi, Quận 1',
    customerName: 'Khách A',
    customerPhone: '0911222333',
  },
  coverage: { id: 'cov-1', itemDescription: 'Vòi sen', expiresAt: '2026-10-30T00:00:00.000Z' },
  visit: null,
  ...overrides,
});

const visit = (overrides = {}) => ({
  id: 'visit-1',
  status: 'scheduled',
  scheduledAt: null,
  checkedInAt: null,
  proposedResult: null,
  notCoveredReasonCode: null,
  findings: null,
  evidenceRefs: null,
  reServiceNotes: null,
  reServiceEvidenceRefs: null,
  completedAt: null,
  ...overrides,
});

const routerStub = { 'router-link': { template: '<a><slot /></a>' } };

describe('warrantyClaimsApi (technician)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists my claims, optionally by status, and posts each command to its own route', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: { data: [claim()] } });
    await warrantyClaimsApi.listMine('accepted');
    expect(apiClientMock.get).toHaveBeenCalledWith('/warranty-claims/mine', { params: { status: 'accepted' } });

    apiClientMock.post.mockResolvedValue({ data: { data: claim() } });
    await warrantyClaimsApi.accept('claim-1', { scheduledAt: '2026-10-02T02:00:00.000Z' });
    await warrantyClaimsApi.decline('claim-1', { reasonCode: 'busy' });
    await warrantyClaimsApi.checkIn('claim-1', { lat: 10.7, lng: 106.6 });
    await warrantyClaimsApi.propose('claim-1', { result: 'covered_part', findings: 'Linh kiện bị nứt' });
    await warrantyClaimsApi.complete('claim-1', { notes: 'Đã thay mới linh kiện' });
    expect(apiClientMock.post.mock.calls.map((call) => call[0])).toEqual([
      '/warranty-claims/claim-1/accept',
      '/warranty-claims/claim-1/decline',
      '/warranty-claims/claim-1/check-in',
      '/warranty-claims/claim-1/propose',
      '/warranty-claims/claim-1/complete',
    ]);
  });
});

describe('TechnicianWarrantyActionModal', () => {
  beforeEach(() => vi.clearAllMocks());

  const mountModal = (mode: 'accept' | 'decline' | 'propose' | 'complete') =>
    mount(TechnicianWarrantyActionModal, { props: { claim: claim(), mode }, attachTo: document.body });
  const submitButton = (wrapper: ReturnType<typeof mountModal>) => wrapper.findAll('button').at(-1)!;

  it('accepts without a time or with an ISO time', async () => {
    apiClientMock.post.mockResolvedValue({ data: { data: claim({ status: 'accepted' }) } });
    const wrapper = mountModal('accept');
    await submitButton(wrapper).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/warranty-claims/claim-1/accept', {});
    expect(wrapper.emitted('done')).toHaveLength(1);
    wrapper.unmount();
  });

  it('requires a written reason when declining with "other"', async () => {
    const wrapper = mountModal('decline');
    await wrapper.get('#warranty-decline-reason').setValue('other');
    await submitButton(wrapper).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('ghi rõ lý do');

    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ technician: null }) } });
    await wrapper.get('#warranty-decline-note').setValue('Tôi đang công tác tỉnh khác tuần này');
    await submitButton(wrapper).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/warranty-claims/claim-1/decline', {
      reasonCode: 'other',
      note: 'Tôi đang công tác tỉnh khác tuần này',
    });
    wrapper.unmount();
  });

  it('demands evidence and a reason code for a not-covered proposal', async () => {
    const wrapper = mountModal('propose');
    await wrapper.findAll('input[type="radio"]')[2].setValue();
    await wrapper.get('#warranty-findings').setValue('Khách tự tháo lắp van sau khi sửa');
    await submitButton(wrapper).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('ít nhất một ảnh');
    expect(wrapper.find('#warranty-not-covered').exists()).toBe(true);
    wrapper.unmount();
  });

  it('sends a covered proposal without a reason code', async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'inspected' }) } });
    const wrapper = mountModal('propose');
    await wrapper.get('#warranty-findings').setValue('Linh kiện bị nứt ở mối ghép');
    await submitButton(wrapper).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/warranty-claims/claim-1/propose', {
      result: 'covered_part',
      findings: 'Linh kiện bị nứt ở mối ghép',
    });
    wrapper.unmount();
  });

  it('requires a description of the work when completing', async () => {
    const wrapper = mountModal('complete');
    await submitButton(wrapper).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('mô tả việc đã làm');
    wrapper.unmount();
  });

  it('shows the Backend rejection and stays open', async () => {
    apiClientMock.post.mockRejectedValueOnce({ response: { data: { message: 'Yêu cầu bảo hành đã được xử lý.' } } });
    const wrapper = mountModal('accept');
    await submitButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('đã được xử lý');
    expect(wrapper.emitted('done')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('TechnicianWarrantyPage', () => {
  beforeEach(() => vi.clearAllMocks());

  const mountPage = async (claims: StaffWarrantyClaim[]) => {
    apiClientMock.get.mockResolvedValueOnce({ data: { data: claims } });
    const wrapper = mount(TechnicianWarrantyPage, { global: { stubs: routerStub } });
    await flushPromises();
    return wrapper;
  };

  it('groups claims and offers the next step for each status', async () => {
    const wrapper = await mountPage([
      claim({ id: 'a', status: 'submitted' }),
      claim({ id: 'b', status: 'accepted', visit: visit() }),
      claim({ id: 'c', status: 'accepted', visit: visit({ status: 'checked_in' }) }),
      claim({ id: 'd', status: 'in_progress' }),
      claim({ id: 'e', status: 'inspected', visit: visit({ status: 'inspected', proposedResult: 'not_covered', notCoveredReasonCode: 'customer_misuse', findings: 'Khách tự tháo van' }) }),
      claim({ id: 'f', status: 'rejected', resolutionNotes: 'Đã giải thích cho khách.' }),
    ]);

    const text = wrapper.text();
    expect(text).toContain('Cần xử lý (4)');
    expect(text).toContain('Đang chờ phản hồi (1)');
    expect(text).toContain('Đã đóng (1)');
    for (const label of ['Nhận yêu cầu', 'Không nhận được', 'Đã đến nơi', 'Gửi kết luận kiểm tra', 'Báo đã bảo hành xong']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('Kết luận bạn đã đề xuất');
    expect(text).toContain('Khách sử dụng sai cách');
    expect(text).toContain('Đã giải thích cho khách.');
    expect(wrapper.find('a[href="tel:0911222333"]').exists()).toBe(true);
  });

  it('shows an empty state and a load error', async () => {
    const empty = await mountPage([]);
    expect(empty.text()).toContain('Chưa có yêu cầu bảo hành');

    apiClientMock.get.mockRejectedValueOnce({ response: { data: { message: 'Không có quyền.' } } });
    const failed = mount(TechnicianWarrantyPage, { global: { stubs: routerStub } });
    await flushPromises();
    expect(failed.text()).toContain('Không có quyền.');
  });

  it('checks in and removes a claim the technician handed back', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() },
    });
    const wrapper = await mountPage([
      claim({ id: 'b', status: 'accepted', visit: visit() }),
      claim({ id: 'a', status: 'submitted' }),
    ]);

    apiClientMock.post.mockResolvedValueOnce({
      data: { data: claim({ id: 'b', status: 'accepted', visit: visit({ status: 'checked_in', checkedInAt: '2026-09-30T02:00:00.000Z' }) }) },
    });
    await wrapper.findAll('button').find((b) => b.text() === 'Đã đến nơi')!.trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/warranty-claims/b/check-in', {});
    expect(wrapper.text()).toContain('Gửi kết luận kiểm tra');

    await wrapper.findAll('button').find((b) => b.text() === 'Không nhận được')!.trigger('click');
    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ id: 'a', technician: null }) } });
    await wrapper.findAll('button').find((b) => b.text() === 'Gửi lý do')!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Cần xử lý (1)');
    expect(wrapper.text()).toContain('Đã trả yêu cầu về cho quản lý dịch vụ');
  });
});

describe('technician view of complaints', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers technician case types and technician wording', () => {
    expect(allowedComplaintTypes('COMPLETED', null, new Date(), 'technician')).toEqual(['cash_mismatch', 'conduct', 'other']);
    expect(allowedComplaintTypes('EN_ROUTE', null, new Date(), 'technician')).not.toContain('quality');
    expect(complaintTypeLabel('conduct', 'technician')).toBe('Thái độ hoặc hành vi của khách hàng');
    expect(complaintTypeLabel('conduct', 'customer')).toBe('Thái độ hoặc hành vi của kỹ thuật viên');
  });

  it('renders the technician wording in the panel', async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: { success: true, statusCode: 200, message: 'OK', data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } },
    });
    const wrapper = mount(OrderComplaintPanel, {
      props: { orderId: 'order-1', orderStatus: 'UNDER_REPAIR', role: 'technician' },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Báo cáo vấn đề về đơn này');
    expect(wrapper.text()).toContain('Bạn chưa báo cáo vấn đề nào');
    expect(wrapper.text()).not.toContain('Khiếu nại');
  });
});
