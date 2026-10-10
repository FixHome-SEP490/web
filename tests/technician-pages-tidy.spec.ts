// Technician screens (PO 10/10/2026): one place per action, short copy, skeletons while
// loading and a plain "Thử lại" line when loading fails.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

const { mockGet, mockPost, push } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn(), push: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get: mockGet, post: mockPost } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }), useRoute: () => ({ params: {} }) }));
vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn(), conversations: [] }),
}));

import TechnicianJobsPage from '../src/pages/technician/TechnicianJobsPage.vue';
import TechnicianInvitationsPage from '../src/pages/technician/TechnicianInvitationsPage.vue';
import TechnicianEarningsPage from '../src/pages/technician/TechnicianEarningsPage.vue';
import TechnicianWarrantyPage from '../src/pages/technician/TechnicianWarrantyPage.vue';

const Button = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  setup(props, { slots, attrs }) {
    return () => h('button', { type: 'button', ...attrs, disabled: props.disabled || props.loading }, slots.default?.());
  },
});
const stubs = { FhButton: Button, FhCountdown: true, 'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' } };
const serverFailure = { response: { status: 500, data: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } } } };

const order = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code: `SO-${id}`, bookingId: `b-${id}`, status, serviceName: `Dịch vụ ${id}`, customerName: 'Khách A',
  customerPhone: '0901234567', addressSummary: '1 Lê Lợi, Quận 1', scheduledAt: '2030-01-01T01:00:00Z',
  laborTotal: 100000, partsTotal: 20000, grandTotal: 120000, paymentStatus: 'UNPAID', createdAt: '2030-01-01T00:00:00Z',
  ...extra,
});

beforeEach(() => {
  mockGet.mockReset(); mockPost.mockReset(); push.mockReset();
  vi.stubGlobal('alert', vi.fn());
});

