import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// W-13 (PO 12/11/2026): a Service Manager cancels an order before repair starts, with a reason;
// an order under repair or finished offers no cancel. The server keeps the final say.
const mocks = vi.hoisted(() => ({
  getConsoleOrderContext: vi.fn(),
  cancelOrder: vi.fn(),
  authStore: { userRole: 'SERVICE_MANAGER' as string, hasPermission: () => true },
  route: { params: { id: 'order-1' } },
}));
vi.mock('../src/api/console-order-context.api', () => ({
  consoleOrderContextApi: { getConsoleOrderContext: mocks.getConsoleOrderContext },
}));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { cancelOrder: mocks.cancelOrder } }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking: vi.fn() }, isFullBookingWithMedia: () => false }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => mocks.authStore }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ push: vi.fn() }) }));
import ConsoleOrderDetailPage from '../src/pages/console/ConsoleOrderDetailPage.vue';

const order = (status: string) => ({
  id: 'order-1', code: 'FH-1', bookingId: '', status, scheduledAt: null, laborTotal: 0, partsTotal: 0, grandTotal: 0,
  paymentStatus: 'UNPAID', createdAt: null, updatedAt: null, timeline: [],
});
const mountPage = async () => {
  const wrapper = mount(ConsoleOrderDetailPage, {
    global: {
      stubs: {
        FhCard: { template: '<section><slot /></section>' }, FhSkeleton: true, FhStatusPill: true, FhMoney: true,
        BookingMediaViewer: true, GroupStopIncidentsPanel: true, StoppedWorkFinancePanel: true,
        ConsolePageHeader: { template: '<header><slot name="badges" /><slot name="actions" /></header>' },
        ConsoleLoadError: true, ConsoleMoreMenu: { template: '<div><slot /></div>' },
        ConsoleMenuItem: { template: '<button type="button"><slot /></button>' },
        'router-link': { props: ['to'], template: '<a><slot /></a>' },
      },
    },
  });
  await flushPromises();
  return wrapper;
};

describe('Service Manager cancels an order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authStore.userRole = 'SERVICE_MANAGER';
    mocks.getConsoleOrderContext.mockResolvedValue(order('accepted'));
  });

  it('asks for a reason, sends one cancel and reloads the order', async () => {
    mocks.cancelOrder.mockResolvedValue({});
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="order-cancel-open"]').trigger('click');
    await wrapper.get('[data-testid="order-cancel-confirm"]').trigger('click');
    expect(mocks.cancelOrder).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain('tối thiểu 10 ký tự');
    mocks.getConsoleOrderContext.mockResolvedValue(order('cancelled'));
    await wrapper.get('[data-testid="order-cancel-reason"]').setValue('  Khách báo đã tự sửa được máy  ');
    const confirm = wrapper.get('[data-testid="order-cancel-confirm"]');
    await Promise.all([confirm.trigger('click'), confirm.trigger('click')]);
    await flushPromises();
    expect(mocks.cancelOrder).toHaveBeenCalledTimes(1);
    expect(mocks.cancelOrder).toHaveBeenCalledWith('order-1', 'Khách báo đã tự sửa được máy');
    expect(wrapper.text()).toContain('Đã huỷ đơn');
    expect(wrapper.find('[data-testid="order-cancel-open"]').exists()).toBe(false);
  });

  it('shows the server refusal and keeps the dialog open', async () => {
    mocks.cancelOrder.mockRejectedValue({ response: { status: 409, data: { message: 'Đơn đã chuyển sang đang sửa.' } } });
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="order-cancel-open"]').trigger('click');
    await wrapper.get('[data-testid="order-cancel-reason"]').setValue('Thợ báo không tới được hôm nay');
    await wrapper.get('[data-testid="order-cancel-confirm"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="order-cancel-dialog"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="order-cancel-dialog"] [role="alert"]').text().length).toBeGreaterThan(0);
  });

  it.each(['under_repair', 'completed', 'cancelled'])('offers no cancel on a %s order', async (status) => {
    mocks.getConsoleOrderContext.mockResolvedValue(order(status));
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="order-cancel-open"]').exists()).toBe(false);
  });

  it('offers no cancel to the admin on this page', async () => {
    mocks.authStore.userRole = 'ADMIN';
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="order-cancel-open"]').exists()).toBe(false);
  });
});
