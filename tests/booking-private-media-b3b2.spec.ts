import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

const mocks = vi.hoisted(() => ({
  getTechnicianOrder: vi.fn(),
  getCashSettlement: vi.fn(),
  getAdditionalCosts: vi.fn(),
  getBooking: vi.fn(),
  getBookingMediaContent: vi.fn(),
  getConsoleOrderContext: vi.fn(),
  authStore: { userRole: 'ADMIN' as string },
  routeProxy: { current: null as null | { params: { id: string } } },
}));

vi.mock('../src/api/orders.api', () => ({
  ordersApi: {
    getTechnicianOrder: mocks.getTechnicianOrder,
    getCashSettlement: mocks.getCashSettlement,
    getAdditionalCosts: mocks.getAdditionalCosts,
    uploadEvidence: vi.fn(),
  },
  isHistoricalOrder: (order: { historical?: boolean }) => order.historical === true,
}));

vi.mock('../src/api/bookings.api', () => ({
  bookingsApi: { getBooking: mocks.getBooking },
  isFullBookingWithMedia: (booking: { id?: string; media?: unknown[] }, expectedId: string) =>
    booking.id === expectedId && Array.isArray(booking.media) && booking.media.every((media) => {
      if (!media || typeof media !== 'object') return false;
      const item = media as Record<string, unknown>;
      return typeof item.id === 'string'
        && (item.url === null || typeof item.url === 'string')
        && typeof item.isPrivate === 'boolean'
        && typeof item.legacyInsecure === 'boolean'
        && typeof item.mimeType === 'string'
        && (item.sizeBytes === null || typeof item.sizeBytes === 'number')
        && (!item.isPrivate || item.url === null);
    }),
}));

vi.mock('../src/api/media.api', () => ({
  mediaApi: {
    upload: vi.fn(),
    getBookingMediaContent: mocks.getBookingMediaContent,
  },
}));

vi.mock('../src/api/console-order-context.api', () => ({
  consoleOrderContextApi: { getConsoleOrderContext: mocks.getConsoleOrderContext },
}));

vi.mock('../src/stores/auth', () => ({ useAuthStore: () => mocks.authStore }));
vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({
    openConversationForBooking: vi.fn(),
    toggleWidget: vi.fn(),
    conversations: [],
    selectConversation: vi.fn(),
  }),
}));
vi.mock('vue-router', () => ({
  useRoute: () => mocks.routeProxy.current,
  useRouter: () => ({ push: vi.fn() }),
}));

import TechnicianJobDetailPage from '../src/pages/technician/TechnicianJobDetailPage.vue';
import ConsoleOrderDetailPage from '../src/pages/console/ConsoleOrderDetailPage.vue';

const media = {
  id: 'private-media-1',
  url: null,
  isPrivate: true,
  legacyInsecure: false,
  mimeType: 'image/jpeg',
  sizeBytes: 42,
};

const activeJob = {
  id: 'job-1',
  bookingId: 'booking-1',
  code: 'SO-1',
  status: 'ACCEPTED',
  paymentStatus: 'UNPAID',
  laborTotal: 0,
  partsTotal: 0,
  grandTotal: 0,
  customerPhone: '000',
  addressSummary: 'District 1',
};

const fullBooking = (id = 'booking-1') => ({
  id,
  customerId: 'customer-1',
  serviceId: 'service-1',
  addressId: 'address-1',
  serviceName: 'Sửa điều hoà',
  addressSummary: 'District 1',
  description: 'Không lạnh',
  preferredAt: '2026-09-23T08:00:00.000Z',
  urgency: 'NORMAL',
  status: 'MATCHED',
  createdAt: '2026-09-22T08:00:00.000Z',
  media: [media],
});

const consoleOrder = (bookingId = 'booking-console') => ({
  id: 'order-1',
  code: 'SO-CONSOLE-1',
  bookingId,
  status: 'UNDER_REPAIR',
  scheduledAt: null,
  laborTotal: 100,
  partsTotal: 200,
  grandTotal: 300,
  paymentStatus: 'UNPAID',
  createdAt: null,
  updatedAt: null,
});

const stubs = {
  FhButton: true,
  FhCard: true,
  FhStatusPill: true,
  FhCostBreakdown: true,
  FhMoney: true,
  FhTimeline: true,
};

