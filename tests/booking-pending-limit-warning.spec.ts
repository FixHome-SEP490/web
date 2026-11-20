import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const {
  createBooking,
  getService,
  getCategories,
  getAddresses,
  visitContact,
  createVisit,
  currentDraft,
  saveDraft,
  discardDraft,
  submitDraft,
  push,
  route,
} = vi.hoisted(() => ({
  createBooking: vi.fn(),
  getService: vi.fn(),
  getCategories: vi.fn(),
  getAddresses: vi.fn(),
  visitContact: vi.fn(),
  createVisit: vi.fn(),
  currentDraft: vi.fn(),
  saveDraft: vi.fn(),
  discardDraft: vi.fn(),
  submitDraft: vi.fn(),
  push: vi.fn(),
  route: { query: {} as Record<string, string>, meta: {} as Record<string, unknown> },
}));

vi.mock('../src/api/media.api', () => ({
  ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_MEDIA_SIZE_BYTES: 10 * 1024 * 1024,
  mediaApi: { uploadBookingPhoto: vi.fn() },
}));
vi.mock('../src/api/bookings.api', () => ({
  bookingsApi: { createBooking },
}));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getCategories, getService } }));
vi.mock('../src/api/catalog-pricing.api', () => ({
  catalogPricingApi: { getPreview: vi.fn().mockRejectedValue(Object.assign(new Error('not found'), { response: { status: 404 } })) },
  isCatalogV2PricingUnavailableError: () => true,
}));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses } }));
vi.mock('../src/api/visit-groups.api', () => ({
  VISIT_DEVICE_LIMIT: 5,
  visitGroupsApi: { contact: visitContact, create: createVisit, consultation: vi.fn() },
}));
vi.mock('../src/api/booking-drafts.api', () => ({
  bookingDraftsApi: { current: currentDraft, save: saveDraft, discard: discardDraft, submit: submitDraft },
}));
vi.mock('../src/stores/auth.store', () => ({ useAuthStore: () => ({ user: { id: 'customer-1' } }) }));
vi.mock('../src/utils/image-for-ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/image-for-ai')>();
  return { ...actual, normalizeForUpload: vi.fn(async (file: File) => file) };
});
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, back: vi.fn(), replace: vi.fn(), go: vi.fn() }),
  useRoute: () => route,
}));

import NewBookingWizardPage from '../src/pages/customer/NewBookingWizardPage.vue';

const ActionButton = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          disabled: props.disabled || props.loading,
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default?.(),
      );
  },
});

const SlotStub = defineComponent({ setup(_, { slots }) { return () => h('span', slots.default?.()); } });
const MoneyStub = defineComponent({
  props: { amount: { type: [Number, String], default: null } },
  setup(props) {
    return () => h('span', { 'data-money': String(props.amount ?? '') });
  },
});

const stubs = {
  FhButton: ActionButton,
  FhMoney: MoneyStub,
  FhDatePicker: SlotStub,
  FhTimeScrollPicker: SlotStub,
  RouterLink: true,
  'router-link': true,
  teleport: true,
};

const sampleCategories = [
  {
    id: 'cat-1',
    name: 'Điện lạnh',
    code: 'dien_lanh',
    services: [
      {
        id: 'svc-1',
        name: 'Vệ sinh máy lạnh',
        pricingMode: 'fixed_price',
        fixedPrice: 200000,
        basePrice: 200000,
        unit: 'máy',
        estimatedMinutes: 45,
        isActive: true,
        category: { id: 'cat-1', name: 'Điện lạnh', code: 'dien_lanh' },
      },
    ],
  },
];

const sampleAddresses = [
  {
    id: 'addr-1',
    label: 'Nhà riêng',
    street: '123 Nguyễn Huệ',
    ward: 'Bến Nghé',
    district: 'Quận 1',
    city: 'Hồ Chí Minh',
    isDefault: true,
  },
];

describe('NewBookingWizardPage - PENDING_VISIT_LIMIT_REACHED', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    getCategories.mockResolvedValue(sampleCategories);
    getService.mockResolvedValue(sampleCategories[0].services[0]);
    getAddresses.mockResolvedValue(sampleAddresses);
    visitContact.mockResolvedValue({ enabled: false, deviceLimit: 3, hotline: null });
    currentDraft.mockResolvedValue(null);
    saveDraft.mockResolvedValue({ id: 'draft-1', version: 1, expiresAt: '2026-11-21T00:00:00Z', snapshot: {} });
  });

  it('displays Warning Banner instead of toast when backend returns PENDING_VISIT_LIMIT_REACHED', async () => {
    const quotaError = Object.assign(new Error('Quota exceeded'), {
      response: {
        status: 409,
        data: {
          error: {
            code: 'PENDING_VISIT_LIMIT_REACHED',
            message: 'Bạn đang có hai lượt sửa chữa chờ kỹ thuật viên nhận. Vui lòng chờ hoặc hủy một yêu cầu trước khi tiếp tục.',
            details: { limit: 2, remaining: 0 },
          },
        },
      },
    });
    createBooking.mockRejectedValue(quotaError);
    submitDraft.mockRejectedValue(quotaError);

    const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
    await flushPromises();

    // Select service via service card
    const serviceCards = wrapper.findAll('[data-testid="booking-service-card"]');
    expect(serviceCards.length).toBeGreaterThan(0);
    await serviceCards[0].trigger('click');
    await flushPromises();

    // Step 1 -> Step 2
    await wrapper.find('[data-testid="step1-next"]').trigger('click');
    await flushPromises();

    // Select urgent mode on Step 2
    await wrapper.find('[data-testid="mode-urgent"]').trigger('click');
    await flushPromises();

    // Step 2 -> Step 4
    await wrapper.find('[data-testid="step2-next"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Kiểm tra lần cuối');

    // Submit booking
    const submitBtn = wrapper.find('[data-testid="booking-submit"]');
    expect(submitBtn.exists()).toBe(true);
    await submitBtn.trigger('click');
    await flushPromises();

    // Verify warning banner is displayed
    const banner = wrapper.find('[data-testid="booking-pending-limit-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.find('[data-testid="banner-title"]').text()).toBe('Bạn đã đạt giới hạn yêu cầu đang chờ');
    expect(banner.find('[data-testid="banner-description"]').text()).toContain('chờ kỹ thuật viên nhận');

    // Test "Để sau" button
    const secondaryBtn = banner.find('[data-testid="banner-secondary-cta"]');
    expect(secondaryBtn.text()).toBe('Để sau');
    await secondaryBtn.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-pending-limit-banner"]').exists()).toBe(false);

    // Re-trigger limit and test "Xem yêu cầu đang chờ" button
    await submitBtn.trigger('click');
    await flushPromises();
    const banner2 = wrapper.find('[data-testid="booking-pending-limit-banner"]');
    expect(banner2.exists()).toBe(true);

    const primaryBtn = banner2.find('[data-testid="banner-primary-cta"]');
    expect(primaryBtn.text()).toContain('Xem yêu cầu đang chờ');
    await primaryBtn.trigger('click');
    await flushPromises();

    // Verify navigation to /app/orders?filter=pending and draft was quietly saved
    expect(push).toHaveBeenCalledWith('/app/orders?filter=pending');
    expect(saveDraft).toHaveBeenCalled();
  });
});
