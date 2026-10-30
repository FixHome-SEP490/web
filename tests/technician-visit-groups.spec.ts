import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { getTechnicianJobsPage, enRoute, assignedPage, push } = vi.hoisted(() => ({
  getTechnicianJobsPage: vi.fn(),
  enRoute: vi.fn(),
  assignedPage: vi.fn(),
  push: vi.fn(),
}));

vi.mock('../src/api/orders.api', () => ({
  ordersApi: { getTechnicianJobsPage, enRoute },
  historicalPill: vi.fn(() => ({ status: 'COMPLETED', label: 'Hoàn thành' })),
  isHistoricalOrder: (order: { historical?: boolean }) => order.historical === true,
  isReleasedJob: () => false,
}));
vi.mock('../src/api/visit-groups.api', () => ({ visitGroupsApi: { assignedPage } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn() }) }));

import TechnicianJobsPage from '../src/pages/technician/TechnicianJobsPage.vue';

const group = (id: string, leadStatus = 'accepted') => ({
  id,
  status: 'accepted',
  createdAt: '2026-10-22T08:00:00Z',
  bookingMode: 'scheduled',
  slot: null,
  scheduledAt: '2026-10-23T02:00:00Z',
  scheduledEndAt: null,
  items: [
    { itemId: `${id}-i1`, sequence: 1, bookingId: `${id}-b1`, serviceId: 'svc-ac', deviceLabel: 'Phòng khách', serviceName: 'Máy lạnh', orderId: `${id}-o1`, orderCode: `${id}-code-1`, bookingStatus: 'accepted', orderStatus: leadStatus, outcome: null },
    { itemId: `${id}-i2`, sequence: 2, bookingId: `${id}-b2`, serviceId: 'svc-ac', deviceLabel: 'Phòng ngủ', serviceName: 'Máy lạnh', orderId: `${id}-o2`, orderCode: `${id}-code-2`, bookingStatus: 'accepted', orderStatus: 'accepted', outcome: null },
  ],
  customerName: 'Tên khách chưa được phân công',
  addressSummary: 'Địa chỉ riêng tư',
});

const page = <T,>(items: T[], total: number, current = 1, pageSize = 20) => ({ items, total, page: current, pageSize });

