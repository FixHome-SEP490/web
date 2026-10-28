import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';

const mocks = vi.hoisted(() => ({ readDraft: vi.fn(), confirm: vi.fn() }));
vi.mock('../src/api/interruption-rebook.api', () => ({ interruptionRebookApi: mocks }));
import InterruptionRebookForm from '../src/components/customer/InterruptionRebookForm.vue';

enableAutoUnmount(afterEach);
const ids = {
  booking: '11111111-1111-4111-8111-111111111111',
  case: '44444444-4444-4444-8444-444444444444',
  address: '66666666-6666-4666-8666-666666666666',
};
const draft = {
  anchorBookingId: ids.booking, sourceVisitGroupId: null, targetKind: 'booking', addressId: ids.address,
  addressText: 'Địa chỉ cũ', customerNote: 'Không tự mang ghi chú cũ', addresses: [
    { id: ids.address, userId: 'customer', line1: 'Nhà', district: 'D', province: 'P', isDefault: true },
  ],
  items: [{
    sourceBookingId: ids.booking, sourceOrderId: 'order', sourceCaseId: ids.case, serviceId: 'service',
    serviceName: 'Điều hòa', deviceLabel: 'Điều hòa', selectedVariantCode: null, description: 'Mô tả ban đầu',
    deviceAttributes: { brand: 'A' }, previousTechnicianId: 'old-tech',
    pricing: { serviceId: 'service', serviceCode: 'AC', status: 'FIXED_PRICE', bindingReady: true,
      selectedVariant: null, possibleVariants: [{ variantId: 'v', variantCode: 'AC-01-01', scopeVi: 'Vệ sinh', laborPriceVnd: 200000 }],
      missingAttributes: [], priceRange: null, messageVi: '' },
  }],
};
const mountForm = () => mount(InterruptionRebookForm, {
  props: { sourceBookingId: ids.booking, customerId: 'customer' },
  global: {
    stubs: {
      FhButton: { props: ['disabled', 'loading', 'variant', 'size'], emits: ['click'], template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
      FhSkeleton: true,
      BookingSessionPicker: {
        props: ['modelValue', 'sessions'], emits: ['update:modelValue'],
        template: '<button data-testid="choose-new-session" @click="$emit(\'update:modelValue\', { date: \'2090-01-02\', slot: \'morning\' })">Chọn lịch mới</button>',
      },
    },
  },
});

describe('InterruptionRebookForm', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readDraft.mockResolvedValue(draft);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('retries draft load, then confirms and emits the created booking after the retry generation', async () => {
    mocks.readDraft.mockRejectedValueOnce(new Error('temporary read failure')).mockResolvedValueOnce(draft);
    mocks.confirm.mockResolvedValueOnce({ kind: 'booking', id: 'new-booking' });
    vi.stubGlobal('crypto', { randomUUID: () => 'stable-key-001' });
    const wrapper = mountForm();
    await flushPromises();
    expect(mocks.readDraft).toHaveBeenCalledTimes(1);
    await wrapper.get('[data-testid="interruption-rebook-retry-load"]').trigger('click');
    await flushPromises();
    expect(mocks.readDraft).toHaveBeenCalledTimes(2);
    await wrapper.get('[data-testid="interruption-variant-0"]').setValue('AC-01-01');
    await wrapper.get('[data-testid="choose-new-session"]').trigger('click');
    await wrapper.get('[data-testid="interruption-reprice-consent"]').setValue(true);
    await wrapper.get('[data-testid="interruption-rebook-confirm"]').trigger('click');
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('created')?.[0]?.[0]).toEqual({ kind: 'booking', id: 'new-booking' });
  });

  it('retries uncertain POST with the exact customer intent and same idempotency key', async () => {
    mocks.readDraft.mockResolvedValueOnce(draft);
    mocks.confirm.mockRejectedValueOnce(new Error('network timeout')).mockResolvedValueOnce({ kind: 'booking', id: 'new-booking' });
    vi.stubGlobal('crypto', { randomUUID: () => 'stable-key-002' });
    const wrapper = mountForm();
    await flushPromises();
    await wrapper.get('[data-testid="interruption-variant-0"]').setValue('AC-01-01');
    await wrapper.get('[data-testid="choose-new-session"]').trigger('click');
    await wrapper.get('[data-testid="interruption-reprice-consent"]').setValue(true);
    await wrapper.get('[data-testid="interruption-rebook-confirm"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="interruption-rebook-retry-confirm"]').trigger('click');
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledTimes(2);
    expect(mocks.confirm.mock.calls[1]).toEqual(mocks.confirm.mock.calls[0]);
    expect(mocks.confirm.mock.calls[0]?.[2]).toMatchObject({
      idempotencyKey: 'stable-key-002', addressId: ids.address, date: '2090-01-02', slot: 'morning',
      items: [{ sourceBookingId: ids.booking, sourceCaseId: ids.case, selectedVariantCode: 'AC-01-01' }],
    });
    expect(mocks.confirm.mock.calls[0]?.[2].items[0]).not.toHaveProperty('previousTechnicianId');
    expect(mocks.confirm.mock.calls[0]?.[2].items[0]).not.toHaveProperty('photoUploadIds');
    expect(mocks.confirm.mock.calls[0]?.[2]).not.toHaveProperty('voucher');
    expect(wrapper.emitted('created')?.[0]?.[0]).toEqual({ kind: 'booking', id: 'new-booking' });
  });
});
