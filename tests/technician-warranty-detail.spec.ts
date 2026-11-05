import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', async (original) => ({
  ...(await original<typeof import('../src/api/client')>()),
  default: apiClientMock,
}));
vi.mock('../src/api/media.api', () => ({
  mediaApi: { upload: vi.fn() },
  ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg'],
  MAX_MEDIA_SIZE_BYTES: 10 * 1024 * 1024,
}));
const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('vue-router', async (original) => ({
  ...(await original<typeof import('vue-router')>()),
  useRouter: () => routerMock,
  useRoute: () => ({ params: { id: 'claim-1' } }),
}));
const chatMock = vi.hoisted(() => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn() }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => chatMock }));

import type { StaffWarrantyClaim } from '../src/api/warranty-claims.api';
import TechnicianWarrantyDetailPage from '../src/pages/technician/TechnicianWarrantyDetailPage.vue';
import { createTestQueryClient, installQueryClient } from './support/query-client';

const claim = (overrides: Partial<StaffWarrantyClaim> = {}): StaffWarrantyClaim => ({
  id: 'claim-1',
  serviceOrderId: 'order-1',
  warrantyCoverageId: 'cov-1',
  status: 'submitted',
  description: 'Vòi nước lại rò rỉ sau ba ngày',
  evidenceRefs: ['https://cdn.test/a.jpg'],
  submittedAfterExpiry: false,
  customerResponse: null,
  awaitingPrompt: null,
  resolutionNotes: null,
  submittedAt: '2026-09-29T08:00:00.000Z',
  resolvedAt: null,
  technician: { id: 'tech-1', fullName: 'Kỹ thuật viên A' },
  order: {
    id: 'order-1', code: 'SO-1', bookingId: 'booking-1', serviceName: 'Sửa đường nước',
    addressSummary: '12 Lê Lợi, Quận 1', customerName: 'Khách A', customerPhone: '0911222333',
  },
  coverage: { id: 'cov-1', itemDescription: 'Vòi sen', expiresAt: '2026-10-30T00:00:00.000Z' },
  visit: null,
  ...overrides,
});

const routerStub = { 'router-link': { props: ['to'], template: '<a><slot /></a>' } };
const mountPage = async (response: unknown) => {
  if (response instanceof Error || (response as { response?: unknown }).response) apiClientMock.get.mockRejectedValueOnce(response);
  else apiClientMock.get.mockResolvedValueOnce({ data: { data: response } });
  const wrapper = mount(TechnicianWarrantyDetailPage, { global: { stubs: routerStub } });
  await flushPromises();
  return wrapper;
};
const button = (wrapper: ReturnType<typeof mount>, label: string) => wrapper.findAll('button').find((b) => b.text() === label);

beforeEach(() => {
  vi.clearAllMocks();
  installQueryClient(createTestQueryClient());
});

