import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import BookingDraftBanner from '../src/components/booking/BookingDraftBanner.vue';
import CustomerOrdersPage from '../src/pages/customer/CustomerOrdersPage.vue';
import { describeBookingDraft } from '../src/utils/booking-draft-summary';
import type { BookingDraft } from '../src/api/booking-drafts.api';

const { mockGet, mockPost, mockDelete, mockPush, mockToast } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
  mockPush: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/api/client', () => ({
  default: { get: mockGet, post: mockPost, delete: mockDelete },
  AUTH_SESSION_INVALIDATED_EVENT: 'fixhome:auth-session-invalidated',
  registerTokenRefreshed: vi.fn(),
  registerAuthSessionInvalidator: vi.fn(),
  getHttpStatus: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({
    conversations: [],
    openConversationForBooking: vi.fn().mockResolvedValue(null),
    selectConversation: vi.fn(),
    toggleWidget: vi.fn(),
  }),
}));

vi.mock('vue-sonner', () => ({
  toast: mockToast,
}));

const sampleDraft: BookingDraft = {
  id: 'draft-1',
  version: 2,
  expiresAt: '2026-12-20T10:00:00.000Z',
  snapshot: {
    kind: 'visit_group',
    savedDeviceCount: 2,
    items: [{ serviceId: 's1' }, { serviceId: 's2' }],
  },
};

describe('BookingDraftBanner & draft visibility on CustomerOrdersPage', () => {
  const mounted: Array<{ unmount: () => void }> = [];

  beforeEach(() => {
    setActivePinia(createPinia());
    mockGet.mockReset();
    mockPost.mockReset();
    mockDelete.mockReset();
    mockPush.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    document.body.replaceChildren();
  });

  afterEach(() => {
    for (const w of mounted.splice(0)) w.unmount();
    document.body.replaceChildren();
  });

  it('describes single and visit-group drafts clearly', () => {
    expect(describeBookingDraft(sampleDraft)).toBe('Lượt nhiều thiết bị · 2 thiết bị');
    expect(
      describeBookingDraft({ ...sampleDraft, snapshot: { kind: 'booking', quantity: 3 } }),
    ).toBe('Đơn đặt 1 thiết bị (số lượng 3)');
  });

  it('shows the active draft card on CustomerOrdersPage with both Tiếp tục đặt and Huỷ bản nháp actions', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/booking-drafts/current') return { data: { data: sampleDraft } };
      return { data: { data: [], meta: { total: 0, page: 1, pageSize: 10 } } };
    });
    mockDelete.mockResolvedValue({ data: { data: { deleted: true } } });

    const wrapper = mount(CustomerOrdersPage, {
      global: {
        stubs: {
          FhButton: false,
          FhMoney: true,
          RebookDialog: true,
          'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
        },
      },
      attachTo: document.body,
    });
    mounted.push(wrapper);
    await flushPromises();

    const banner = wrapper.get('[data-testid="saved-booking-draft-card"]');
    expect(banner.text()).toContain('Đang lưu nháp');
    expect(banner.text()).toContain('Lượt nhiều thiết bị · 2 thiết bị');

    await wrapper.get('[data-testid="saved-draft-resume"]').trigger('click');
    expect(mockPush).toHaveBeenCalledWith({ path: '/app/bookings/new', query: { resumeDraft: '1' } });

    await wrapper.get('[data-testid="saved-draft-discard"]').trigger('click');
    await flushPromises();
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Huỷ bản nháp' && !!b.closest('[role="dialog"]'),
    );
    expect(confirmBtn).toBeDefined();
    confirmBtn!.click();
    await flushPromises();

    expect(mockDelete).toHaveBeenCalledWith('/booking-drafts/current');
    expect(wrapper.find('[data-testid="saved-booking-draft-card"]').exists()).toBe(false);
    expect(mockToast.success).toHaveBeenCalledWith('Đã huỷ bản nháp.');
  });

  it('emits resume and discard from BookingDraftBanner after dialog confirmation', async () => {
    const wrapper = mount(BookingDraftBanner, {
      props: { draft: sampleDraft },
      attachTo: document.body,
    });
    mounted.push(wrapper);

    await wrapper.get('[data-testid="saved-draft-resume"]').trigger('click');
    expect(wrapper.emitted('resume')).toHaveLength(1);

    await wrapper.get('[data-testid="saved-draft-discard"]').trigger('click');
    await flushPromises();
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Huỷ bản nháp' && !!b.closest('[role="dialog"]'),
    );
    confirmBtn!.click();
    await flushPromises();
    expect(wrapper.emitted('discard')).toHaveLength(1);
  });
});
