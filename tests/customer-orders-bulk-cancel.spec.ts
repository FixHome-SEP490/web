// tests/customer-orders-bulk-cancel.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('../src/api/client', () => ({
  default: { get: mockGet, post: mockPost },
  AUTH_SESSION_INVALIDATED_EVENT: 'fixhome:auth-session-invalidated',
  registerTokenRefreshed: vi.fn(),
  registerAuthSessionInvalidator: vi.fn(),
  getHttpStatus: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
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

function makeBooking(overrides: Partial<{ id: string; status: string; createdAt: string; serviceName: string }> = {}) {
  return {
    id: overrides.id ?? 'b1',
    customerId: 'c1',
    serviceId: 's1',
    serviceName: overrides.serviceName ?? 'Sửa điều hoà',
    addressId: 'a1',
    addressSummary: '12 Nguyễn Huệ',
    description: 'Mô tả',
    preferredAt: '2026-10-01T08:00:00Z',
    urgency: 'NORMAL' as const,
    status: overrides.status ?? 'submitted',
    createdAt: overrides.createdAt ?? '2026-09-20T08:00:00Z',
  };
}

function makeOrder(overrides: Partial<{ id: string; bookingId: string; status: string; createdAt: string; code: string }> = {}) {
  return {
    id: overrides.id ?? 'o1',
    code: overrides.code ?? 'ORD-001',
    bookingId: overrides.bookingId ?? 'b1',
    serviceName: 'Sửa điều hoà',
    status: overrides.status ?? 'accepted',
    customerName: 'Nguyễn A',
    customerPhone: '0900000000',
    addressSummary: '12 Nguyễn Huệ',
    scheduledAt: '2026-10-01T08:00:00Z',
    laborTotal: 200000,
    partsTotal: 0,
    grandTotal: 200000,
    paymentStatus: 'unpaid',
    createdAt: overrides.createdAt ?? '2026-09-21T08:00:00Z',
  };
}

const response = (rows: unknown[], total: number) => ({ data: { data: rows, meta: { total } } });

