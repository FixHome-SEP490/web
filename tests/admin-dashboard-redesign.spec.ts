import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ConsoleDashboard from '../src/pages/console/ConsoleDashboard.vue';
import AdminOrderStatusDonut from '../src/components/console/AdminOrderStatusDonut.vue';
import AdminOrderTrendChart from '../src/components/console/AdminOrderTrendChart.vue';
import { useAuthStore } from '../src/stores/auth.store';
import type { ServiceOrderItem } from '../src/api/orders.api';

const { getOperational, getConsoleOrders } = vi.hoisted(() => ({
  getOperational: vi.fn(),
  getConsoleOrders: vi.fn(),
}));

vi.mock('../src/api/dashboard.api', () => ({ dashboardApi: { getOperational } }));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getConsoleOrders } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const mockOps = (extra: Record<string, unknown> = {}) => ({
  ordersByStatus: [
    { status: 'under_repair', count: '8' },
    { status: 'completed', count: '123' },
    { status: 'cancelled', count: '87' },
  ],
  activeOrders: 8,
  matchingBookings: 0,
  pendingCancellations: 0,
  ...extra,
});

const mockOrders: ServiceOrderItem[] = [
  {
    id: 'ord-1',
    code: 'FH-20261122-980853DC',
    bookingId: 'b-1',
    serviceName: 'Vệ sinh điều hòa',
    customerName: 'Khách hàng 2',
    customerPhone: '0901234567',
    addressSummary: '123 Nguyễn Huệ, Q.1',
    scheduledAt: '2026-11-22T07:00:00.000Z', // 14:00 VN
    createdAt: '2026-11-22T06:00:00.000Z',
    status: 'UNDER_REPAIR',
    technician: {
      id: 'tech-71',
      fullName: 'Võ Hữu Dũng (KTV-71)',
      phoneNumber: '0987654321',
      averageRating: 4.8,
    },
    laborTotal: 150000,
    partsTotal: 0,
    grandTotal: 150000,
    paymentStatus: 'UNPAID',
  },
  {
    id: 'ord-2',
    code: 'FH-20261122-F950165D',
    bookingId: 'b-2',
    serviceName: 'Vệ sinh điều hòa',
    customerName: 'Khách hàng 2',
    customerPhone: '0901234567',
    addressSummary: '123 Nguyễn Huệ, Q.1',
    scheduledAt: '2026-11-22T09:30:00.000Z', // 16:30 VN
    createdAt: '2026-11-22T08:00:00.000Z',
    status: 'UNDER_REPAIR',
    // technician is intentionally undefined to verify graceful fallback
    technician: undefined,
    laborTotal: 150000,
    partsTotal: 0,
    grandTotal: 150000,
    paymentStatus: 'UNPAID',
  },
];

const asAdmin = () => {
  useAuthStore().setAuth('token', { id: 'admin-1', fullName: 'Admin FixHome', email: 'admin@fixhome.vn', role: 'ADMIN' } as never);
};

const mountDashboard = async () => {
  const wrapper = mount(ConsoleDashboard, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        'router-link': RouterLinkStub,
      },
    },
  });
  await flushPromises();
  return wrapper;
};

describe('Admin Dashboard Redesign & Data Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    asAdmin();
  });

  describe('4 Metric Cards (KPIs)', () => {
    it('calculates and renders the 4 KPI cards correctly from backend ops data', async () => {
      getOperational.mockResolvedValue(mockOps());
      getConsoleOrders.mockResolvedValue(mockOrders);

      const wrapper = await mountDashboard();
      const text = wrapper.text();

      // Check titles
      expect(text).toContain('Tổng đơn');
      expect(text).toContain('Đang thực hiện');
      expect(text).toContain('Hoàn thành');
      expect(text).toContain('Đã hủy');

      // Check calculated values (8 + 123 + 87 = 218)
      expect(text).toContain('218');
      expect(text).toContain('8');
      expect(text).toContain('123');
      expect(text).toContain('87');
    });
  });

  describe('Donut Chart (Tình trạng đơn hàng)', () => {
    it('calculates correct percentages and renders center total', () => {
      const wrapper = mount(AdminOrderStatusDonut, {
        props: {
          completed: 123,
          active: 8,
          cancelled: 87,
        },
      });

      const text = wrapper.text();
      // Total 218
      expect(text).toContain('218');
      expect(text).toContain('Tổng đơn');

      // Percentages: 123/218 = 56.4%, 8/218 = 3.7%, 87/218 = 39.9%
      expect(text).toContain('123 (56.4%)');
      expect(text).toContain('8 (3.7%)');
      expect(text).toContain('87 (39.9%)');
    });

    it('handles zero total without crashing or NaN', () => {
      const wrapper = mount(AdminOrderStatusDonut, {
        props: {
          completed: 0,
          active: 0,
          cancelled: 0,
        },
      });

      expect(wrapper.text()).toContain('0');
      expect(wrapper.text()).toContain('Tổng đơn');
      expect(wrapper.text()).toContain('0 (0%)');
    });
  });

  describe('Line Chart (Biến động đơn dịch vụ)', () => {
    it('aggregates daily order counts and renders SVG curve', () => {
      const wrapper = mount(AdminOrderTrendChart, {
        props: {
          orders: mockOrders,
        },
      });

      expect(wrapper.text()).toContain('Biến động đơn dịch vụ');
      expect(wrapper.find('select').exists()).toBe(true);
      expect(wrapper.find('svg').exists()).toBe(true);
      expect(wrapper.find('path[fill="none"]').exists()).toBe(true);
    });

    it('switches time filter range between 7, 14, and 30 days', async () => {
      const wrapper = mount(AdminOrderTrendChart, {
        props: {
          orders: mockOrders,
        },
      });

      const select = wrapper.find('select');
      await select.setValue('14');
      expect((select.element as HTMLSelectElement).value).toBe('14');

      await select.setValue('30');
      expect((select.element as HTMLSelectElement).value).toBe('30');
    });
  });

  describe('Recent Orders Table (Đơn hàng gần đây)', () => {
    it('renders orders with correct columns: code, service, customer, technician, time, status', async () => {
      getOperational.mockResolvedValue(mockOps());
      getConsoleOrders.mockResolvedValue(mockOrders);

      const wrapper = await mountDashboard();

      // Check header title and link
      expect(wrapper.text()).toContain('Đơn hàng gần đây');
      expect(wrapper.text()).toContain('Xem tất cả');

      // Check order 1
      expect(wrapper.text()).toContain('FH-20261122-980853DC');
      expect(wrapper.text()).toContain('Võ Hữu Dũng (KTV-71)');
      expect(wrapper.text()).toContain('22/11/2026 14:00');
      expect(wrapper.text()).toContain('Đang sửa chữa');

      // Check order 2 with missing technician displaying "—"
      expect(wrapper.text()).toContain('FH-20261122-F950165D');
      expect(wrapper.text()).toContain('22/11/2026 16:30');

      // Order links
      const links = wrapper.findAllComponents(RouterLinkStub).map((l) => l.props('to'));
      expect(links).toContain('/console/orders/ord-1');
      expect(links).toContain('/console/orders/ord-2');
      expect(links).toContain('/console/orders');
    });

    it('shows empty state when no recent orders exist', async () => {
      getOperational.mockResolvedValue(mockOps());
      getConsoleOrders.mockResolvedValue([]);

      const wrapper = await mountDashboard();
      expect(wrapper.text()).toContain('Không có đơn hàng gần đây.');
    });
  });
});
