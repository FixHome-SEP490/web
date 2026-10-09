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

import { supportCasesApi } from '../src/api/support-cases.api';
import OrderComplaintPanel from '../src/components/customer/OrderComplaintPanel.vue';
import { allowedComplaintTypes, isComplaintWindowOpen } from '../src/utils/order-complaint';

const mineRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'case-1',
  caseType: 'quality',
  status: 'open',
  bookingId: 'booking-1',
  serviceOrderId: 'order-1',
  reason: 'Vòi nước vẫn rò rỉ sau khi sửa',
  description: null,
  resolutionReason: null,
  evidenceRefs: null,
  isUrgent: false,
  respondBy: null,
  resolvedAt: null,
  createdAt: '2026-09-29T08:00:00.000Z',
  updatedAt: '2026-09-29T08:00:00.000Z',
  ...overrides,
});

const envelope = (data: unknown, meta?: unknown, statusCode = 200) => ({
  data: { success: true, statusCode, message: 'OK', data, ...(meta ? { meta } : {}) },
});
const listMeta = { page: 1, limit: 20, total: 1, totalPages: 1 };

describe('order complaint rules (client mirror of the Backend policy)', () => {
  it('offers types per order status and never offers warranty disputes', () => {
    expect(allowedComplaintTypes('UNDER_REPAIR')).toEqual(
      expect.arrayContaining(['pricing_dispute', 'property_damage', 'conduct']),
    );
    expect(allowedComplaintTypes('ACCEPTED')).not.toContain('property_damage');
    expect(allowedComplaintTypes('CANCELLED')).toEqual(['cancellation_review', 'other']);
    for (const status of ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED']) {
      expect(allowedComplaintTypes(status)).not.toContain('warranty_dispute');
    }
    expect(allowedComplaintTypes('UNKNOWN')).toEqual([]);
  });

  it('closes complaints 7 days after completion', () => {
    const now = new Date('2026-09-30T00:00:00.000Z');
    expect(allowedComplaintTypes('COMPLETED', '2026-09-24T00:00:00.000Z', now).length).toBeGreaterThan(0);
    expect(allowedComplaintTypes('COMPLETED', '2026-09-22T00:00:00.000Z', now)).toEqual([]);
    expect(isComplaintWindowOpen('UNDER_REPAIR', null, now)).toBe(true);
  });
});

describe('supportCasesApi own-case calls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a case and returns the actor-safe view', async () => {
    apiClientMock.post.mockResolvedValueOnce(envelope(mineRow({ isUrgent: true }), undefined, 201));

    const created = await supportCasesApi.createCase({
      caseType: 'quality',
      reason: 'Vòi nước vẫn rò rỉ sau khi sửa',
      serviceOrderId: 'order-1',
      isUrgent: true,
    });

    expect(apiClientMock.post).toHaveBeenCalledWith('/support/cases', expect.objectContaining({ serviceOrderId: 'order-1' }));
    expect(created).toMatchObject({ id: 'case-1', isUrgent: true, status: 'open' });
    expect(created).not.toHaveProperty('assignedManagerId');
  });

  it('lists and reads own cases through the mine routes and accepts the new case types', async () => {
    apiClientMock.get
      .mockResolvedValueOnce(envelope([mineRow({ caseType: 'property_damage' })], listMeta))
      .mockResolvedValueOnce(envelope(mineRow({ caseType: 'conduct' })));

    const list = await supportCasesApi.listMine({ serviceOrderId: 'order-1', limit: 20 });
    const one = await supportCasesApi.getMine('case-1');

    expect(apiClientMock.get).toHaveBeenNthCalledWith(1, '/support/cases/mine', {
      params: { serviceOrderId: 'order-1', limit: 20 },
    });
    expect(apiClientMock.get).toHaveBeenNthCalledWith(2, '/support/cases/mine/case-1');
    expect(list.data[0].caseType).toBe('property_damage');
    expect(one.caseType).toBe('conduct');
  });

  it('rejects an unsupported case type instead of rendering it', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope([mineRow({ caseType: 'made_up' })], listMeta));
    await expect(supportCasesApi.listMine()).rejects.toThrow('unsupported support case type');
  });
});

