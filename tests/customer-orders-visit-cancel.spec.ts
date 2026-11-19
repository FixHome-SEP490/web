// tests/customer-orders-visit-cancel.spec.ts
// "Huỷ lượt" on a waiting multi-device visit and the 24-hour waiting reminder (PO 19/11/2026). Mocked API only.
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
import FhConfirmDialog from '../src/components/FhConfirmDialog.vue';
import { canCancelVisit, staleWaiting, STALE_WAITING_MS } from '../src/pages/customer/customer-orders-filters';

const response = (rows: unknown[], total: number) => ({ data: { data: rows, meta: { total } } });
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

function visit(id: string, status: string, createdAt = hoursAgo(1)) {
  return {
    id, status, createdAt, bookingMode: 'urgent', slot: null, scheduledAt: null, scheduledEndAt: null,
    items: [1, 2].map((n) => ({ itemId: `${id}-i${n}`, sequence: n, bookingId: `${id}-b${n}`, serviceId: 's', deviceLabel: `Máy ${n}`, serviceName: 'Sửa máy giặt', orderId: null, orderCode: null, bookingStatus: 'submitted', orderStatus: null, outcome: null })),
  };
}
function booking(id: string, status: string, createdAt: string) {
  return { id, customerId: 'c1', serviceId: 's1', serviceName: 'Sửa điều hoà', addressId: 'a1', addressSummary: 'x', description: 'd', preferredAt: createdAt, urgency: 'NORMAL', status, createdAt };
}

function serve(visits: unknown[], bookings: unknown[] = []) {
  mockGet.mockReset().mockImplementation(async (url: string) => {
    if (url === '/visit-groups/my-page') return response(visits, visits.length);
    if (url === '/bookings/my') return response(bookings, bookings.length);
    return response([], 0);
  });
}

async function mountPage() {
  const wrapper = mount(CustomerOrdersPage, { global: { stubs: { FhButton: true, FhMoney: true, RebookDialog: true, 'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });
  await flushPromises();
  return wrapper;
}

describe('customer-orders-filters: visit cancel and stale waiting', () => {
  it('only a visit nobody holds yet can be cancelled from the list', () => {
    for (const s of ['submitted', 'matching', 'no_technician']) expect(canCancelVisit(s)).toBe(true);
    for (const s of ['accepted', 'en_route', 'under_repair', 'completed', 'cancelled', 'mixed']) expect(canCancelVisit(s)).toBe(false);
  });

  it('lists requests and visits waiting more than 24 hours, oldest first, never grouped children or finished ones', () => {
    const now = Date.parse('2026-11-19T12:00:00Z');
    const at = (h: number) => new Date(now - h * 3600_000).toISOString();
    const result = staleWaiting(
      [
        { id: 'b-old', status: 'SUBMITTED', createdAt: at(30) },
        { id: 'b-closed', status: 'CLOSED', createdAt: at(50) },
        { id: 'b-new', status: 'MATCHING', createdAt: at(2) },
        { id: 'b-child', status: 'SUBMITTED', createdAt: at(40), visitGroupId: 'g' },
        { id: 'b-cancel', status: 'CANCELLED', createdAt: at(90) },
      ],
      [
        { id: 'v-old', status: 'no_technician', createdAt: at(26) },
        { id: 'v-edge', status: 'submitted', createdAt: new Date(now - STALE_WAITING_MS).toISOString() },
        { id: 'v-done', status: 'completed', createdAt: at(99) },
      ],
      now,
    );
    expect(result.map((r) => r.id)).toEqual(['b-closed', 'b-old', 'v-old']);
  });
});

describe('CustomerOrdersPage: Huỷ lượt', () => {
  beforeEach(() => { mockPost.mockReset(); mockToast.success.mockReset(); mockToast.error.mockReset(); });

  it('shows the button only on waiting visits, confirms, calls the cancel API and reloads the list', async () => {
    serve([visit('vW', 'submitted'), visit('vR', 'under_repair')]);
    mockPost.mockResolvedValue({ data: { data: { id: 'vW', status: 'cancelled', items: [] } } });
    const wrapper = await mountPage();
    expect(wrapper.get('[data-testid="list-switch-visits"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="cancel-visit-btn-vR"]').exists()).toBe(false);

    await wrapper.get('[data-testid="cancel-visit-btn-vW"]').trigger('click');
    const dialog = wrapper.findComponent(FhConfirmDialog);
    expect(dialog.props('open')).toBe(true);
    expect(dialog.props('title')).toBe('Huỷ lượt sửa');
    expect(mockPost).not.toHaveBeenCalled();

    const visitCalls = () => mockGet.mock.calls.filter(([u]) => u === '/visit-groups/my-page').length;
    const before = visitCalls();
    dialog.vm.$emit('confirm');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledWith('/visit-groups/vW/cancel', { reason: 'Thay đổi nhu cầu / kế hoạch' });
    expect(mockToast.success).toHaveBeenCalledWith('Đã huỷ lượt sửa.');
    expect(visitCalls()).toBeGreaterThan(before);
    expect(wrapper.findComponent(FhConfirmDialog).props('open')).toBe(false);
  });

  it('keeps the dialog open and says so when the cancel fails', async () => {
    serve([visit('vW', 'matching')]);
    mockPost.mockRejectedValue(new Error('409'));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="cancel-visit-btn-vW"]').trigger('click');
    wrapper.findComponent(FhConfirmDialog).vm.$emit('confirm');
    await flushPromises();
    expect(mockToast.error).toHaveBeenCalledWith('Chưa huỷ được lượt sửa. Vui lòng thử lại.');
    expect(wrapper.findComponent(FhConfirmDialog).props('open')).toBe(true);
  });
});

describe('CustomerOrdersPage: waiting more than 24 hours', () => {
  it('shows a yellow reminder with Xem and Huỷ for the oldest waiting visit', async () => {
    serve([visit('vOld', 'no_technician', hoursAgo(30))]);
    const wrapper = await mountPage();
    const reminder = wrapper.get('[data-testid="stale-waiting-reminder"]');
    expect(reminder.text()).toContain('Bạn có 1 lượt sửa chờ thợ hơn 24 giờ.');
    expect(reminder.classes()).toContain('bg-warning-50');

    await wrapper.get('[data-testid="list-switch-orders"]').trigger('click');
    await wrapper.get('[data-testid="stale-waiting-view"]').trigger('click');
    expect(wrapper.get('[data-testid="list-switch-visits"]').attributes('aria-pressed')).toBe('true');

    await wrapper.get('[data-testid="stale-waiting-cancel"]').trigger('click');
    expect(wrapper.findComponent(FhConfirmDialog).props('title')).toBe('Huỷ lượt sửa');
  });

  it('names a stale request and opens its cancel dialog', async () => {
    serve([], [booking('bOld', 'submitted', hoursAgo(40))]);
    const wrapper = await mountPage();
    expect(wrapper.get('[data-testid="stale-waiting-reminder"]').text()).toContain('Bạn có 1 yêu cầu chờ thợ hơn 24 giờ.');
    await wrapper.get('[data-testid="stale-waiting-cancel"]').trigger('click');
    expect(wrapper.findComponent(FhConfirmDialog).props('title')).toBe('Huỷ yêu cầu đặt lịch');
  });

  it('shows nothing when everything waiting is recent', async () => {
    serve([visit('vNew', 'submitted', hoursAgo(3))], [booking('bNew', 'matching', hoursAgo(2))]);
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="stale-waiting-reminder"]').exists()).toBe(false);
  });
});