beforeEach(() => {
  mocks.getTechnicianOrder.mockReset().mockResolvedValue(activeJob);
  mocks.getCashSettlement.mockReset().mockResolvedValue(null);
  mocks.getAdditionalCosts.mockReset().mockResolvedValue([]);
  mocks.getBooking.mockReset().mockResolvedValue(fullBooking());
  mocks.getBookingMediaContent.mockReset().mockResolvedValue(new Blob(['private'], { type: 'image/jpeg' }));
  mocks.getConsoleOrderContext.mockReset().mockResolvedValue(consoleOrder());
  mocks.authStore = reactive(mocks.authStore);
  mocks.authStore.userRole = 'ADMIN';
  if (!mocks.routeProxy.current) {
    mocks.routeProxy.current = reactive({ params: { id: 'job-1' } });
  } else {
    mocks.routeProxy.current.params.id = 'job-1';
  }
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:b3b2-preview'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('technician ServiceOrder private media access', () => {
  it('shows private media only for an active assigned winner with a full Booking response', async () => {
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    expect(mocks.getBooking).toHaveBeenCalledWith('booking-1');
    expect(wrapper.find('[data-testid="booking-media-viewer"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('does not fetch Booking media for historical former technicians', async () => {
    mocks.getTechnicianOrder.mockResolvedValueOnce({
      id: 'job-old', code: 'SO-OLD', status: 'ACCEPTED', historical: true,
      createdAt: '2026-01-01T00:00:00.000Z', completedAt: null, cancelledAt: null,
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    expect(mocks.getBooking).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="booking-media-viewer"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([
    ['missing bookingId', { ...activeJob, bookingId: '' }, fullBooking()],
    ['failed full Booking GET', activeJob, new Error('403')],
    ['preview-only Booking response', activeJob, { ...fullBooking(), media: undefined }],
  ])('does not render private media for %s', async (_label, job, bookingResponse) => {
    mocks.getTechnicianOrder.mockResolvedValueOnce(job);
    mocks.getBooking.mockReset();
    if (bookingResponse instanceof Error) mocks.getBooking.mockRejectedValueOnce(bookingResponse);
    else mocks.getBooking.mockResolvedValueOnce(bookingResponse);
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find('[data-testid="booking-media-viewer"]').exists()).toBe(false);
    if (!job.bookingId) expect(mocks.getBooking).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('ignores a late Booking response after detail unmount', async () => {
    let resolveBooking!: (value: unknown) => void;
    mocks.getBooking.mockImplementationOnce(() => new Promise((resolve) => { resolveBooking = resolve; }));
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    wrapper.unmount();
    resolveBooking(fullBooking());
    await flushPromises();

    expect(document.body.querySelector('[data-testid="booking-media-viewer"]')).toBeNull();
  });

  it('ignores a late Booking response after navigating to another ServiceOrder', async () => {
    let resolveOldBooking!: (value: unknown) => void;
    mocks.getBooking.mockImplementationOnce(() => new Promise((resolve) => { resolveOldBooking = resolve; }));
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    mocks.getTechnicianOrder.mockResolvedValueOnce({ ...activeJob, id: 'job-2', bookingId: 'booking-2' });
    mocks.getBooking.mockResolvedValueOnce(fullBooking('booking-2'));
    mocks.routeProxy.current!.params.id = 'job-2';
    await flushPromises();

    expect(mocks.getBooking).toHaveBeenNthCalledWith(2, 'booking-2');
    expect(wrapper.find('[data-testid="booking-media-viewer"]').exists()).toBe(true);
    resolveOldBooking(fullBooking('booking-1'));
    await flushPromises();

    expect(mocks.getBookingMediaContent).toHaveBeenCalledWith('booking-2', 'private-media-1');
    expect(mocks.getBookingMediaContent).not.toHaveBeenCalledWith('booking-1', 'private-media-1');
    wrapper.unmount();
  });
});

describe('staff console private media access', () => {
  it.each(['ADMIN', 'SERVICE_MANAGER'])('shows private media for authorized %s context', async (role) => {
    mocks.authStore.userRole = role;
    mocks.getBooking.mockResolvedValueOnce(fullBooking('booking-console'));
    const wrapper = mount(ConsoleOrderDetailPage, { global: { stubs } });
    await flushPromises();

    expect(mocks.getConsoleOrderContext).toHaveBeenCalledWith('job-1');
    expect(mocks.getBooking).toHaveBeenCalledWith('booking-console');
    expect(wrapper.find('[data-testid="booking-media-viewer"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('does not fetch or show private media for other roles', async () => {
    mocks.authStore.userRole = 'TECHNICIAN';
    const wrapper = mount(ConsoleOrderDetailPage, { global: { stubs } });
    await flushPromises();

    expect(mocks.getBooking).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="booking-media-viewer"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('clears private media when the authenticated role changes', async () => {
    mocks.getBooking.mockResolvedValueOnce(fullBooking('booking-console'));
    const wrapper = mount(ConsoleOrderDetailPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-media-viewer"]').exists()).toBe(true);

    mocks.authStore.userRole = 'TECHNICIAN';
    await flushPromises();

    expect(wrapper.find('[data-testid="booking-media-viewer"]').exists()).toBe(false);
    expect(mocks.getBooking).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it.each([
    ['missing bookingId', { ...consoleOrder(), bookingId: '' }, fullBooking()],
    ['failed full Booking GET', consoleOrder(), new Error('403')],
    ['preview-only Booking response', consoleOrder(), { ...fullBooking('booking-console'), media: undefined }],
  ])('does not render private media for %s', async (_label, context, bookingResponse) => {
    mocks.getConsoleOrderContext.mockResolvedValueOnce(context);
    mocks.getBooking.mockReset();
    if (bookingResponse instanceof Error) mocks.getBooking.mockRejectedValueOnce(bookingResponse);
    else mocks.getBooking.mockResolvedValueOnce(bookingResponse);
    const wrapper = mount(ConsoleOrderDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find('[data-testid="booking-media-viewer"]').exists()).toBe(false);
    if (!context.bookingId) expect(mocks.getBooking).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('ignores a late Booking response after console detail unmount', async () => {
    let resolveBooking!: (value: unknown) => void;
    mocks.getBooking.mockImplementationOnce(() => new Promise((resolve) => { resolveBooking = resolve; }));
    const wrapper = mount(ConsoleOrderDetailPage, { global: { stubs } });
    await flushPromises();
    wrapper.unmount();
    resolveBooking(fullBooking('booking-console'));
    await flushPromises();

    expect(document.body.querySelector('[data-testid="booking-media-viewer"]')).toBeNull();
  });
});