describe('TechnicianJobsPage', () => {
  it('uses the standard title, no second way into the invitations, and one call action per job', async () => {
    mockGet.mockResolvedValue({ data: { data: [order('a', 'ACCEPTED'), order('b', 'UNDER_REPAIR')] } });
    const wrapper = mount(TechnicianJobsPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('Công việc');
    expect(wrapper.text()).not.toMatch(/Hộp thư mời|Đơn Nhận Việc|Mở công việc/);
    const rowA = wrapper.get('[data-testid="technician-job-a"]');
    expect(rowA.findAll('a[href^="tel:"]')).toHaveLength(1);
    expect(rowA.text()).toContain('Bắt đầu di chuyển');
    // Only an accepted job can start moving.
    expect(wrapper.get('[data-testid="technician-job-b"]').text()).not.toContain('Bắt đầu di chuyển');
    // The row still opens the job.
    await rowA.trigger('click');
    expect(push).toHaveBeenCalledWith('/tech/jobs/a');
  });

  it('shows skeletons while loading, then a plain error with "Thử lại" that reloads', async () => {
    let fail!: (reason: unknown) => void;
    mockGet.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    const wrapper = mount(TechnicianJobsPage, { global: { stubs } });
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Đang tải');
    fail(serverFailure);
    await flushPromises();
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('Không thể tải danh sách công việc');
    expect(wrapper.text()).not.toMatch(/Internal|INTERNAL_ERROR|500/);
    expect(wrapper.text()).not.toContain('Chưa có công việc nào');

    mockGet.mockResolvedValueOnce({ data: { data: [order('c', 'EN_ROUTE')] } });
    await alert.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Dịch vụ c');
  });

  it('tells an empty filter apart from no jobs at all', async () => {
    mockGet.mockResolvedValue({ data: { data: [order('a', 'ACCEPTED')] } });
    const wrapper = mount(TechnicianJobsPage, { global: { stubs } });
    await flushPromises();
    const completedTab = wrapper.findAll('[role="tab"]').find((tab) => tab.text().startsWith('Hoàn thành'))!;
    await completedTab.trigger('click');
    expect(completedTab.attributes('aria-selected')).toBe('true');
    expect(wrapper.text()).toContain('Không có công việc ở mục này');
  });
});

describe('TechnicianInvitationsPage', () => {
  const invitation = {
    id: 'inv-1', bookingId: 'bk-1', priorityOrder: 1, status: 'pending',
    invitedAt: '2030-01-01T08:00:00Z', expiresAt: '2030-01-01T09:00:00Z',
    booking: { id: 'bk-1', serviceName: 'Sửa máy giặt', district: 'Quận 1', province: 'TP. Hồ Chí Minh', quantity: 1, urgency: 'high', preferredStartAt: null, preferredEndAt: null },
  };

  it('uses the standard title, says "Từ chối" for declining and closes the detail with Esc', async () => {
    mockGet.mockResolvedValue({ data: { data: [invitation] } });
    const wrapper = mount(TechnicianInvitationsPage, { global: { stubs }, attachTo: document.body });
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('Lời mời nhận việc');
    expect(wrapper.text()).not.toContain('Bỏ qua');
    const card = wrapper.get('[data-testid="invitation-inv-1"]');
    expect(card.findAll('button').map((b) => b.text().trim())).toEqual([
      expect.stringContaining('Sửa máy giặt'), 'Từ chối', 'Chấp nhận đơn này',
    ]);

    await wrapper.get('button.w-full').trigger('click');
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.text()).toContain('Khẩn cấp');
    expect(dialog.find('button[aria-label="Đóng"]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('declines through the same request as before', async () => {
    mockGet.mockResolvedValue({ data: { data: [invitation] } });
    mockPost.mockResolvedValue({ data: { data: { invitation: { id: 'inv-1', status: 'declined' } } } });
    const wrapper = mount(TechnicianInvitationsPage, { global: { stubs } });
    await flushPromises();
    await wrapper.findAll('button').find((b) => b.text().trim() === 'Từ chối')!.trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledWith('/invitations/inv-1/respond', { action: 'DECLINE' });
    expect(wrapper.text()).toContain('Không có lời mời nào đang chờ');
  });

  it('shows skeletons while loading and a retry line on failure', async () => {
    let fail!: (reason: unknown) => void;
    mockGet.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    const wrapper = mount(TechnicianInvitationsPage, { global: { stubs } });
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true);
    fail(serverFailure);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Thử lại');
    expect(wrapper.text()).not.toMatch(/Internal|500/);
    mockGet.mockResolvedValueOnce({ data: { data: [] } });
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Không có lời mời nào đang chờ');
  });
});

describe('TechnicianEarningsPage', () => {
  it('reaches the wallet from one row and hides the totals when loading fails', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/technician/wallet') return { data: { data: { balance: 500000 } } };
      return { data: { data: [order('a', 'COMPLETED', { completedAt: '2030-01-02T00:00:00Z', paymentStatus: 'PAID' })] } };
    });
    const wrapper = mount(TechnicianEarningsPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain('500.000');
    await wrapper.get('[data-testid="earnings-wallet"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/tech/wallet');
    expect(push.mock.calls.filter(([to]) => to === '/tech/wallet')).toHaveLength(1);

    mockGet.mockReset();
    mockGet.mockRejectedValue(serverFailure);
    const failed = mount(TechnicianEarningsPage, { global: { stubs } });
    await flushPromises();
    expect(failed.get('[role="alert"]').text()).toContain('Thử lại');
    expect(failed.find('[data-testid="earnings-totals"]').exists()).toBe(false);
  });
});

describe('TechnicianWarrantyPage', () => {
  it('offers "Thử lại" after a failed load and shows the claims once it works', async () => {
    mockGet.mockRejectedValueOnce(serverFailure);
    const wrapper = mount(TechnicianWarrantyPage, { global: { stubs } });
    await flushPromises();
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('Không thể tải danh sách bảo hành');
    expect(wrapper.text()).not.toMatch(/Internal|INTERNAL_ERROR/);
    mockGet.mockResolvedValueOnce({ data: { data: [] } });
    await alert.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Chưa có yêu cầu bảo hành');
  });
});
