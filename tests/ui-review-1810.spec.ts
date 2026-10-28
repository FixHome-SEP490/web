import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient } from '@tanstack/vue-query';

// PO 18/10/2026, UI review: the order page names the customer's problem apart from what the
// service covers, and the chat page fills the screen down to the tab bar.
const api = vi.hoisted(() => ({
  getOrder: vi.fn(), getInvoice: vi.fn(), getCashSettlement: vi.fn(), getEvidence: vi.fn(),
  getAdditionalCosts: vi.fn(), getOrderWarranties: vi.fn(), getOrderWarrantyClaims: vi.fn(),
  getTechnicianOrder: vi.fn(), getBooking: vi.fn(),
}));
vi.mock('../src/api/orders.api', () => ({
  ordersApi: new Proxy(api as Record<string, unknown>, {
    get: (target, key: string) => target[key] ?? vi.fn().mockRejectedValue(new Error('not needed')),
  }),
  coverageKindLabel: vi.fn(() => ''),
  describeCoverage: vi.fn(() => ''),
}));
vi.mock('../src/api/part-requests.api', () => ({ partRequestsApi: { getByOrderId: vi.fn().mockResolvedValue([]) } }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking: api.getBooking }, isFullBookingWithMedia: () => false }));
vi.mock('../src/api/reviews.api', () => ({ reviewsApi: { getByOrder: vi.fn().mockResolvedValue(null) } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'o1' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}));
type Handlers = Record<string, ((...args: unknown[]) => void) | undefined>;
const socket = vi.hoisted(() => {
  const handlers = new Set<Handlers>();
  return {
    connected: true,
    handlers,
    subscribe: vi.fn((h: Handlers) => { handlers.add(h); return () => handlers.delete(h); }),
    emit(name: string, ...args: unknown[]) { for (const h of [...handlers]) h[name]?.(...args); },
    connect: vi.fn(), disconnect: vi.fn(), joinConversation: vi.fn(), leaveConversation: vi.fn(), sendTyping: vi.fn(), updateToken: vi.fn(),
  };
});
vi.mock('../src/services/chat-socket.service', () => ({ chatSocketService: socket, default: socket }));

import CustomerOrderDetailPage from '../src/pages/customer/CustomerOrderDetailPage.vue';
import { startLiveUpdates } from '../src/services/live-updates';
import { defineComponent, h, ref } from 'vue';
import { useFillViewport } from '../src/composables/useFillViewport';

const order = (extra: Record<string, unknown> = {}) => ({
  id: 'o1', code: 'FH-1', status: 'UNDER_REPAIR', paymentStatus: 'UNPAID', grandTotal: 400000, bookingId: 'b1', ...extra,
});
const stubs = { RouterLink: true, 'router-link': true, CustomerStopReplaceRequest: true, CustomerCancelledRebookAction: true, OrderComplaintPanel: true, WarrantyClaimCard: true, WarrantyClaimModal: true, RebookDialog: true, ChatThread: true };
let stopLive: () => void = () => undefined;

beforeEach(() => {
  setActivePinia(createPinia());
  socket.handlers.clear();
  for (const fn of Object.values(api)) fn.mockReset();
  api.getOrder.mockResolvedValue(order());
  api.getInvoice.mockResolvedValue({ id: 'inv-1', grandTotal: 400000 });
  api.getCashSettlement.mockResolvedValue(null);
  api.getEvidence.mockResolvedValue([]);
  api.getAdditionalCosts.mockResolvedValue([]);
  api.getBooking.mockResolvedValue({ id: 'b1', description: 'Vòi rỉ' });
  stopLive = startLiveUpdates(new QueryClient());
});
afterEach(() => stopLive());

describe('order page: the problem and the service are two things', () => {
  it('shows what the customer wrote as the problem, and the service scope apart', async () => {
    api.getOrder.mockResolvedValue(order({ status: 'EN_ROUTE', bookingDescription: 'Máy giặt rung mạnh khi vắt', scopeDescription: 'Kiểm tra nguồn điện, rơ le, bo mạch' }));
    const w = mount(CustomerOrderDetailPage, { global: { stubs } });
    await flushPromises();
    expect(w.get('[data-testid="order-problem"]').text()).toBe('Máy giặt rung mạnh khi vắt');
    expect(w.get('[data-testid="order-scope"]').text()).toBe('Kiểm tra nguồn điện, rơ le, bo mạch');
    expect(w.text()).toContain('Sự cố bạn mô tả');
    expect(w.text()).toContain('Dịch vụ gồm');
    w.unmount();
  });

  it('falls back to the booking text when an older server sends no problem with the order', async () => {
    api.getOrder.mockResolvedValue(order({ status: 'EN_ROUTE' }));
    const w = mount(CustomerOrderDetailPage, { global: { stubs } });
    await flushPromises();
    expect(w.get('[data-testid="order-problem"]').text()).toBe('Vòi rỉ');
    expect(w.find('[data-testid="order-scope"]').exists()).toBe(false);
    w.unmount();
  });
});

describe('useFillViewport', () => {
  it('fills from where the panel starts down to the tab bar, and never below a usable minimum', async () => {
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { fn(0); return 1; });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    const dock = document.createElement('nav');
    dock.setAttribute('data-fh-bottom-dock', '');
    dock.getBoundingClientRect = () => ({ height: 64 } as DOMRect);
    document.body.appendChild(dock);
    let top = 180;
    let height: ReturnType<typeof useFillViewport> | null = null;
    const Panel = defineComponent({
      setup() {
        const el = ref<HTMLElement | null>(null);
        height = useFillViewport(el);
        return () => h('div', { ref: el });
      },
    });
    const w = mount(Panel, { attachTo: document.body });
    (w.element as HTMLElement).getBoundingClientRect = () => ({ top } as DOMRect);
    window.dispatchEvent(new Event('resize'));
    // 844 - 180 above (header and the wallet notice) - 64 tab bar - 16 gap.
    expect(height!.value).toBe(584);
    top = 700;
    window.dispatchEvent(new Event('resize'));
    expect(height!.value).toBe(420);
    // On a wide screen the tab bar is hidden (lg:hidden): nothing is kept for it.
    top = 180;
    dock.style.display = 'none';
    window.dispatchEvent(new Event('resize'));
    expect(height!.value).toBe(648);
    w.unmount();
    dock.remove();
    vi.unstubAllGlobals();
  });
});
