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

import { ordersApi, type WarrantyClaimView } from '../src/api/orders.api';
import WarrantyClaimCard from '../src/components/customer/WarrantyClaimCard.vue';
import WarrantyClaimModal from '../src/components/customer/WarrantyClaimModal.vue';
import { claimStatusMeta, isOpenClaim } from '../src/utils/warranty-claim';

const claim = (overrides: Partial<WarrantyClaimView> = {}): WarrantyClaimView => ({
  id: 'claim-1',
  serviceOrderId: 'order-1',
  warrantyCoverageId: 'cov-1',
  status: 'submitted',
  description: 'Vòi nước lại rò rỉ sau ba ngày',
  evidenceRefs: null,
  submittedAfterExpiry: false,
  customerResponse: null,
  resolutionNotes: null,
  submittedAt: '2026-09-29T08:00:00.000Z',
  resolvedAt: null,
  technician: { id: 'tech-1', fullName: 'Kỹ thuật viên A' },
  ...overrides,
});

const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

describe('warranty claim status meta', () => {
  it('gives every backend status one label and treats resolved/rejected as closed', () => {
    for (const status of [
      'submitted', 'accepted', 'inspected', 'in_progress', 'awaiting_customer', 'disputed', 'resolved', 'rejected',
    ]) {
      expect(claimStatusMeta(status).label).not.toBe('Trạng thái chưa xác định');
    }
    expect(isOpenClaim('awaiting_customer')).toBe(true);
    expect(isOpenClaim('resolved')).toBe(false);
    expect(isOpenClaim('rejected')).toBe(false);
  });

  it('never shows a raw enum for an unknown status and does not treat it as open', () => {
    expect(claimStatusMeta('made_up')).toEqual({ label: 'Trạng thái chưa xác định', tone: 'neutral' });
    expect(isOpenClaim('made_up')).toBe(false);
  });
});

describe('ordersApi warranty claim calls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submits the coverage, description and evidence, and answers with the created claim', async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim() } });
    const created = await ordersApi.createWarrantyClaim('order-1', {
      warrantyCoverageId: 'cov-1',
      description: 'Vòi nước lại rò rỉ sau ba ngày',
      evidenceRefs: ['https://cdn.test/a.jpg'],
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/service-orders/order-1/warranty-claims', {
      warrantyCoverageId: 'cov-1',
      description: 'Vòi nước lại rò rỉ sau ba ngày',
      evidenceRefs: ['https://cdn.test/a.jpg'],
    });
    expect(created.id).toBe('claim-1');
  });

  it('responds to a claim through the respond route', async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'disputed' }) } });
    await ordersApi.respondWarrantyClaim('order-1', 'claim-1', { decision: 'dispute', note: 'Lỗi vẫn ở linh kiện đã thay' });
    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/service-orders/order-1/warranty-claims/claim-1/respond',
      { decision: 'dispute', note: 'Lỗi vẫn ở linh kiện đã thay' },
    );
  });
});

