// Lỗi 29 (PO 01/11/2026): địa chỉ lưu cần đủ toạ độ và chữ địa chỉ sạch. Form báo
// ngay cạnh ô và không gửi; câu chữ giống hệt backend. API, bản đồ và phiên đều mock.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import type { UserAddress } from '../src/api/profile.api';
import {
  ADDRESS_LOCATION_REQUIRED,
  addressFieldError,
  addressLocationError,
  normalizeAddressText,
} from '../src/utils/address-input';

const { getAddresses, createAddress, updateAddress, deleteAddress, autocomplete, reverse } = vi.hoisted(() => ({
  getAddresses: vi.fn(), createAddress: vi.fn(), updateAddress: vi.fn(), deleteAddress: vi.fn(),
  autocomplete: vi.fn(), reverse: vi.fn(),
}));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses, createAddress, updateAddress, deleteAddress } }));
vi.mock('../src/api/geo.api', () => ({ geoApi: { autocomplete, reverse } }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'mock-user', fullName: 'Mock customer', email: 'example.invalid' } }) }));
import CustomerProfilePage from '../src/pages/customer/CustomerProfilePage.vue';

const TEXT_MESSAGE = 'chỉ được chứa chữ, số, khoảng trắng và các dấu , . / - ( ) #, không chứa emoji, thẻ HTML hay ký tự đặc biệt.';

describe('address input rule mirrors the backend', () => {
  it.each([
    '12 Tân Trào, Tân Phú, Quận 7',
    'Số 5 (cạnh chợ Bến Thành)',
    'Hẻm 12/3B Lê Văn Sỹ',
    'Lô B-12, Tầng 3, #05-02',
    'Thôn Ỷ Lan, Xã Ứng Hòa',
  ])('accepts %s', (text) => {
    expect(addressFieldError('Địa chỉ cụ thể', text, { max: 255, required: true })).toBe('');
  });

  it.each([
    ['emoji', 'Nhà 🏠'],
    ['emoji ZWJ family', 'Nhà 👩‍👩‍👧‍👦'],
    ['flag', 'Nhà 🇻🇳'],
    ['keycap', 'Nhà 1️⃣'],
    ['zero width space', '12 Tân​Trào'],
    ['zero width joiner', '12 Tân‍Trào'],
    ['BOM', '﻿12 Tân Trào'],
    ['right to left mark', '12 Tân‏Trào'],
    ['right to left override', '12 Tân‮Trào'],
    ['NUL', '12\u0000 Tân Trào'],
    ['tab', '12\tTân Trào'],
    ['new line', '12 Tân\nTrào'],
    ['C1 control', '12 Tân\u0085Trào'],
    ['HTML img', '<img src=x onerror=alert(1)>'],
    ['script', "<script>alert('x')</script>"],
    ['only punctuation', '.,/-'],
  ])('refuses %s', (_name, text) => {
    expect(addressFieldError('Tên gợi nhớ', text, { max: 100 })).toBe(`Tên gợi nhớ ${TEXT_MESSAGE}`);
  });

  it('checks length after collapsing spaces and refuses a 2000 character payload', () => {
    expect(normalizeAddressText('  Nhà    riêng ')).toBe('Nhà riêng');
    expect(addressFieldError('Địa chỉ cụ thể', 'a'.repeat(255), { max: 255, required: true })).toBe('');
    expect(addressFieldError('Địa chỉ cụ thể', 'Nhà '.repeat(500), { max: 255, required: true })).toBe('Địa chỉ cụ thể tối đa 255 ký tự.');
    expect(addressFieldError('Địa chỉ cụ thể', '   ', { max: 255, required: true })).toBe('Địa chỉ cụ thể không được để trống.');
    expect(addressFieldError('Tên gợi nhớ', '', { max: 100 })).toBe('');
  });

  it('needs both coordinates in range', () => {
    expect(addressLocationError('', '')).toBe(ADDRESS_LOCATION_REQUIRED);
    expect(addressLocationError(10.7, '')).toBe(ADDRESS_LOCATION_REQUIRED);
    expect(addressLocationError(null, 106.7)).toBe(ADDRESS_LOCATION_REQUIRED);
    expect(addressLocationError(91, 106.7)).toBe('Vĩ độ phải là số từ -90 đến 90.');
    expect(addressLocationError(10.7, -181)).toBe('Kinh độ phải là số từ -180 đến 180.');
    expect(addressLocationError(10.7, 106.7)).toBe('');
  });
});

const MapStub = defineComponent({
  setup(_props, { expose }) {
    expose({ flyTo: vi.fn() });
    return () => h('div');
  },
});
const sel = {
  add: '[data-testid="add-saved-address"]',
  save: '[data-testid="save-saved-address"]',
  label: '[data-testid="saved-address-label"]',
  line1: '[data-testid="saved-address-line1"]',
  lat: '[data-testid="saved-address-lat"]',
  lng: '[data-testid="saved-address-lng"]',
  verify: '[data-testid="verify-saved-address-coordinates"]',
  labelError: '[data-testid="saved-address-label-error"]',
  line1Error: '[data-testid="saved-address-line1-error"]',
  locationError: '[data-testid="saved-address-location-error"]',
  formError: '[data-testid="saved-address-error"]',
};
const pinned: UserAddress = {
  id: 'pinned-id', userId: 'mock-user', label: 'Nhà', line1: '12 Tân Trào',
  ward: 'Phường Tân Phú', district: 'Quận 7', province: 'TP. Hồ Chí Minh', lat: 10.73, lng: 106.72, isDefault: true,
};
const legacy: UserAddress = { ...pinned, id: 'legacy-id', label: 'Nhà cũ', lat: null, lng: null, isDefault: false };