describe('OrderComplaintPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  const mountPanel = async (props: Record<string, unknown> = {}) => {
    const wrapper = mount(OrderComplaintPanel, {
      props: { orderId: 'order-1', orderStatus: 'UNDER_REPAIR', ...props },
      attachTo: document.body,
    });
    await flushPromises();
    return wrapper;
  };

  it('lists existing complaints with the resolution outcome once decided', async () => {
    apiClientMock.get.mockResolvedValueOnce(
      envelope(
        [
          mineRow({ status: 'resolved', resolutionReason: 'Đã yêu cầu kỹ thuật viên sửa lại miễn phí.' }),
        ],
        listMeta,
      ),
    );
    const wrapper = await mountPanel({ orderStatus: 'COMPLETED', completedAt: new Date().toISOString() });

    expect(wrapper.text()).toContain('Chất lượng sửa chữa chưa đạt');
    expect(wrapper.text()).toContain('Đã giải quyết');
    expect(wrapper.text()).toContain('Đã yêu cầu kỹ thuật viên sửa lại miễn phí.');
    wrapper.unmount();
  });

  it('inline (technician job page): hidden until a report exists, the page opens the form', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope([], { ...listMeta, total: 0, totalPages: 0 }));
    const wrapper = await mountPanel({ role: 'technician', inline: true });

    expect(wrapper.text()).toBe('');
    (wrapper.vm as unknown as { openForm: () => void }).openForm();
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.find('#complaint-type').exists()).toBe(true);
    wrapper.unmount();

    apiClientMock.get.mockResolvedValueOnce(envelope([mineRow({ caseType: 'conduct' })], listMeta));
    const withCase = await mountPanel({ role: 'technician', inline: true });
    expect(withCase.text()).toContain('Báo cáo đã gửi');
    expect(withCase.text()).toContain('Thái độ hoặc hành vi của khách hàng');
    // No second "Báo cáo vấn đề" button: the job page menu already has it.
    expect(withCase.findAll('button').some((b) => b.text().includes('Báo cáo vấn đề'))).toBe(false);
    withCase.unmount();
  });

  it('blocks a too-short description and does not call the API', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope([], { ...listMeta, total: 0, totalPages: 0 }));
    const wrapper = await mountPanel();

    await wrapper.findAll('button').find((b) => b.text() === 'Gửi khiếu nại')!.trigger('click');
    await wrapper.get('#complaint-reason').setValue('ngắn');
    const submit = wrapper.findAll('button').filter((b) => b.text().includes('Gửi khiếu nại')).at(-1)!;
    await submit.trigger('click');

    expect(apiClientMock.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('ít nhất 10 ký tự');
    wrapper.unmount();
  });

  it('submits once with the chosen type, the description and the urgent flag, then reloads', async () => {
    apiClientMock.get
      .mockResolvedValueOnce(envelope([], { ...listMeta, total: 0, totalPages: 0 }))
      .mockResolvedValueOnce(envelope([mineRow({ isUrgent: true })], listMeta));
    apiClientMock.post.mockResolvedValueOnce(envelope(mineRow({ isUrgent: true }), undefined, 201));
    const wrapper = await mountPanel();

    await wrapper.findAll('button').find((b) => b.text() === 'Gửi khiếu nại')!.trigger('click');
    await wrapper.get('#complaint-type').setValue('property_damage');
    await wrapper.get('#complaint-reason').setValue('Thợ làm vỡ gạch ốp tường trong lúc khoan');
    await wrapper.get('input[type="checkbox"]').setValue(true);
    const submit = wrapper.findAll('button').filter((b) => b.text().includes('Gửi khiếu nại')).at(-1)!;
    await submit.trigger('click');
    await flushPromises();

    expect(apiClientMock.post).toHaveBeenCalledTimes(1);
    expect(apiClientMock.post).toHaveBeenCalledWith('/support/cases', {
      caseType: 'property_damage',
      reason: 'Thợ làm vỡ gạch ốp tường trong lúc khoan',
      serviceOrderId: 'order-1',
      isUrgent: true,
    });
    expect(wrapper.text()).toContain('Đã gửi khiếu nại');
    expect(wrapper.find('#complaint-reason').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the Backend rejection and keeps the form open', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope([], { ...listMeta, total: 0, totalPages: 0 }));
    apiClientMock.post.mockRejectedValueOnce({
      response: { data: { message: 'Bạn đang có quá nhiều khiếu nại chưa xử lý cho đơn này.' } },
    });
    const wrapper = await mountPanel();

    await wrapper.findAll('button').find((b) => b.text() === 'Gửi khiếu nại')!.trigger('click');
    await wrapper.get('#complaint-reason').setValue('Kỹ thuật viên đòi thêm tiền ngoài báo giá');
    const submit = wrapper.findAll('button').filter((b) => b.text().includes('Gửi khiếu nại')).at(-1)!;
    await submit.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('quá nhiều khiếu nại');
    expect(wrapper.find('#complaint-reason').exists()).toBe(true);
    wrapper.unmount();
  });

  it('disables the button once the completion window has closed', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope([], { ...listMeta, total: 0, totalPages: 0 }));
    const wrapper = await mountPanel({
      orderStatus: 'COMPLETED',
      completedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    });

    const button = wrapper.findAll('button').find((b) => b.text() === 'Gửi khiếu nại')!;
    expect(button.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('không còn nhận khiếu nại');
    wrapper.unmount();
  });
});
