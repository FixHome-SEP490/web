import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { OfficeVisitRow } from '../src/api/admin-office-visits.api';

const { listVisits, listOffices, markAttended, markMissed, resetMissed } = vi.hoisted(() => ({
  listVisits: vi.fn(),
  listOffices: vi.fn(),
  markAttended: vi.fn(),
  markMissed: vi.fn(),
  resetMissed: vi.fn(),
}));

vi.mock('../src/api/admin-office-visits.api', () => ({
  adminOfficeVisitsApi: {
    listVisits,
    listOffices,
    markAttended,
    markMissed,
    resetMissed,
  },
}));

import ConsoleOfficeVisitsPage from '../src/pages/console/ConsoleOfficeVisitsPage.vue';

const mockOffices = [
  { id: 'off-1', name: 'Chi nhánh FixHome Thủ Đức', address: '15 Võ Văn Ngân, Thủ Đức' },
  { id: 'off-2', name: 'Chi nhánh FixHome Phú Nhuận', address: '120 Phan Xích Long, Phú Nhuận' },
];

const mockVisits: OfficeVisitRow[] = [
  {
    id: 'v-1',
    officeId: 'off-1',
    officeName: 'Chi nhánh FixHome Thủ Đức',
    officeAddress: '15 Võ Văn Ngân, TP. Thủ Đức',
    scheduledAt: '2026-11-09T01:00:00.000Z', // 08:00 VN
    status: 'attended',
    technicianId: 'tech-1',
    technicianName: 'Nguyễn Văn A',
    technicianPhone: '0398100001',
    note: null,
  },
  {
    id: 'v-2',
    officeId: 'off-2',
    officeName: 'Chi nhánh FixHome Phú Nhuận',
    officeAddress: '120 Phan Xích Long, Phú Nhuận',
    scheduledAt: '2026-11-09T01:30:00.000Z', // 08:30 VN
    status: 'cancelled',
    technicianId: 'tech-1',
    technicianName: 'Nguyễn Văn A',
    technicianPhone: '0398100001',
    note: null,
  },
  {
    id: 'v-3',
    officeId: 'off-2',
    officeName: 'Chi nhánh FixHome Phú Nhuận',
    officeAddress: '120 Phan Xích Long, Phú Nhuận',
    scheduledAt: '2026-11-09T02:00:00.000Z', // 09:00 VN
    status: 'missed',
    technicianId: 'tech-2',
    technicianName: 'Trần Văn B',
    technicianPhone: '0987654321',
    note: 'Không đến đúng giờ',
  },
  {
    id: 'v-4',
    officeId: 'off-1',
    officeName: 'Chi nhánh FixHome Thủ Đức',
    officeAddress: '15 Võ Văn Ngân, TP. Thủ Đức',
    scheduledAt: '2026-11-23T02:30:00.000Z', // 09:30 VN
    status: 'scheduled',
    technicianId: 'tech-3',
    technicianName: 'Lê Văn C',
    technicianPhone: '0912345678',
    note: null,
  },
];

describe('ConsoleOfficeVisitsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOffices.mockResolvedValue(mockOffices);
    listVisits.mockResolvedValue(mockVisits);
  });

  it('renders page header and stat cards with accurate metrics', async () => {
    const wrapper = mount(ConsoleOfficeVisitsPage, {
      global: { stubs: { teleport: true } },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Lịch hẹn trụ sở');
    expect(wrapper.text()).toContain('Theo dõi và quản lý lịch hẹn của kỹ thuật viên');

    // Stats cards: Tổng lịch = 4, Đã gặp = 1, Vắng = 1, Cần hỗ trợ lại = 1 (tech-2)
    expect(wrapper.text()).toContain('Tổng lịch');
    expect(wrapper.text()).toContain('4');
    expect(wrapper.text()).toContain('Đã gặp');
    expect(wrapper.text()).toContain('1');
    expect(wrapper.text()).toContain('Vắng');
    expect(wrapper.text()).toContain('Cần hỗ trợ lại');
  });

  it('filters rows by search input', async () => {
    const wrapper = mount(ConsoleOfficeVisitsPage, {
      global: { stubs: { teleport: true } },
    });
    await flushPromises();

    // Initially 4 rows
    expect(wrapper.findAll('tbody tr')).toHaveLength(4);

    // Search by technician name
    const searchInput = wrapper.find('input[type="search"]');
    await searchInput.setValue('Nguyễn Văn A');
    await flushPromises();

    // Only 2 visits belonging to Nguyễn Văn A
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    expect(wrapper.text()).toContain('Nguyễn Văn A');
    expect(wrapper.text()).not.toContain('Trần Văn B');

    // Search by phone
    await searchInput.setValue('0987654321');
    await flushPromises();
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.text()).toContain('Trần Văn B');
  });

  it('filters rows by status dropdown and toggles via stat cards', async () => {
    const wrapper = mount(ConsoleOfficeVisitsPage, {
      global: { stubs: { teleport: true } },
    });
    await flushPromises();

    // Select "Đã gặp" in dropdown
    const select = wrapper.find('#filter-status');
    await select.setValue('attended');
    await flushPromises();

    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.text()).toContain('Nguyễn Văn A');

    // Click "Vắng" stat card to toggle filter to missed
    const missedCard = wrapper.findAll('button').find((b) => b.text().includes('Vắng'))!;
    await missedCard.trigger('click');
    await flushPromises();

    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.text()).toContain('Trần Văn B');
    expect(wrapper.text()).toContain('Không đến đúng giờ');
  });

  it('opens drawer on row click and displays technician details', async () => {
    const wrapper = mount(ConsoleOfficeVisitsPage, {
      global: { stubs: { teleport: true } },
    });
    await flushPromises();

    // Click on row 3 (Trần Văn B - missed)
    const rows = wrapper.findAll('tbody tr');
    await rows[2].trigger('click');
    await flushPromises();

    // Drawer should be open
    const drawer = wrapper.find('[role="dialog"]');
    expect(drawer.exists()).toBe(true);
    expect(drawer.text()).toContain('Chi tiết lịch hẹn');
    expect(drawer.text()).toContain('Trần Văn B');
    expect(drawer.text()).toContain('0987654321');
    expect(drawer.text()).toContain('Chi nhánh FixHome Phú Nhuận');
    expect(drawer.text()).toContain('120 Phan Xích Long, Phú Nhuận');
    expect(drawer.text()).toContain('Không đến đúng giờ');
    expect(drawer.text()).toContain('Vắng mặt');
  });

  it('obeys strict business rules: NEVER shows "Cho phép đặt lại" for attended visits', async () => {
    const wrapper = mount(ConsoleOfficeVisitsPage, {
      global: { stubs: { teleport: true } },
    });
    await flushPromises();

    // Click on row 1 (Nguyễn Văn A - attended)
    const rows = wrapper.findAll('tbody tr');
    await rows[0].trigger('click');
    await flushPromises();

    const drawer = wrapper.find('[role="dialog"]');
    expect(drawer.exists()).toBe(true);
    expect(drawer.text()).toContain('Đã gặp');

    // Strict rule: MUST NOT display "Cho phép đặt lại" for attended visits!
    const buttons = drawer.findAll('button').map((b) => b.text());
    expect(buttons).not.toContain('Cho phép đặt lại');
    expect(drawer.text()).not.toContain('Cho phép đặt lại');
    // It should have "Liên hệ" and "Đóng"
    expect(drawer.find('a[href="tel:0398100001"]').exists()).toBe(true);
    expect(buttons).toContain('Đóng');
  });

  it('displays "Cho phép đặt lại" for missed visits and prompts action modal', async () => {
    const wrapper = mount(ConsoleOfficeVisitsPage, {
      global: { stubs: { teleport: true } },
    });
    await flushPromises();

    // Click on row 3 (Trần Văn B - missed)
    const rows = wrapper.findAll('tbody tr');
    await rows[2].trigger('click');
    await flushPromises();

    const drawer = wrapper.find('[role="dialog"]');
    expect(drawer.text()).toContain('Cho phép đặt lại');

    const resetBtn = drawer.findAll('button').find((b) => b.text().includes('Cho phép đặt lại'))!;
    await resetBtn.trigger('click');
    await flushPromises();

    // Confirmation modal should open
    const modals = wrapper.findAll('[role="dialog"]');
    const confirmModal = modals[modals.length - 1];
    expect(confirmModal.text()).toContain('Cho phép đặt lại lịch');
    expect(confirmModal.text()).toContain('Trần Văn B');

    // Click confirm in modal
    const confirmBtn = confirmModal.findAll('button').find((b) => b.text() === 'Cho phép đặt lại')!;
    await confirmBtn.trigger('click');
    await flushPromises();

    expect(resetMissed).toHaveBeenCalledWith('tech-2');
  });

  it('displays "Xác nhận đã gặp" and "Ghi nhận vắng mặt" for scheduled visits', async () => {
    const wrapper = mount(ConsoleOfficeVisitsPage, {
      global: { stubs: { teleport: true } },
    });
    await flushPromises();

    // Click on row 4 (Lê Văn C - scheduled)
    const rows = wrapper.findAll('tbody tr');
    await rows[3].trigger('click');
    await flushPromises();

    const drawer = wrapper.find('[role="dialog"]');
    expect(drawer.text()).toContain('Chờ xác nhận');
    expect(drawer.text()).toContain('Xác nhận đã gặp');
    expect(drawer.text()).toContain('Ghi nhận vắng mặt');

    // Test mark attended
    const attendedBtn = drawer.findAll('button').find((b) => b.text().includes('Xác nhận đã gặp'))!;
    await attendedBtn.trigger('click');
    await flushPromises();

    const modals = wrapper.findAll('[role="dialog"]');
    const confirmModal = modals[modals.length - 1];
    expect(confirmModal.text()).toContain('Xác nhận buổi gặp');

    // Enter note
    const noteInput = confirmModal.find('input[type="text"]');
    await noteInput.setValue('Đã đối chiếu CCCD và bằng cấp');

    const confirmBtn = confirmModal.findAll('button').find((b) => b.text() === 'Xác nhận đã gặp')!;
    await confirmBtn.trigger('click');
    await flushPromises();

    expect(markAttended).toHaveBeenCalledWith('v-4', 'Đã đối chiếu CCCD và bằng cấp');
  });
});
