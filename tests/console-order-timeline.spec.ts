import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const mocks = vi.hoisted(() => ({
  getConsoleOrderContext: vi.fn(),
  authStore: { userRole: 'ADMIN' as string },
  route: { params: { id: 'order-1' } },
}));

vi.mock('../src/api/console-order-context.api', () => ({
  consoleOrderContextApi: { getConsoleOrderContext: mocks.getConsoleOrderContext },
}));
vi.mock('../src/api/bookings.api', () => ({
  bookingsApi: { getBooking: vi.fn() },
  isFullBookingWithMedia: () => false,
}));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => mocks.authStore }));
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn() }),
}));

import ConsoleOrderDetailPage from '../src/pages/console/ConsoleOrderDetailPage.vue';

const order = (timeline: Array<{ status: string; title: string; timestamp: string; actor: string }> = []) => ({
  id: 'order-1',
  code: 'SO-1',
  bookingId: '',
  status: 'COMPLETED',
  scheduledAt: null,
  laborTotal: 0,
  partsTotal: 0,
  grandTotal: 0,
  paymentStatus: 'PAID',
  createdAt: null,
  updatedAt: null,
  timeline,
});

const mountPage = () => mount(ConsoleOrderDetailPage, {
  global: {
    stubs: {
      FhCard: { template: '<section><slot /></section>' },
      FhSkeleton: true,
      FhStatusPill: true,
      FhMoney: true,
      BookingMediaViewer: true,
      ConsolePageHeader: { template: '<header><slot name="badges" /><slot name="actions" /></header>' },
      ConsoleLoadError: true,
      ConsoleMoreMenu: { template: '<div><slot /></div>' },
      ConsoleMenuItem: { template: '<button><slot /></button>' },
    },
  },
});