async function render() {
  const wrapper = mount(CustomerProfilePage, { global: { stubs: { MapTilerMap: MapStub, FhConfirmDialog: true } } });
  await flushPromises();
  return wrapper;
}
async function openAddWithPin(wrapper: Awaited<ReturnType<typeof render>>) {
  await wrapper.find(sel.add).trigger('click');
  await wrapper.find(sel.lat).setValue('10.73');
  await wrapper.find(sel.lng).setValue('106.72');
  await wrapper.find(sel.verify).trigger('click');
  await flushPromises();
}

beforeEach(() => {
  getAddresses.mockReset().mockResolvedValue([{ ...pinned }, { ...legacy }]);
  createAddress.mockReset(); updateAddress.mockReset(); deleteAddress.mockReset();
  autocomplete.mockReset().mockResolvedValue([]);
  reverse.mockReset().mockResolvedValue({ formattedAddress: '12 Tân Trào', ward: 'Phường Tân Phú', district: 'Quận 7', province: 'TP. Hồ Chí Minh' });
});

describe('saved address form shows the rule next to the field (bug 29)', () => {
  it('does not send a label with an emoji and says why under the label', async () => {
    const wrapper = await render();
    await openAddWithPin(wrapper);
    await wrapper.find(sel.label).setValue('Nhà 🏠');
    await wrapper.find(sel.save).trigger('click');
    await flushPromises();
    expect(createAddress).not.toHaveBeenCalled();
    expect(wrapper.find(sel.labelError).text()).toBe(`Tên gợi nhớ ${TEXT_MESSAGE}`);
    await wrapper.find(sel.label).setValue('Nhà riêng');
    expect(wrapper.find(sel.labelError).exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not send a street with markup or a zero width space', async () => {
    const wrapper = await render();
    await openAddWithPin(wrapper);
    for (const text of ['<img src=x onerror=alert(1)>', '12 Tân​Trào']) {
      await wrapper.find(sel.line1).setValue(text);
      await wrapper.find(sel.save).trigger('click');
      await flushPromises();
      expect(wrapper.find(sel.line1Error).text()).toBe(`Địa chỉ cụ thể ${TEXT_MESSAGE}`);
    }
    expect(createAddress).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not send an address without a pin', async () => {
    const wrapper = await render();
    await wrapper.find(sel.add).trigger('click');
    await wrapper.find(sel.line1).setValue('12 Tân Trào');
    // The area came from an earlier lookup, the pin was then cleared by hand.
    await openAddWithPin(wrapper);
    await wrapper.find(sel.lat).setValue('');
    await wrapper.find(sel.save).trigger('click');
    await flushPromises();
    expect(createAddress).not.toHaveBeenCalled();
    expect(wrapper.find(sel.locationError).text()).toBe(ADDRESS_LOCATION_REQUIRED);
    wrapper.unmount();
  });

  it('sends clean text with both coordinates', async () => {
    createAddress.mockResolvedValue({ ...pinned, id: 'new-id' });
    const wrapper = await render();
    await openAddWithPin(wrapper);
    await wrapper.find(sel.label).setValue('  Nhà   bố mẹ ');
    await wrapper.find(sel.save).trigger('click');
    await flushPromises();
    expect(createAddress).toHaveBeenCalledWith(expect.objectContaining({ label: 'Nhà bố mẹ', line1: '12 Tân Trào', lat: 10.73, lng: 106.72 }));
    wrapper.unmount();
  });

  it('shows the server refusal inside the form', async () => {
    createAddress.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { success: false, error: { code: 'VALIDATION_FAILED', message: 'Validation failed', details: [ADDRESS_LOCATION_REQUIRED] } } },
    });
    const wrapper = await render();
    await openAddWithPin(wrapper);
    await wrapper.find(sel.save).trigger('click');
    await flushPromises();
    expect(wrapper.find(sel.formError).text()).toBe(ADDRESS_LOCATION_REQUIRED);
    wrapper.unmount();
  });

  it('asks for a pin before renaming an old address saved without one', async () => {
    const wrapper = await render();
    await wrapper.find('[data-testid="edit-saved-address-legacy-id"]').trigger('click');
    await wrapper.find(sel.label).setValue('Nhà ông bà');
    await wrapper.find(sel.save).trigger('click');
    await flushPromises();
    expect(updateAddress).not.toHaveBeenCalled();
    expect(wrapper.find(sel.locationError).text()).toBe(ADDRESS_LOCATION_REQUIRED);
    wrapper.unmount();
  });

  it('still renames a pinned address without resending the location', async () => {
    updateAddress.mockResolvedValue({ ...pinned, label: 'Công ty' });
    const wrapper = await render();
    await wrapper.find('[data-testid="edit-saved-address-pinned-id"]').trigger('click');
    await wrapper.find(sel.label).setValue('Công ty');
    await wrapper.find(sel.save).trigger('click');
    await flushPromises();
    expect(updateAddress).toHaveBeenCalledWith('pinned-id', { label: 'Công ty', isDefault: true });
    wrapper.unmount();
  });
});