describe('technician warranty claim page', () => {
  it('loads the claim by the id in the address and shows the same summary as the list plus every detail', async () => {
    const wrapper = await mountPage(claim({
      status: 'inspected',
      resolutionNotes: 'Đã ghi nhận kết luận.',
      visit: {
        id: 'v1', status: 'inspected', scheduledAt: null, checkedInAt: '2026-09-30T02:00:00.000Z', proposedResult: 'not_covered',
        notCoveredReasonCode: 'customer_misuse', findings: 'Khách tự tháo van', evidenceRefs: null, reServiceNotes: null, reServiceEvidenceRefs: null, completedAt: null,
      },
    }));

    expect(apiClientMock.get).toHaveBeenCalledWith('/warranty-claims/claim-1');
    const text = wrapper.get('[data-testid="warranty-claim-detail"]').text();
    for (const expected of ['#SO-1', 'Vòi sen', 'Khách A', '0911222333', '12 Lê Lợi, Quận 1', 'Nhắn tin', 'Gọi điện',
      'Sửa đường nước', 'Vòi nước lại rò rỉ sau ba ngày', 'Kết luận bạn đã đề xuất', 'Khách sử dụng sai cách', 'Khách tự tháo van', 'Đã ghi nhận kết luận.']) {
      expect(text).toContain(expected);
    }
    expect(wrapper.find('img[alt="Ảnh khách hàng gửi kèm"]').exists()).toBe(true);
    expect(text).toContain('Chờ quản lý duyệt kết luận');
  });

  it('finds the claim in my own list when the server has no single-claim route yet', async () => {
    apiClientMock.get
      .mockRejectedValueOnce({ response: { status: 404, data: { message: 'Cannot GET /api/v1/warranty-claims/claim-1' } } })
      .mockResolvedValueOnce({ data: { data: [claim({ id: 'other' }), claim()] } });
    const wrapper = mount(TechnicianWarrantyDetailPage, { global: { stubs: routerStub } });
    await flushPromises();

    expect(apiClientMock.get).toHaveBeenLastCalledWith('/warranty-claims/mine', expect.anything());
    expect(wrapper.find('[data-testid="warranty-claim-gone"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="warranty-claim-detail"]').text()).toContain('Khách A');
  });

  it('says so, instead of an error, when the claim is no longer mine', async () => {
    apiClientMock.get
      .mockRejectedValueOnce({ response: { status: 404, data: { message: 'Không tìm thấy yêu cầu bảo hành.' } } })
      .mockResolvedValueOnce({ data: { data: [] } });
    const wrapper = mount(TechnicianWarrantyDetailPage, { global: { stubs: routerStub } });
    await flushPromises();
    expect(wrapper.find('[data-testid="warranty-claim-gone"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('không còn thuộc về bạn');
    await button(wrapper, 'Về danh sách bảo hành')!.trigger('click');
    expect(routerMock.replace).toHaveBeenCalledWith({ name: 'tech-warranty' });
  });

  it('shows a retryable error for any other failure', async () => {
    const wrapper = await mountPage({ response: { status: 500, data: { message: 'Lỗi máy chủ.' } } });
    expect(wrapper.get('[role="alert"]').text()).toContain('Lỗi máy chủ.');
    apiClientMock.get.mockResolvedValueOnce({ data: { data: claim() } });
    await button(wrapper, 'Thử lại')!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="warranty-claim-detail"]').exists()).toBe(true);
  });

  it('accepts the claim from the page and stays on it with the new state', async () => {
    const wrapper = await mountPage(claim());
    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'accepted' }) } });

    await button(wrapper, 'Nhận yêu cầu')!.trigger('click');
    await wrapper.findAll('button').at(-1)!.trigger('click');
    await flushPromises();

    expect(apiClientMock.post).toHaveBeenCalledWith('/warranty-claims/claim-1/accept', {});
    expect(wrapper.text()).toContain('Bạn đã nhận');
    expect(button(wrapper, 'Đã đến nơi')).toBeTruthy();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('checks in from the page', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() } });
    const wrapper = await mountPage(claim({ status: 'accepted', visit: { id: 'v1', status: 'scheduled', scheduledAt: null, checkedInAt: null, proposedResult: null, notCoveredReasonCode: null, findings: null, evidenceRefs: null, reServiceNotes: null, reServiceEvidenceRefs: null, completedAt: null } }));
    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'accepted', visit: { id: 'v1', status: 'checked_in', scheduledAt: null, checkedInAt: '2026-09-30T02:00:00.000Z', proposedResult: null, notCoveredReasonCode: null, findings: null, evidenceRefs: null, reServiceNotes: null, reServiceEvidenceRefs: null, completedAt: null } }) } });

    await button(wrapper, 'Đã đến nơi')!.trigger('click');
    await flushPromises();

    expect(apiClientMock.post).toHaveBeenCalledWith('/warranty-claims/claim-1/check-in', {});
    expect(button(wrapper, 'Gửi kết luận kiểm tra')).toBeTruthy();
    expect(wrapper.text()).toContain('Đã xác nhận bạn có mặt');
  });

  it('goes back to the list once the claim is handed back to the manager', async () => {
    const wrapper = await mountPage(claim());
    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ technician: null }) } });

    await button(wrapper, 'Không nhận được')!.trigger('click');
    await wrapper.findAll('button').at(-1)!.trigger('click');
    await flushPromises();

    expect(apiClientMock.post).toHaveBeenCalledWith('/warranty-claims/claim-1/decline', expect.objectContaining({ reasonCode: expect.any(String) }));
    expect(routerMock.replace).toHaveBeenCalledWith({ name: 'tech-warranty' });
  });

  it('offers no next step for a closed claim', async () => {
    const wrapper = await mountPage(claim({ status: 'rejected' }));
    expect(button(wrapper, 'Nhận yêu cầu')).toBeUndefined();
    expect(wrapper.text()).not.toContain('Đang chờ');
  });
});
