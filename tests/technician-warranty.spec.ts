import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: apiClientMock }));

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('vue-router', async (original) => ({ ...(await original<typeof import('vue-router')>()), useRouter: () => routerMock }));

const chatMock = vi.hoisted(() => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn() }));
const ordersMock = vi.hoisted(() => ({ getOrder: vi.fn() }));
vi.mock('../src/api/orders.api', async (original) => ({ ...(await original<typeof import('../src/api/orders.api')>()), ordersApi: ordersMock }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => chatMock }));

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
import { createTestQueryClient, installQueryClient } from './support/query-client';

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
    bookingId: 'booking-1',
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

  it('lists my claims a page at a time, optionally by status, and posts each command to its own route', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: { data: [claim()], meta: { page: 2, pageSize: 20, total: 21 } } });
    const listed = await warrantyClaimsApi.listMine({ page: 2, pageSize: 20, status: 'accepted' });
    expect(apiClientMock.get).toHaveBeenCalledWith('/warranty-claims/mine', { params: { page: 2, pageSize: 20, status: 'accepted' } });
    expect(listed).toMatchObject({ total: 21, page: 2, pageSize: 20 });
    expect(listed.items).toHaveLength(1);

    // Without a status the filter is left out; an answer without meta is read as all there is.
    apiClientMock.get.mockResolvedValueOnce({ data: { data: [claim()] } });
    const bare = await warrantyClaimsApi.listMine();
    expect(apiClientMock.get).toHaveBeenLastCalledWith('/warranty-claims/mine', { params: { page: 1, pageSize: 20 } });
    expect(bare.total).toBe(1);

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

  it('sends a workmanship proposal without a reason code or a photo', async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'inspected' }) } });
    const wrapper = mountModal('propose');
    await wrapper.findAll('input[type="radio"]')[0].setValue();
    await wrapper.get('#warranty-findings').setValue('Mối nối bị lỏng do lắp chưa chặt');
    await submitButton(wrapper).trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith('/warranty-claims/claim-1/propose', {
      result: 'covered_workmanship',
      findings: 'Mối nối bị lỏng do lắp chưa chặt',
    });
    wrapper.unmount();
  });

  it('demands a photo of the faulty part when FixHome would pay for it', async () => {
    const wrapper = mountModal('propose');
    expect((wrapper.findAll('input[type="radio"]')[1].element as HTMLInputElement).checked).toBe(true);
    await wrapper.get('#warranty-findings').setValue('Linh kiện bị nứt ở mối ghép');
    expect(wrapper.text()).toContain('bắt buộc');
    await submitButton(wrapper).trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('ảnh linh kiện hỏng');
    wrapper.unmount();
  });

  it('tells the technician which decline reasons are checked and which wait for a manager', async () => {
    const wrapper = mountModal('decline');
    const options = wrapper.findAll('#warranty-decline-reason option').map((o) => o.text());
    expect(options).toContain('Đang nghỉ (hệ thống kiểm tra)');
    expect(options).toContain('Đang bận (quản lý xác nhận)');
    expect(wrapper.text()).toContain('trừ điểm uy tín');
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
    const count = (key: string) => wrapper.get(`[data-testid="warranty-tab-${key}"]`).text();
    expect(count('all')).toContain('6');
    expect(count('todo')).toContain('Cần xử lý');
    expect(count('todo')).toContain('4');
    expect(count('waiting')).toContain('1');
    expect(count('closed')).toContain('1');
    for (const label of ['Nhận yêu cầu', 'Không nhận được', 'Đã đến nơi', 'Gửi kết luận kiểm tra', 'Báo đã bảo hành xong']) {
      expect(text).toContain(label);
    }
    // The list stays short: the long parts only show in the detail panel.
    expect(wrapper.find('button[aria-label^="Xem chi tiết"]').exists()).toBe(true);
    expect(text).not.toContain('Kết luận bạn đã đề xuất');
    expect(text).not.toContain('Đã giải thích cho khách.');
    expect(wrapper.find('[data-testid="warranty-claim-detail"]').exists()).toBe(false);
  });

  it('filters the list by group with the pills, like the jobs page', async () => {
    const wrapper = await mountPage([
      claim({ id: 'a', status: 'submitted' }),
      claim({ id: 'e', status: 'inspected', visit: visit({ status: 'inspected', proposedResult: 'covered_part', findings: 'Nứt mối ghép' }) }),
      claim({ id: 'f', status: 'rejected' }),
    ]);
    const shown = () => wrapper.findAll('li[data-testid^="warranty-claim-"]').map((li) => li.attributes('data-testid'));
    expect(shown()).toEqual(['warranty-claim-a', 'warranty-claim-e', 'warranty-claim-f']);

    await wrapper.get('[data-testid="warranty-tab-waiting"]').trigger('click');
    expect(shown()).toEqual(['warranty-claim-e']);
    expect(wrapper.get('[data-testid="warranty-tab-waiting"]').attributes('aria-selected')).toBe('true');

    await wrapper.get('[data-testid="warranty-tab-closed"]').trigger('click');
    expect(shown()).toEqual(['warranty-claim-f']);
  });

  it('opens the claim page when the row or the arrow is clicked, not the buttons on it', async () => {
    routerMock.push.mockClear();
    const wrapper = await mountPage([claim({ id: 'a', status: 'submitted' })]);

    await wrapper.get('[data-testid="warranty-claim-a"]').trigger('click');
    expect(routerMock.push).toHaveBeenLastCalledWith({ name: 'tech-warranty-detail', params: { id: 'a' } });

    routerMock.push.mockClear();
    await wrapper.get('button[aria-label^="Xem chi tiết"]').trigger('click');
    expect(routerMock.push).toHaveBeenCalledTimes(1);

    routerMock.push.mockClear();
    await wrapper.findAll('button').find((b) => b.text() === 'Nhận yêu cầu')!.trigger('click');
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('names each state from the technician side, not the customer side', async () => {
    const wrapper = await mountPage([
      claim({ id: 'a', status: 'submitted' }),
      claim({ id: 'b', status: 'accepted', visit: visit() }),
      claim({ id: 'e', status: 'inspected', visit: visit({ status: 'inspected', proposedResult: 'covered_part', findings: 'Nứt mối ghép' }) }),
      claim({ id: 'w', status: 'awaiting_customer' }),
      claim({ id: 'g', status: 'awaiting_customer', customerResponse: 'agreed' }),
    ]);
    const label = (id: string) => wrapper.get(`[data-testid="warranty-claim-${id}"]`).text();
    expect(label('a')).toContain('Chờ bạn nhận');
    expect(label('a')).not.toContain('Đã gửi yêu cầu');
    expect(label('b')).toContain('Bạn đã nhận');
    expect(label('e')).toContain('Chờ quản lý duyệt');
    expect(label('w')).toContain('Chờ khách phản hồi');
    expect(label('g')).toContain('Đã đồng ý, chờ quản lý dịch vụ đóng');
  });

  it('keeps the row short like the jobs page: customer with phone, address, contact buttons; no photos or conclusion', async () => {
    const wrapper = await mountPage([
      claim({ id: 'e', status: 'inspected', evidenceRefs: ['https://cdn.test/a.jpg'], visit: visit({ status: 'inspected', proposedResult: 'not_covered', notCoveredReasonCode: 'customer_misuse', findings: 'Khách tự tháo van' }) }),
    ]);
    const row = wrapper.get('[data-testid="warranty-claim-e"]');
    expect(row.text()).toContain('Khách A');
    expect(row.text()).toContain('0911222333');
    expect(row.text()).toContain('Lê Lợi, Quận 1');
    expect(row.text()).not.toContain('Chỉ đường');
    expect(row.text()).toContain('Nhắn tin');
    expect(row.get('a[href="tel:0911222333"]').text()).toContain('Gọi điện');
    expect(row.find('img').exists()).toBe(false);
    expect(row.text()).not.toContain('Kết luận bạn đã đề xuất');
    expect(row.text()).not.toContain('Khách tự tháo van');
  });

  it('lets the technician call or message the customer only after taking the claim', async () => {
    const wrapper = await mountPage([
      claim({ id: 'new', status: 'submitted' }),
      claim({ id: 'mine', status: 'accepted', visit: visit() }),
      claim({ id: 'closed', status: 'rejected' }),
    ]);
    const reach = (id: string) => {
      const row = wrapper.get(`[data-testid="warranty-claim-${id}"]`);
      return { call: row.find('a[href^="tel:"]').exists(), message: row.findAll('button').some((b) => b.text() === 'Nhắn tin') };
    };
    expect(reach('new')).toEqual({ call: false, message: false });
    expect(reach('mine')).toEqual({ call: true, message: true });
    expect(reach('closed')).toEqual({ call: true, message: true });
  });

  it('reads the booking from the order when the server does not send it with the claim', async () => {
    ordersMock.getOrder.mockResolvedValueOnce({ id: 'order-1', bookingId: 'booking-from-order' });
    chatMock.openConversationForBooking.mockClear();
    const wrapper = await mountPage([claim({ id: 'a', status: 'accepted', visit: visit(), order: { ...claim().order, bookingId: undefined } })]);

    await wrapper.findAll('button').find((b) => b.text() === 'Nhắn tin')!.trigger('click');
    await flushPromises();

    expect(ordersMock.getOrder).toHaveBeenCalledWith('order-1');
    expect(chatMock.openConversationForBooking).toHaveBeenCalledWith('booking-from-order');
  });

  it('opens the conversation of the booking from the message button', async () => {
    const wrapper = await mountPage([claim({ id: 'a', status: 'accepted', visit: visit(), order: { ...claim().order, bookingId: 'booking-9' } })]);
    await wrapper.findAll('button').find((b) => b.text() === 'Nhắn tin')!.trigger('click');
    await flushPromises();
    expect(chatMock.openConversationForBooking).toHaveBeenCalledWith('booking-9');
    expect(chatMock.toggleWidget).toHaveBeenCalledWith(true);
  });

  it('shows an empty state and a load error', async () => {
    const empty = await mountPage([]);
    expect(empty.text()).toContain('Chưa có yêu cầu bảo hành');

    apiClientMock.get.mockRejectedValueOnce({ response: { data: { message: 'Không có quyền.' } } });
    // A new session: the cached empty list must not answer for it.
    installQueryClient(createTestQueryClient());
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
    expect(wrapper.get('[data-testid="warranty-tab-todo"]').text()).toContain('1');
    expect(wrapper.text()).toContain('Đã trả yêu cầu về cho quản lý dịch vụ');
  });
  it('asks the server for 20 claims a page and moves to the next page', async () => {
    const first = Array.from({ length: 20 }, (_, i) => claim({ id: `p1-${i}`, status: 'submitted' }));
    apiClientMock.get.mockResolvedValueOnce({ data: { data: first, meta: { page: 1, pageSize: 20, total: 23 } } });
    const wrapper = mount(TechnicianWarrantyPage, { global: { stubs: routerStub } });
    await flushPromises();
    expect(apiClientMock.get).toHaveBeenCalledWith('/warranty-claims/mine', { params: { page: 1, pageSize: 20 } });
    expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('1–20 / 23');

    apiClientMock.get.mockResolvedValueOnce({
      data: { data: [claim({ id: 'p2-0', status: 'resolved' })], meta: { page: 2, pageSize: 20, total: 23 } },
    });
    await wrapper.get('[data-testid="pagination-next"]').trigger('click');
    await flushPromises();
    expect(apiClientMock.get).toHaveBeenLastCalledWith('/warranty-claims/mine', { params: { page: 2, pageSize: 20 } });
    expect(wrapper.find('[data-testid="warranty-claim-p1-0"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="warranty-tab-closed"]').text()).toContain('1');
    expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('21–23 / 23');
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