describe('Service Manager console order timeline', () => {
  beforeEach(() => {
    mocks.authStore.userRole = 'ADMIN';
    mocks.route.params.id = 'order-1';
    mocks.getConsoleOrderContext.mockReset();
    mocks.getConsoleOrderContext.mockResolvedValue(order());
  });

  it.each(['ADMIN', 'SERVICE_MANAGER'])('%s sees localized primary statuses and preserves entry order, actor, and time', async (role) => {
    mocks.authStore.userRole = role;
    mocks.getConsoleOrderContext.mockResolvedValue(order([
      { status: 'IN_PROGRESS', title: 'Technician started work', timestamp: '2026-10-29T02:00:00.000Z', actor: 'technician' },
      { status: 'FAILED', title: 'Internal payment verification failed', timestamp: '2026-10-29T02:30:00.000Z', actor: 'system' },
      { status: 'COMPLETED', title: 'Work completed by the technician and payment verified', timestamp: '2026-10-29T03:00:00.000Z', actor: 'technician' },
    ]));

    const wrapper = mountPage();
    await flushPromises();

    const steps = wrapper.findAll('.relative.group');
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.find('span.text-sm.font-semibold').text())).toEqual([
      'Đang sửa chữa',
      'Cập nhật trạng thái',
      'Đã hoàn thành',
    ]);
    expect(steps.map((step) => step.text()).join(' ')).not.toContain('Work completed by the technician');
    const reasonDetails = wrapper.findAll('details');
    expect(reasonDetails).toHaveLength(3);
    expect(reasonDetails.every((detail) => detail.attributes('open') === undefined)).toBe(true);
    expect(steps[0].text()).not.toContain('Technician started work');
    await reasonDetails[0].find('summary').trigger('click');
    expect(reasonDetails[0].attributes('open')).toBeDefined();
    expect(reasonDetails[0].text()).toContain('Technician started work');
    expect(steps[0].text()).toContain('Kỹ thuật viên');
    expect(steps[0].text()).toContain('09:00');
    expect(steps[1].text()).toContain('Hệ thống');
    expect(steps[1].text()).toContain('09:30');
    expect(steps[2].text()).toContain('10:00');
    wrapper.unmount();
  });

  it.each(['ADMIN', 'SERVICE_MANAGER'])('%s can explicitly expand original reasons while default view keeps only safe Vietnamese notes', async (role) => {
    mocks.authStore.userRole = role;
    mocks.getConsoleOrderContext.mockResolvedValue(order([
      { status: 'COMPLETED', title: 'Khách đã xác nhận thiết bị hoạt động bình thường.', timestamp: '2026-10-29T03:00:00.000Z', actor: 'customer' },
      { status: 'COMPLETED', title: 'Địa chỉ nhà riêng: 12 Trần Hưng Đạo.', timestamp: '2026-10-29T03:10:00.000Z', actor: 'customer' },
      { status: 'COMPLETED', title: 'Đã đổi số điện thoại của khách.', timestamp: '2026-10-29T03:20:00.000Z', actor: 'customer' },
      { status: 'COMPLETED', title: 'Khách liên hệ 091 234 5678 để xác nhận.', timestamp: '2026-10-29T03:30:00.000Z', actor: 'customer' },
      { status: 'COMPLETED', title: 'Khách tên Nguyễn Văn An đã xác nhận.', timestamp: '2026-10-29T03:40:00.000Z', actor: 'customer' },
      { status: 'COMPLETED', title: 'Contact nguyenvana@example.com at 12 Nguyen Trai street', timestamp: '2026-10-29T03:50:00.000Z', actor: 'customer' },
      { status: 'COMPLETED', title: `Lý do dài ${'nội dung '.repeat(30)}`, timestamp: '2026-10-29T04:00:00.000Z', actor: 'customer' },
    ]));

    const wrapper = mountPage();
    await flushPromises();

    const steps = wrapper.findAll('.relative.group');
    expect(steps[0].text()).toContain('Đã hoàn thành');
    expect(steps[0].text()).toContain('Khách đã xác nhận thiết bị hoạt động bình thường.');
    expect(steps).toHaveLength(7);
    for (const step of steps.slice(1)) {
      expect(step.text()).toContain('Đã hoàn thành');
      expect(step.find('p').exists()).toBe(false);
    }
    expect(wrapper.text()).toContain('Xem lý do gốc');
    const reasonDetails = wrapper.findAll('details');
    expect(reasonDetails).toHaveLength(7);
    expect(reasonDetails.every((detail) => detail.attributes('open') === undefined)).toBe(true);
    for (const step of steps) {
      expect(step.text()).not.toMatch(/Trần Hưng Đạo|điện thoại của khách|091 234 5678|Nguyễn Văn An|nguyenvana@example\.com|Lý do dài/u);
    }
    for (let index = 1; index < reasonDetails.length; index += 1) {
      await reasonDetails[index].find('summary').trigger('click');
      expect(reasonDetails[index].attributes('open')).toBeDefined();
      expect(reasonDetails[index].text()).toContain([
        '', 'Địa chỉ nhà riêng: 12 Trần Hưng Đạo.', 'Đã đổi số điện thoại của khách.',
        'Khách liên hệ 091 234 5678 để xác nhận.', 'Khách tên Nguyễn Văn An đã xác nhận.',
        'Contact nguyenvana@example.com at 12 Nguyen Trai street', 'Lý do dài',
      ][index]);
    }
    wrapper.unmount();
  });

  it('keeps the loading state while order history is unresolved', () => {
    mocks.getConsoleOrderContext.mockReturnValue(new Promise(() => {}));

    const wrapper = mountPage();

    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Chưa có lịch sử trạng thái.');
    wrapper.unmount();
  });

  it('keeps the empty-history message when Backend returns no timeline entries', async () => {
    mocks.getConsoleOrderContext.mockResolvedValue(order([]));

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('Chưa có lịch sử trạng thái.');
    expect(wrapper.findAll('.relative.group')).toHaveLength(0);
    wrapper.unmount();
  });
});
