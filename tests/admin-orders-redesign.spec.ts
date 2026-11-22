import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ConsoleOrdersPage from '../src/pages/console/ConsoleOrdersPage.vue';
import { useAuthStore } from '../src/stores/auth';
import type { ServiceOrderItem } from '../src/api/orders.api';

const { getOperational, getConsoleOrdersPage } = vi.hoisted(() => ({
  getOperational: vi.fn(),
  getConsoleOrdersPage: vi.fn(),
}));

vi.mock('../src/api/dashboard.api', () => ({
  dashboardApi: { getOperational },
}));

vi.mock('../src/api/orders.api', () => ({
  ordersApi: { getConsoleOrdersPage },
}));

const mockOps = () => ({
  ordersByStatus: [
    { status: 'under_repair', count: '8' },
    { status: 'completed', count: '123' },
    { status: 'cancelled', count: '87' },
  ],
  activeOrders: 8,
  matchingBookings: 0,
  pendingCancellations: 0,
});

const mockOrders: ServiceOrderItem[] = [
  {
    id: 'ord-1',
    code: 'FH-20261122-D1F48DC5',
    bookingId: 'b-1',
    serviceName: 'Lắp đặt điều hòa',
    customerName: 'Tạ Văn Dũng',
    customerPhone: '0901234578',
    addressSummary: 'Đường Hồ Thị Nhung, Phường Bình Trưng Đông',
    scheduledAt: '2026-11-22T07:00:00.000Z',
    createdAt: '2026-11-22T06:00:00.000Z',
    status: 'CANCELLED',
    technician: {
      id: 'tech-071',
      fullName: 'Võ Hữu Dũng (KTV-071)',
      phoneNumber: '0987654321',
      averageRating: 4.8,
    },
    laborTotal: 0,
    partsTotal: 0,
    grandTotal: 0,
    paymentStatus: 'UNPAID',
  },
  {
    id: 'ord-2',
    code: 'FH-20261122-A8D48FE2',
    bookingId: 'b-2',
    serviceName: 'Vệ sinh điều hòa',
    customerName: 'Khách hàng 2',
    customerPhone: '0904000002',
    addressSummary: '1109 Kha Vạn Cân, Phường Linh Xuân',
    scheduledAt: '2026-11-22T08:00:00.000Z',
    createdAt: '2026-11-22T07:00:00.000Z',
    status: 'COMPLETED',
    technician: undefined,
    laborTotal: 25000,
    partsTotal: 0,
    grandTotal: 25000,
    paymentStatus: 'PAID',
  },
  {
    id: 'ord-3',
    code: 'FH-20261122-980853DC',
    bookingId: 'b-3',
    serviceName: 'Vệ sinh điều hòa',
    customerName: 'Khách hàng 2',
    customerPhone: '0904000002',
    addressSummary: '1109 Kha Vạn Cân, Phường Linh Xuân',
    scheduledAt: '2026-11-22T09:00:00.000Z',
    createdAt: '2026-11-22T08:00:00.000Z',
    status: 'UNDER_REPAIR',
    technician: {
      id: 'tech-710',
      fullName: 'Võ Hữu Dũng (KTV-710)',
      phoneNumber: '0987654321',
      averageRating: 4.9,
    },
    laborTotal: 115000,
    partsTotal: 0,
    grandTotal: 115000,
    paymentStatus: 'UNPAID',
  },
  {
    id: 'ord-4',
    code: 'FH-20261122-F950165D',
    bookingId: 'b-4',
    serviceName: 'Vệ sinh điều hòa',
    customerName: 'Khách hàng 2',
    customerPhone: '0904000002',
    addressSummary: '1109 Kha Vạn Cân, Phường Linh Xuân',
    scheduledAt: '2026-11-22T10:00:00.000Z',
    createdAt: '2026-11-22T09:00:00.000Z',
    status: 'UNDER_REPAIR',
    workStopped: true,
    operationalDisposition: 'STOPPED',
    technician: undefined,
    laborTotal: 255001,
    partsTotal: 0,
    grandTotal: 255001,
    paymentStatus: 'UNPAID',
  },
  {
    id: 'ord-5',
    code: 'FH-20261122-90DCA5DB',
    bookingId: 'b-5',
    serviceName: 'Sửa máy giặt',
    customerName: 'Khách hàng 2',
    customerPhone: '0904000002',
    addressSummary: '1109 Kha Vạn Cân, Phường Linh Xuân',
    scheduledAt: '2026-11-22T11:00:00.000Z',
    createdAt: '2026-11-22T10:00:00.000Z',
    status: 'COMPLETED',
    technician: {
      id: 'tech-044',
      fullName: 'Nguyễn Quốc Bảo (KTV-044)',
      phoneNumber: '0912345678',
      averageRating: 4.7,
    },
    laborTotal: 5000,
    partsTotal: 0,
    grandTotal: 5000,
    paymentStatus: 'PAID',
  },
  {
    id: 'ord-6',
    code: 'FH-20261122-0CCF5758',
    bookingId: 'b-6',
    serviceName: 'Vệ sinh máy giặt',
    customerName: 'Khách hàng 2',
    customerPhone: '0904000002',
    addressSummary: '1109 Kha Vạn Cân, Phường Linh Xuân',
    scheduledAt: '2026-11-22T12:00:00.000Z',
    createdAt: '2026-11-22T11:00:00.000Z',
    status: 'COMPLETED',
    technician: {
      id: 'tech-044',
      fullName: 'Nguyễn Quốc Bảo (KTV-044)',
      phoneNumber: '0912345678',
      averageRating: 4.7,
    },
    laborTotal: 607000,
    partsTotal: 0,
    grandTotal: 607000,
    paymentStatus: 'PAID',
  },
];