describe('WarrantyClaimModal', () => {
  const coverages = [
    { id: 'cov-expired', itemDescription: 'Van khóa cũ', expiresAt: PAST, status: 'EXPIRED' as const },
    { id: 'cov-active', itemDescription: 'Vòi sen mới', expiresAt: FUTURE, status: 'ACTIVE' as const },
    { id: 'cov-busy', itemDescription: 'Ống dẫn', expiresAt: FUTURE, status: 'ACTIVE' as const },
  ];

  const mountModal = async () => {
    const wrapper = mount(WarrantyClaimModal, {
      props: {
        open: true,
        orderId: 'order-1',
        orderCode: 'SO-1',
        serviceName: 'Sửa đường nước',
        technicianName: 'Kỹ thuật viên A',
        coverages,
        busyCoverageIds: ['cov-busy'],
      },
      attachTo: document.body,
    });
    await flushPromises();
    return wrapper;
  };

  beforeEach(() => vi.clearAllMocks());

  it('preselects the first claimable active coverage and disables one that already has an open claim', async () => {
    const wrapper = await mountModal();
    const radios = wrapper.findAll('input[type="radio"]');
    expect((radios[1].element as HTMLInputElement).checked).toBe(true);
    expect(radios[2].attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('warns but still allows a claim on an expired coverage', async () => {
    const wrapper = await mountModal();
    await wrapper.findAll('input[type="radio"]')[0].setValue();
    expect(wrapper.text()).toContain('đã hết hạn bảo hành');
    wrapper.unmount();
  });

  it('blocks a short description without calling the API', async () => {
    const wrapper = await mountModal();
    await wrapper.get('#warranty-claim-description').setValue('lỗi');
    await wrapper.findAll('button').find((b) => b.text().includes('Gửi yêu cầu bảo hành'))!.trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('ít nhất 10 ký tự');
    wrapper.unmount();
  });

  it('submits the chosen coverage once and emits the created claim', async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ warrantyCoverageId: 'cov-active' }) } });
    const wrapper = await mountModal();
    await wrapper.get('#warranty-claim-description').setValue('Vòi sen lại chảy nước yếu sau vài ngày');
    await wrapper.findAll('button').find((b) => b.text().includes('Gửi yêu cầu bảo hành'))!.trigger('click');
    await flushPromises();

    expect(apiClientMock.post).toHaveBeenCalledTimes(1);
    expect(apiClientMock.post).toHaveBeenCalledWith('/service-orders/order-1/warranty-claims', {
      warrantyCoverageId: 'cov-active',
      description: 'Vòi sen lại chảy nước yếu sau vài ngày',
    });
    expect(wrapper.emitted('submitted')).toHaveLength(1);
    wrapper.unmount();
  });

  it('shows the Backend rejection and does not emit', async () => {
    apiClientMock.post.mockRejectedValueOnce({ response: { data: { message: 'Hạng mục này đã bị hủy bảo hành.' } } });
    const wrapper = await mountModal();
    await wrapper.get('#warranty-claim-description').setValue('Vòi sen lại chảy nước yếu sau vài ngày');
    await wrapper.findAll('button').find((b) => b.text().includes('Gửi yêu cầu bảo hành'))!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('đã bị hủy bảo hành');
    expect(wrapper.emitted('submitted')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('WarrantyClaimCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers the response buttons only while waiting for the customer', () => {
    const waiting = mount(WarrantyClaimCard, { props: { claim: claim({ status: 'awaiting_customer' }) } });
    expect(waiting.text()).toContain('Chờ khách hàng phản hồi');
    expect(waiting.text()).toContain('Đồng ý');

    const open = mount(WarrantyClaimCard, { props: { claim: claim({ status: 'accepted' }) } });
    expect(open.text()).not.toContain('Đồng ý');

    const agreed = mount(WarrantyClaimCard, {
      props: { claim: claim({ status: 'awaiting_customer', customerResponse: 'agreed' }) },
    });
    expect(agreed.text()).not.toContain('Không đồng ý');
    expect(agreed.text()).toContain('Bạn đã đồng ý');
  });

  it('sends agreement and emits the updated claim', async () => {
    apiClientMock.post.mockResolvedValueOnce({
      data: { data: claim({ status: 'awaiting_customer', customerResponse: 'agreed' }) },
    });
    const wrapper = mount(WarrantyClaimCard, { props: { claim: claim({ status: 'awaiting_customer' }) } });

    await wrapper.findAll('button').find((b) => b.text() === 'Đồng ý')!.trigger('click');
    await flushPromises();

    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/service-orders/order-1/warranty-claims/claim-1/respond',
      { decision: 'agree' },
    );
    expect(wrapper.emitted('updated')).toHaveLength(1);
  });

  it('requires a reason before disputing', async () => {
    const wrapper = mount(WarrantyClaimCard, { props: { claim: claim({ status: 'awaiting_customer' }) } });

    await wrapper.findAll('button').find((b) => b.text() === 'Không đồng ý')!.trigger('click');
    await wrapper.findAll('button').find((b) => b.text().includes('Gửi phản đối'))!.trigger('click');
    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('ít nhất 10 ký tự');

    apiClientMock.post.mockResolvedValueOnce({ data: { data: claim({ status: 'disputed' }) } });
    await wrapper.get('textarea').setValue('Lỗi vẫn xuất hiện ở linh kiện đã thay');
    await wrapper.findAll('button').find((b) => b.text().includes('Gửi phản đối'))!.trigger('click');
    await flushPromises();
    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/service-orders/order-1/warranty-claims/claim-1/respond',
      { decision: 'dispute', note: 'Lỗi vẫn xuất hiện ở linh kiện đã thay' },
    );
  });

  it('asks whether the defect is fixed once the technician reports the re-service done', () => {
    const wrapper = mount(WarrantyClaimCard, {
      props: { claim: claim({ status: 'awaiting_customer', awaitingPrompt: 'completion' }) },
    });
    expect(wrapper.text()).toContain('Lỗi đã được khắc phục chưa?');
    expect(wrapper.text()).toContain('Đã khắc phục');
    expect(wrapper.text()).toContain('Vẫn còn lỗi');
    expect(wrapper.text()).not.toContain('Không đồng ý');
  });

  it('flags a claim that was submitted after the coverage expired', () => {
    const wrapper = mount(WarrantyClaimCard, { props: { claim: claim({ submittedAfterExpiry: true }) } });
    expect(wrapper.text()).toContain('sau khi hạng mục hết hạn bảo hành');
  });
});
