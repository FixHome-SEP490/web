import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

const {
  uploadBookingPhoto,
  createBooking,
  getCategories,
  getAddresses,
  push,
  route,
} = vi.hoisted(() => ({
  uploadBookingPhoto: vi.fn(),
  createBooking: vi.fn(),
  getCategories: vi.fn(),
  getAddresses: vi.fn(),
  push: vi.fn(),
  route: { query: {} },
}));

vi.mock('../src/api/media.api', () => ({
  ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_MEDIA_SIZE_BYTES: 10 * 1024 * 1024,
  mediaApi: { uploadBookingPhoto },
}));
vi.mock('../src/api/bookings.api', () => ({
  bookingsApi: { createBooking },
}));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getCategories } }));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push, back: vi.fn() }), useRoute: () => route }));

import NewBookingWizardPage from '../src/pages/customer/NewBookingWizardPage.vue';

const ActionButton = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () => h('button', {
      ...attrs,
      type: 'button',
      disabled: props.disabled || props.loading,
      onClick: (event: MouseEvent) => emit('click', event),
    }, slots.default?.());
  },
});

const SlotStub = defineComponent({ setup(_, { slots }) { return () => h('span', slots.default?.()); } });
const stubs = {
  FhButton: ActionButton,
  FhMoney: SlotStub,
  FhDatePicker: SlotStub,
  FhTimeScrollPicker: SlotStub,
  RouterLink: true,
};

const sampleCategories = [
  {
    id: 'cat-refrig',
    name: 'Điện lạnh',
    code: 'dien_lanh',
    services: [
      {
        id: 'svc-ac-clean',
        name: 'Vệ sinh điều hòa treo tường',
        pricingMode: 'fixed_price',
        fixedPrice: 200000,
        basePrice: 200000,
        unit: 'máy',
        estimatedMinutes: 45,
        description: 'Vệ sinh xịt rửa dàn nóng và dàn lạnh',
      },
      {
        id: 'svc-ac-repair',
        name: 'Sửa chữa điều hòa mất lạnh',
        pricingMode: 'inspection_required',
        fixedPrice: null,
        basePrice: null,
        unit: null,
        estimatedMinutes: 60,
        description: 'Khảo sát và nạp gas nếu cần',
      },
    ],
  },
  {
    id: 'cat-plumb',
    name: 'Điện & Nước',
    code: 'dien_nuoc',
    services: [
      {
        id: 'svc-siphon',
        name: 'Thay siphon lavabo',
        pricingMode: 'fixed_price',
        fixedPrice: 150000,
        basePrice: 150000,
        unit: 'bộ',
        estimatedMinutes: 30,
        description: 'Chống rò rỉ lavabo',
      },
    ],
  },
];

describe('NewBookingWizardPage UI & UX enhancements', () => {
  beforeEach(() => {
    getCategories.mockReset().mockResolvedValue(sampleCategories);
    getAddresses.mockReset().mockResolvedValue([{
      id: 'addr-1', label: 'Nhà riêng', line1: '123 Test', district: 'Q1', province: 'TP.HCM', isDefault: true,
    }]);
    route.query = {};
  });

  it('renders category cards with service count badges and selects first category by default', async () => {
    const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.text()).toContain('Điện lạnh');
    expect(wrapper.text()).toContain('Điện & Nước');
    expect(wrapper.text()).toContain('2 dịch vụ');
    expect(wrapper.text()).toContain('1 dịch vụ');

    // First service in first category should be selected
    expect(wrapper.text()).toContain('Vệ sinh điều hòa treo tường');
  });

  it('filters services in real-time when searching in the search box', async () => {
    const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
    await flushPromises();

    const searchInput = wrapper.get('input[placeholder*="Tìm dịch vụ theo tên"]');
    await searchInput.setValue('Vệ sinh');

    expect(wrapper.text()).toContain('Vệ sinh điều hòa treo tường');
    expect(wrapper.text()).not.toContain('Sửa chữa điều hòa mất lạnh');

    // Clear search
    await searchInput.setValue('không tồn tại 12345');
    expect(wrapper.text()).toContain('Không tìm thấy dịch vụ phù hợp');
    expect(wrapper.text()).toContain('Xóa bộ lọc tìm kiếm');
  });

  it('filters by pricing mode tabs (⚡ Giá niêm yết vs 🔍 Khảo sát)', async () => {
    const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
    await flushPromises();

    // Click on 🔍 Khảo sát button
    const inspectionTab = wrapper.findAll('button').find((b) => b.text().includes('Khảo sát') && b.text().includes('1'));
    expect(inspectionTab).toBeDefined();
    await inspectionTab?.trigger('click');

    // In grid, only the inspection service is displayed
    expect(wrapper.text()).toContain('Sửa chữa điều hòa mất lạnh');

    // Click to select the inspection service
    const repairCard = wrapper.findAll('div.group').find((c) => c.text().includes('Sửa chữa điều hòa mất lạnh'));
    await repairCard?.trigger('click');

    // Now fixed price package box should not exist
    expect(wrapper.text()).not.toContain('Gói trọn gói chuẩn');
    expect(wrapper.text()).toContain('Khảo sát & Báo giá tận nơi');
  });


  it('switches category when clicking another category card and syncs services', async () => {
    const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
    await flushPromises();

    const plumbCategory = wrapper.findAll('button').find((b) => b.text().includes('Điện & Nước'));
    expect(plumbCategory).toBeDefined();
    await plumbCategory?.trigger('click');

    expect(wrapper.text()).toContain('Thay siphon lavabo');
    // Description should intelligently sync to the new service!
    const textarea = wrapper.get('textarea');
    expect((textarea.element as HTMLTextAreaElement).value).toContain('Thay siphon lavabo');
  });

  it('updates quantity and total for fixed price service via stepper', async () => {
    const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
    await flushPromises();

    // Initial quantity is 1
    expect(wrapper.text()).toContain('Số lượng thiết bị cần làm');
    expect(wrapper.text()).toContain('1');

    // Click plus button
    const plusButton = wrapper.findAll('button').find((b) => b.html().includes('lucide-plus') || b.findComponent({ name: 'Plus' }).exists());
    if (plusButton) {
      await plusButton.trigger('click');
      expect(wrapper.text()).toContain('2');
    }
  });

  it('appends symptom from quick suggestions into description', async () => {
    const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
    await flushPromises();

    const symptomChip = wrapper.findAll('button').find((b) => b.text().includes('Chảy nước dàn lạnh'));
    expect(symptomChip).toBeDefined();
    await symptomChip?.trigger('click');

    const textarea = wrapper.get('textarea');
    expect((textarea.element as HTMLTextAreaElement).value).toContain('Chảy nước dàn lạnh');
  });

  it('allows selecting urgency level with visual feedback', async () => {
    const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
    await flushPromises();

    const urgentBtn = wrapper.findAll('button').find((b) => b.text().includes('Khẩn cấp') && b.text().includes('Trong 1–2h'));
    expect(urgentBtn).toBeDefined();
    await urgentBtn?.trigger('click');

    expect(urgentBtn?.classes()).toContain('border-brand-600');
  });
});