describe('CustomerOrdersPage: Request status visibility and bulk actions', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
  });

  it('surfaces active booking requests banner when viewing repair orders', async () => {
    mockGet.mockImplementation(async (url: string, opts?: { params?: { status?: string } }) => {
      if (url === '/visit-groups/my-page') return response([], 0);
      if (url === '/service-orders/my') return response([makeOrder({ id: 'o1' })], 1);
      if (url === '/bookings/my') {
        const st = opts?.params?.status;
        if (st === 'submitted') return response([makeBooking({ id: 'b1', status: 'submitted' })], 1);
        if (st === 'matching') return response([makeBooking({ id: 'b2', status: 'matching' })], 1);
        return response([], 0);
      }
      return response([], 0);
    });

    const wrapper = mount(CustomerOrdersPage, {
      global: {
        stubs: {
          FhButton: true,
          FhConfirmDialog: true,
          FhMoney: true,
          RebookDialog: true,
          'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
        },
      },
    });
    await flushPromises();

    // Default view is orders
    expect(wrapper.get('[data-testid="list-switch-orders"]').attributes('aria-pressed')).toBe('true');
    // Pending requests banner should be visible
    const callout = wrapper.find('[data-testid="pending-requests-callout"]');
    expect(callout.exists()).toBe(true);
    expect(callout.text()).toContain('Bạn có 2 yêu cầu đặt lịch đang tìm thợ');

    // Clicking "Xem yêu cầu" switches list to requests
    await callout.find('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="list-switch-requests"]').attributes('aria-pressed')).toBe('true');
  });

  it('does NOT show pending requests banner when all booking requests are cancelled', async () => {
    mockGet.mockImplementation(async (url: string, opts?: { params?: { status?: string } }) => {
      if (url === '/visit-groups/my-page') return response([], 0);
      if (url === '/service-orders/my') return response([makeOrder({ id: 'o1' })], 1);
      if (url === '/bookings/my') {
        const st = opts?.params?.status;
        if (st === 'cancelled') {
          return response([
            makeBooking({ id: 'b1', status: 'cancelled' }),
            makeBooking({ id: 'b2', status: 'cancelled' }),
            makeBooking({ id: 'b3', status: 'cancelled' }),
            makeBooking({ id: 'b4', status: 'cancelled' }),
            makeBooking({ id: 'b5', status: 'cancelled' }),
          ], 5);
        }
        return response([], 0);
      }
      return response([], 0);
    });

    const wrapper = mount(CustomerOrdersPage, {
      global: {
        stubs: {
          FhButton: true,
          FhConfirmDialog: true,
          FhMoney: true,
          RebookDialog: true,
          'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
        },
      },
    });
    await flushPromises();

    // Default view is orders
    expect(wrapper.get('[data-testid="list-switch-orders"]').attributes('aria-pressed')).toBe('true');
    // Pending requests banner must NOT be visible because 0 are finding technicians
    expect(wrapper.find('[data-testid="pending-requests-callout"]').exists()).toBe(false);
  });

  it('allows selecting requests individually and toggling select all', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/visit-groups/my-page') return response([], 0);
      if (url === '/service-orders/my') return response([], 0);
      if (url === '/bookings/my') {
        return response([
          makeBooking({ id: 'b1', status: 'submitted', serviceName: 'Sửa điều hoà' }),
          makeBooking({ id: 'b2', status: 'matching', serviceName: 'Vệ sinh máy lạnh' }),
          makeBooking({ id: 'b3', status: 'cancelled', serviceName: 'Bơm ga máy lạnh' }),
        ], 3);
      }
      return response([], 0);
    });

    const wrapper = mount(CustomerOrdersPage, {
      global: {
        stubs: {
          FhButton: true,
          FhConfirmDialog: true,
          FhMoney: true,
          RebookDialog: true,
          'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
        },
      },
    });
    await flushPromises();

    // Switch to requests list
    await wrapper.get('[data-testid="list-switch-requests"]').trigger('click');
    await flushPromises();

    // b1 and b2 are cancellable, b3 is cancelled
    expect(wrapper.get('[data-testid="select-booking-b1"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="select-booking-b2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="select-booking-b3"]').exists()).toBe(false);

    // Bulk bar is visible with select all
    const selectAll = wrapper.get('[data-testid="select-all-requests"]');
    expect(selectAll.exists()).toBe(true);

    // Select single booking b1
    await wrapper.get('[data-testid="select-booking-b1"]').trigger('change');
    await flushPromises();
    expect(wrapper.find('[data-testid="requests-bulk-bar"]').text()).toContain('Đã chọn 1 / 2');

    // Click select all -> both b1 and b2 selected
    await selectAll.trigger('change');
    await flushPromises();
    expect(wrapper.find('[data-testid="requests-bulk-bar"]').text()).toContain('Đã chọn 2 / 2');

    // Click select all again -> all deselected
    await selectAll.trigger('change');
    await flushPromises();
    expect(wrapper.find('[data-testid="requests-bulk-bar"]').text()).not.toContain('Đã chọn');
  });

  it('cancels selected requests in bulk with confirmation', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/visit-groups/my-page') return response([], 0);
      if (url === '/service-orders/my') return response([], 0);
      if (url === '/bookings/my') {
        return response([
          makeBooking({ id: 'b1', status: 'submitted' }),
          makeBooking({ id: 'b2', status: 'matching' }),
        ], 2);
      }
      return response([], 0);
    });
    mockPost.mockImplementation(async (url: string) => {
      if (url.endsWith('/cancel')) {
        return { data: { data: makeBooking({ status: 'cancelled' }) } };
      }
      return { data: {} };
    });

    const wrapper = mount(CustomerOrdersPage, {
      global: {
        stubs: {
          FhMoney: true,
          RebookDialog: true,
          'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
        },
      },
    });
    await flushPromises();

    // Switch to requests list
    await wrapper.get('[data-testid="list-switch-requests"]').trigger('click');
    await flushPromises();

    // Select all
    await wrapper.get('[data-testid="select-all-requests"]').trigger('change');
    await flushPromises();

    // Click bulk cancel button
    const bulkCancelBtn = wrapper.get('[data-testid="bulk-cancel-button"]');
    await bulkCancelBtn.trigger('click');
    await flushPromises();

    // Confirm dialog should be open
    const dialog = wrapper.findComponent(CustomerOrdersPage).findComponent({ name: 'FhConfirmDialog' });
    expect(dialog.exists()).toBe(true);
    expect(dialog.props('open')).toBe(true);

    await dialog.vm.$emit('confirm');
    await flushPromises();

    // Verify bookingsApi.cancelBooking was called for b1 and b2
    expect(mockPost).toHaveBeenCalledWith('/bookings/b1/cancel', expect.objectContaining({ reason: expect.any(String) }));
    expect(mockPost).toHaveBeenCalledWith('/bookings/b2/cancel', expect.objectContaining({ reason: expect.any(String) }));
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('Đã huỷ thành công 2 yêu cầu'));
  });
});
