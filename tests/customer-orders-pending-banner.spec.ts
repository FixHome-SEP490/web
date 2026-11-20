import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../src/api/client', () => ({
  default: { get: mockGet, post: mockPost, delete: mockDelete },
  AUTH_SESSION_INVALIDATED_EVENT: 'fixhome:auth-session-invalidated',
  registerTokenRefreshed: vi.fn(),
  registerAuthSessionInvalidator: vi.fn(),
  getHttpStatus: vi.fn(),
}));

const mockPush = vi.fn();
const mockRoute = { query: {} as Record<string, string> };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute,
}));

vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({
    conversations: [],
    openConversationForBooking: vi.fn().mockResolvedValue(null),
    selectConversation: vi.fn(),
    toggleWidget: vi.fn(),
  }),
}));

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('vue-sonner', () => ({
  toast: mockToast,
}));

import CustomerOrdersPage from '../src/pages/customer/CustomerOrdersPage.vue';
import FhConfirmDialog from '../src/components/FhConfirmDialog.vue';

const response = (rows: unknown[], total: number) => ({ data: { data: rows, meta: { total } } });

function sampleVisit(id: string, status = 'submitted') {
  return {
    id,
    status,
    createdAt: new Date().toISOString(),
    bookingMode: 'urgent',
    slot: null,
    scheduledAt: null,
    scheduledEndAt: null,
    items: [
      {
        itemId: `${id}-i1`,
        sequence: 1,
        bookingId: `${id}-b1`,
        serviceId: 's1',
        deviceLabel: 'Máy 1',
        serviceName: 'Sửa máy giặt',
        orderId: null,
        orderCode: null,
        bookingStatus: 'submitted',
        orderStatus: null,
        outcome: null,
      },
    ],
  };
}

function sampleBooking(id: string, status = 'SUBMITTED') {
  return {
    id,
    customerId: 'c1',
    serviceId: 's1',
    serviceName: 'Vệ sinh máy lạnh',
    addressId: 'a1',
    addressSummary: '123 Nguyễn Huệ',
    description: 'Bị bụi bẩn',
    preferredAt: new Date().toISOString(),
    urgency: 'NORMAL',
    status,
    createdAt: new Date().toISOString(),
  };
}

function mockApiData(visits: unknown[] = [], bookings: unknown[] = [], orders: unknown[] = []) {
  mockGet.mockReset().mockImplementation(async (url: string) => {
    if (url === '/visit-groups/my-page') return response(visits, visits.length);
    if (url === '/bookings/my') return response(bookings, bookings.length);
    if (url === '/service-orders/my') return response(orders, orders.length);
    return response([], 0);
  });
}

describe('CustomerOrdersPage - Pending requests & visits warning banner', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    mockRoute.query = {};
  });

  it('renders pending warning banner when user has waiting requests and visits', async () => {
    const visits = [sampleVisit('v-1', 'submitted')];
    const bookings = [sampleBooking('b-1', 'MATCHING')];
    mockApiData(visits, bookings, []);

    const wrapper = mount(CustomerOrdersPage, {
      global: {
        stubs: {
          FhButton: true,
          FhMoney: true,
          RebookDialog: true,
          'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
        },
      },
    });
    await flushPromises();

    const banner = wrapper.find('[data-testid="orders-pending-waiting-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain('Bạn đã đạt giới hạn yêu cầu đang chờ');
    expect(banner.text()).toContain('2 lượt sửa chữa chờ kỹ thuật viên nhận');
    expect(banner.text()).toContain('1 yêu cầu đơn lẻ, 1 lượt nhiều thiết bị');

    // Test switch buttons
    const switchVisitsBtn = wrapper.find('[data-testid="switch-to-pending-visits"]');
    expect(switchVisitsBtn.exists()).toBe(true);

    // Badges on Level 1 tabs
    expect(wrapper.find('[data-testid="pending-badge-requests"]').text()).toBe('Chờ thợ: 1');
    expect(wrapper.find('[data-testid="pending-badge-visits"]').text()).toBe('Chờ thợ: 1');
  });

  it('shows toast with confirmation after successful cancellation', async () => {
    const visits = [sampleVisit('v-1', 'submitted')];
    mockApiData(visits, [], []);
    mockPost.mockResolvedValue({ data: { data: { id: 'v-1', status: 'cancelled', items: [] } } });

    const wrapper = mount(CustomerOrdersPage, {
      global: {
        stubs: {
          FhButton: true,
          FhMoney: true,
          RebookDialog: true,
          'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
        },
      },
    });
    await flushPromises();

    // Trigger cancel visit
    const cancelBtn = wrapper.find('[data-testid="cancel-visit-btn-v-1"]');
    expect(cancelBtn.exists()).toBe(true);
    await cancelBtn.trigger('click');
    await flushPromises();

    // Confirm cancel in dialog via emit
    const dialog = wrapper.findComponent(FhConfirmDialog);
    expect(dialog.exists()).toBe(true);
    dialog.vm.$emit('confirm');
    await flushPromises();

    expect(mockPost).toHaveBeenCalledWith('/visit-groups/v-1/cancel', { reason: 'Thay đổi nhu cầu / kế hoạch' });
    expect(mockToast.success).toHaveBeenCalledWith('Đã huỷ lượt sửa.');
  });
});