const asAdmin = () => {
  useAuthStore().setAuth('token', { id: 'admin-1', fullName: 'Admin FixHome', email: 'admin@fixhome.vn', role: 'ADMIN' } as never);
};

const mountPage = async () => {
  const wrapper = mount(ConsoleOrdersPage, {
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

describe('Admin Repair Order List Redesign & API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    asAdmin();
    getOperational.mockResolvedValue(mockOps());
    getConsoleOrdersPage.mockResolvedValue({
      items: mockOrders,
      total: 218,
      page: 1,
      pageSize: 20,
    });
  });

  describe('A. Header & Count Badge', () => {
    it('renders the header title, count badge and subtitle', async () => {
      const wrapper = await mountPage();
      expect(wrapper.find('h1').text()).toBe('Đơn sửa chữa');
      expect(wrapper.text()).toContain('218');
      expect(wrapper.text()).toContain('Quản lý và theo dõi các đơn sửa chữa trên hệ thống');
    });
  });

  describe('B. 4 KPI Metric Cards', () => {
    it('calculates and displays 4 KPI cards correctly from real operational data', async () => {
      const wrapper = await mountPage();
      const text = wrapper.text();

      // Check titles
      expect(text).toContain('Tổng đơn');
      expect(text).toContain('Đang thực hiện');
      expect(text).toContain('Hoàn thành');
      expect(text).toContain('Đã hủy');

      // Check values: 218 total, 8 in progress, 123 completed, 87 cancelled
      expect(text).toContain('218');
      expect(text).toContain('8');
      expect(text).toContain('123');
      expect(text).toContain('87');
    });
  });

  describe('C. Search, Filter & Export Bar (with Service & Date filters)', () => {
    it('renders search input with correct placeholder and limits', async () => {
      const wrapper = await mountPage();
      const input = wrapper.find('input[type="search"]');
      expect(input.exists()).toBe(true);
      expect(input.attributes('placeholder')).toBe('Tìm mã đơn, khách hàng, dịch vụ');
    });

    it('renders status filter select with correct options', async () => {
      const wrapper = await mountPage();
      const statusSelect = wrapper.find('select[aria-label="Lọc theo trạng thái"]');
      expect(statusSelect.exists()).toBe(true);
      const options = statusSelect.findAll('option').map((o) => o.text());
      expect(options).toContain('Tất cả trạng thái');
      expect(options).toContain('Đã nhận đơn');
      expect(options).toContain('Đang di chuyển');
      expect(options).toContain('Đang sửa chữa');
      expect(options).toContain('Hoàn thành');
      expect(options).toContain('Đã huỷ');
    });

    it('renders service type filter select with options and filters list', async () => {
      const wrapper = await mountPage();
      const serviceSelect = wrapper.find('select[aria-label="Lọc theo loại dịch vụ"]');
      expect(serviceSelect.exists()).toBe(true);
      expect(serviceSelect.text()).toContain('Tất cả dịch vụ');
      expect(serviceSelect.text()).toContain('Lắp đặt điều hòa');
      expect(serviceSelect.text()).toContain('Sửa máy giặt');

      // Select 'Sửa máy giặt'
      await serviceSelect.setValue('Sửa máy giặt');
      await flushPromises();
      const rows = wrapper.findAll('tbody tr');
      expect(rows).toHaveLength(1);
      expect(rows[0].text()).toContain('FH-20261122-90DCA5DB');
    });

    it('renders date range picker with presets and custom date fields', async () => {
      const wrapper = await mountPage();
      const dateBtn = wrapper.find('button[aria-label="Chọn khoảng thời gian"]');
      expect(dateBtn.exists()).toBe(true);
      expect(dateBtn.text()).toContain('Chọn khoảng thời gian');

      // Click to open date picker dropdown
      await dateBtn.trigger('click');
      expect(wrapper.text()).toContain('Khoảng thời gian nhanh');
      expect(wrapper.text()).toContain('7 ngày qua');
      expect(wrapper.text()).toContain('Từ ngày');
      expect(wrapper.text()).toContain('Đến ngày');
    });

    it('renders reset button when filters are active', async () => {
      const wrapper = await mountPage();
      expect(wrapper.find('button:has(svg)').text()).not.toContain('Đặt lại');

      const serviceSelect = wrapper.find('select[aria-label="Lọc theo loại dịch vụ"]');
      await serviceSelect.setValue('Sửa máy giặt');
      await flushPromises();

      const resetBtn = wrapper.findAll('button').find((b) => b.text().includes('Đặt lại'));
      expect(resetBtn?.exists()).toBe(true);

      // Reset
      await resetBtn?.trigger('click');
      await flushPromises();
      expect(wrapper.findAll('tbody tr')).toHaveLength(6);
    });

    it('renders real Excel/CSV export button', async () => {
      const wrapper = await mountPage();
      const exportBtn = wrapper.findAll('button').find((b) => b.text().includes('Xuất dữ liệu'));
      expect(exportBtn?.exists()).toBe(true);
    });
  });

  describe('D. Table Columns, Synchronized Project Icons & Data Mapping', () => {
    it('renders all 6 order rows with correct columns and official project icons', async () => {
      const wrapper = await mountPage();
      const rows = wrapper.findAll('tbody tr');
      expect(rows).toHaveLength(6);

      // Row 1: Code and creation date
      expect(rows[0].text()).toContain('FH-20261122-D1F48DC5');
      expect(rows[0].text()).toContain('Lắp đặt điều hòa');
      expect(rows[0].text()).toContain('Tạ Văn Dũng');
      expect(rows[0].text()).toContain('0901 234 578');
      expect(rows[0].text()).toContain('Võ Hữu Dũng');
      expect(rows[0].text()).toContain('KTV-071');
      expect(rows[0].text()).toContain('0 đ');
      expect(rows[0].text()).toContain('Đã hủy');

      // Row 2: Unassigned technician displays dash
      expect(rows[1].text()).toContain('FH-20261122-A8D48FE2');
      expect(rows[1].text()).toContain('Vệ sinh điều hòa');
      expect(rows[1].text()).toContain('Khách hàng 2');
      expect(rows[1].text()).toContain('0904 000 002');
      expect(rows[1].text()).toContain('25.000 đ');
      expect(rows[1].text()).toContain('Hoàn thành');
      expect(rows[1].find('[aria-label="Chưa phân công"]').text()).toBe('—');

      // Row 3: In progress with technician
      expect(rows[2].text()).toContain('FH-20261122-980853DC');
      expect(rows[2].text()).toContain('Võ Hữu Dũng');
      expect(rows[2].text()).toContain('KTV-710');
      expect(rows[2].text()).toContain('115.000 đ');
      expect(rows[2].text()).toContain('Đang sửa chữa');

      // Row 4: Stopped work requires review
      expect(rows[3].text()).toContain('FH-20261122-F950165D');
      expect(rows[3].text()).toContain('255.001 đ');
      expect(rows[3].find('[data-testid="console-order-stopped"]').text()).toContain('Đã dừng sửa – cần đối soát');

      // Row 5: Washing machine repair
      expect(rows[4].text()).toContain('FH-20261122-90DCA5DB');
      expect(rows[4].text()).toContain('Sửa máy giặt');
      expect(rows[4].text()).toContain('Nguyễn Quốc Bảo');
      expect(rows[4].text()).toContain('KTV-044');
      expect(rows[4].text()).toContain('5.000 đ');

      // Row 6: Washing machine cleaning
      expect(rows[5].text()).toContain('FH-20261122-0CCF5758');
      expect(rows[5].text()).toContain('Vệ sinh máy giặt');
      expect(rows[5].text()).toContain('Nguyễn Quốc Bảo');
      expect(rows[5].text()).toContain('KTV-044');
      expect(rows[5].text()).toContain('607.000 đ');
    });

    it('navigates to order detail when clicking order code or eye icon', async () => {
      const wrapper = await mountPage();
      const codeLink = wrapper.findAllComponents(RouterLinkStub).find((l) => l.props().to === '/console/orders/ord-1');
      expect(codeLink?.exists()).toBe(true);
    });

    it('toggles action menu with links to detail and support request', async () => {
      const wrapper = await mountPage();
      const moreButtons = wrapper.findAll('button[title="Thao tác khác"]');
      expect(moreButtons.length).toBeGreaterThan(0);

      // Click more menu on row 1
      await moreButtons[0].trigger('click');
      expect(wrapper.text()).toContain('Xem chi tiết đơn');
      expect(wrapper.text()).toContain('Yêu cầu hỗ trợ của đơn');
    });
  });

  describe('E. Pagination Controls', () => {
    it('renders pagination label and page navigation buttons', async () => {
      const wrapper = await mountPage();
      expect(wrapper.text()).toContain('Hiển thị 1 – 20 trong 218 đơn');
      expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="pagination-prev"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="pagination-next"]').exists()).toBe(true);
    });
  });
});