async function mountPage() {
  const wrapper = mount(TechnicianJobsPage, {
    global: {
      stubs: {
        FhButton: { template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>' },
        FhMoney: { template: '<span />' },
        FhStatusPill: { props: ['label'], template: '<span>{{ label }}</span>' },
        'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe('TechnicianJobsPage grouped visits', () => {
  beforeEach(() => {
    push.mockReset();
    enRoute.mockReset().mockResolvedValue({});
    getTechnicianJobsPage.mockReset().mockResolvedValue(page([], 0));
    assignedPage.mockReset().mockResolvedValue(page([group('v1')], 1));
  });

  it('uses only the assigned page, shows one parent trip and links the lead order', async () => {
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="jobs-list-switch-visits"]').trigger('click');

    expect(assignedPage).toHaveBeenCalledWith(1, 20, { tab: 'all' });
    expect(assignedPage).toHaveBeenCalledTimes(1);
    expect(wrapper.findAll('[data-testid^="technician-visit-group-"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="technician-visit-group-v1"]').text()).toContain('2 thiết bị');
    expect(wrapper.get('[data-testid="technician-visit-device-v1-1"]').text()).toContain('Phòng khách');
    expect(wrapper.get('[data-testid="technician-visit-device-v1-2"]').text()).toContain('Phòng ngủ');
    expect(wrapper.get('[data-testid="technician-visit-group-v1"]').text()).not.toContain('Tên khách chưa được phân công');
    expect(wrapper.get('[data-testid="technician-visit-group-v1"]').text()).not.toContain('Địa chỉ riêng tư');
    expect(wrapper.get('[data-testid="technician-visit-open-v1"]').attributes('href')).toBe('/tech/jobs/v1-o1');
    expect(wrapper.findAll('button').filter((button) => button.text().includes('Bắt đầu di chuyển'))).toHaveLength(1);
    await wrapper.get('[data-testid="technician-visit-group-v1"] button').trigger('click');
    await flushPromises();
    expect(enRoute).toHaveBeenCalledTimes(1);
    expect(enRoute).toHaveBeenCalledWith('v1-o1');
  });

  it('shows date and address as consistently labeled text without decorative metadata icons', async () => {
    getTechnicianJobsPage.mockResolvedValue(page([{
      id: 'order-16', code: 'FH-16', bookingId: 'booking-16', serviceName: 'Sửa máy lạnh',
      status: 'ACCEPTED', scheduledAt: '2026-10-23T02:00:00Z', customerName: 'Khách A',
      customerPhone: null, addressSummary: 'Quận 1', laborTotal: 100000, partsTotal: 0, grandTotal: 100000,
    }], 1));
    const wrapper = await mountPage();
    const card = wrapper.get('[data-testid="technician-job-order-16"]');
    expect(card.text()).toContain('Ngày hẹn');
    expect(card.text()).toContain('Địa chỉ');
    expect(card.find('.lucide-calendar').exists()).toBe(false);
    expect(card.find('.lucide-map-pin').exists()).toBe(false);
  });

  it('preserves distinct per-device visit statuses without inventing an address', async () => {
    const mixed = group('mixed', 'en_route');
    mixed.items[1].orderStatus = 'under_repair';
    assignedPage.mockResolvedValue(page([mixed], 1));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="jobs-list-switch-visits"]').trigger('click');
    expect(wrapper.get('[data-testid="technician-visit-device-mixed-1"]').text()).toContain('Đang di chuyển');
    expect(wrapper.get('[data-testid="technician-visit-device-mixed-2"]').text()).toContain('Đang sửa chữa');
    expect(wrapper.get('[data-testid="technician-visit-group-mixed"]').text()).not.toContain('Địa chỉ riêng tư');
  });

  it('shows assigned technician address only when explicitly sent by Backend assigned-page', async () => {
    assignedPage.mockResolvedValue(page([{ ...group('v1'), assignedAddressSummary: '12 Đường kiểm thử, Quận 1' }], 1));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="jobs-list-switch-visits"]').trigger('click');
    expect(wrapper.get('[data-testid="technician-visit-address"]').text()).toContain('12 Đường kiểm thử, Quận 1');
    expect(wrapper.get('[data-testid="technician-visit-group-v1"]').text()).not.toContain('Địa chỉ riêng tư');
  });

  it('does not render an address line for a blank assigned address', async () => {
    assignedPage.mockResolvedValue(page([{ ...group('v1'), assignedAddressSummary: '  ' }], 1));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="jobs-list-switch-visits"]').trigger('click');
    expect(wrapper.find('[data-testid="technician-visit-address"]').exists()).toBe(false);
  });

  it('exposes named list controls and the parent status to assistive technology', async () => {
    const wrapper = await mountPage();
    const listSwitch = wrapper.get('[data-testid="jobs-list-switch-visits"]');
    await listSwitch.trigger('click');
    const groupCard = wrapper.get('[data-testid="technician-visit-group-v1"]');
    expect(listSwitch.attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Chọn loại danh sách công việc"]').exists()).toBe(true);
    expect(groupCard.get('[aria-label="Thiết bị trong lượt sửa"]').exists()).toBe(true);
    expect(groupCard.get('[aria-label="Trạng thái lượt sửa: Đã nhận lịch"]').exists()).toBe(true);
    expect(groupCard.get('[data-testid="technician-visit-open-v1"]').text()).toContain('Mở công việc');
  });

  it('shows a distinct empty state when the technician has no assigned visits', async () => {
    assignedPage.mockResolvedValue(page([], 0));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="jobs-list-switch-visits"]').trigger('click');
    expect(wrapper.get('[data-testid="technician-visit-groups-empty"]').text()).toContain('Chưa có lượt sửa nhiều thiết bị được phân công');
    expect(wrapper.findAll('[data-testid^="technician-visit-group-"]')).toHaveLength(0);
  });

  it('keeps an announced loading state until assigned visits arrive', async () => {
    let resolvePage!: (result: ReturnType<typeof page>) => void;
    assignedPage.mockReturnValue(new Promise((resolve) => { resolvePage = resolve; }));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="jobs-list-switch-visits"]').trigger('click');
    const loading = wrapper.get('[aria-label="Đang tải lượt sửa nhiều thiết bị"]');
    expect(loading.attributes('aria-busy')).toBe('true');
    resolvePage(page([], 0));
    await flushPromises();
    expect(wrapper.get('[data-testid="technician-visit-groups-empty"]').exists()).toBe(true);
  });

  it('requests the next server page without flattening the visit into child jobs', async () => {
    assignedPage.mockResolvedValue(page([group('v1')], 21, 1, 20));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="jobs-list-switch-visits"]').trigger('click');
    await wrapper.get('[data-testid="pagination-next"]').trigger('click');
    await flushPromises();
    expect(assignedPage).toHaveBeenLastCalledWith(2, 20, { tab: 'all' });
    expect(wrapper.findAll('[data-testid^="technician-visit-group-"]')).toHaveLength(1);
  });

  it('keeps device labels readable and action targets at least 44px high', async () => {
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="jobs-list-switch-visits"]').trigger('click');
    const card = wrapper.get('[data-testid="technician-visit-group-v1"]');
    expect(card.get('[data-testid="technician-visit-device-v1-1"] span').classes()).not.toContain('truncate');
    expect(card.get('[data-testid="technician-visit-open-v1"]').classes()).toContain('h-11');
  });

  it('keeps the legacy job list and tabs when the jobs view is selected', async () => {
    getTechnicianJobsPage.mockResolvedValue(page([{
      id: 'order-1', code: 'FH-1', bookingId: 'booking-1', serviceName: 'Sửa máy lạnh',
      status: 'ACCEPTED', scheduledAt: '2026-10-23T02:00:00Z', customerName: 'Khách A',
      customerPhone: null, addressSummary: 'Quận 1', laborTotal: 100000, partsTotal: 0, grandTotal: 100000,
    }], 1));
    const wrapper = await mountPage();

    expect(wrapper.get('[data-testid="jobs-list-switch-jobs"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-testid="jobs-tab-count-all"]').text()).toContain('1');
    expect(wrapper.get('[data-testid="technician-job-order-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="technician-visit-group-v1"]').exists()).toBe(false);
  });

  it('keeps one travel action on the lead order and does not offer it after travel starts', async () => {
    assignedPage.mockResolvedValueOnce(page([group('v1', 'en_route')], 1));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="jobs-list-switch-visits"]').trigger('click');

    expect(wrapper.findAll('button').filter((button) => button.text().includes('Bắt đầu di chuyển'))).toHaveLength(0);
    expect(wrapper.get('[data-testid="technician-visit-open-v1"]').attributes('href')).toBe('/tech/jobs/v1-o1');
  });
});
