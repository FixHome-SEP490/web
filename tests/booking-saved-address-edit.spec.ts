// WEB-H03: saved-address edit must not mutate historical Booking snapshots.
// All APIs, map and session are mocked; no live customer address or database access.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import type { UserAddress } from '../src/api/profile.api';

const { getAddresses, createAddress, updateAddress, deleteAddress, autocomplete, reverse, alertSpy } = vi.hoisted(() => ({
  getAddresses: vi.fn(), createAddress: vi.fn(), updateAddress: vi.fn(), deleteAddress: vi.fn(),
  autocomplete: vi.fn(), reverse: vi.fn(), alertSpy: vi.fn(),
}));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses, createAddress, updateAddress, deleteAddress } }));
vi.mock('../src/api/geo.api', () => ({ geoApi: { autocomplete, reverse } }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'mock-user', fullName: 'Mock customer', email: 'example.invalid' } }) }));
import CustomerProfilePage from '../src/pages/customer/CustomerProfilePage.vue';

const oldAddress: UserAddress = {
  id: 'address-owned-id', userId: 'mock-user', label: 'Nhà', line1: '12 Old Street',
  ward: 'Phường 1', district: 'Quận 1', province: 'TP. Hồ Chí Minh',
  lat: 10.775, lng: 106.701, isDefault: true,
};
const edit = '[data-testid="edit-saved-address-address-owned-id"]';
const modal = '[data-testid="saved-address-modal"]';
const save = '[data-testid="save-saved-address"]';
const addressError = '[data-testid="saved-address-error"]';
const labelInput = '[data-testid="saved-address-label"]';
const streetInput = '[data-testid="saved-address-line1"]';
const latitudeInput = '[data-testid="saved-address-lat"]';
const longitudeInput = '[data-testid="saved-address-lng"]';

const MapStub = defineComponent({
  setup(_props, { expose }) {
    expose({ flyTo: vi.fn() });
    return () => h('div');
  },
});

async function render() {
  const wrapper = mount(CustomerProfilePage, {
    global: { stubs: { MapTilerMap: MapStub, FhConfirmDialog: true }, },
  });
  await flushPromises();
  return wrapper;
}
async function openEdit(wrapper: Awaited<ReturnType<typeof render>>) {
  await wrapper.find(edit).trigger('click');
  expect(wrapper.find(modal).exists()).toBe(true);
}

beforeEach(() => {
  getAddresses.mockReset().mockResolvedValue([{ ...oldAddress }]);
  createAddress.mockReset(); updateAddress.mockReset(); deleteAddress.mockReset();
  autocomplete.mockReset().mockResolvedValue([]);
  reverse.mockReset().mockResolvedValue({ formattedAddress: '34 New Street', ward: 'Phường 1', district: 'Quận 1', province: 'TP. Hồ Chí Minh' });
  alertSpy.mockReset(); vi.stubGlobal('alert', alertSpy);
});

describe('WEB-H03 saved address edit', () => {
  it('opens edit with the exact saved address text and original map coordinates', async () => {
    const wrapper = await render();
    await openEdit(wrapper);
    expect((wrapper.find(labelInput).element as HTMLInputElement).value).toBe('Nhà');
    expect((wrapper.find(streetInput).element as HTMLInputElement).value).toBe('12 Old Street');
    expect((wrapper.find(latitudeInput).element as HTMLInputElement).value).toBe('10.775');
    expect((wrapper.find(longitudeInput).element as HTMLInputElement).value).toBe('106.701');
    wrapper.unmount();
  });

  it('updates a label/default-only edit by exact owned ID without sending stale location data', async () => {
    updateAddress.mockResolvedValue({ ...oldAddress, label: 'Văn phòng', isDefault: false });
    const wrapper = await render();
    await openEdit(wrapper);
    await wrapper.find(labelInput).setValue('Văn phòng');
    await wrapper.find('[data-testid="saved-address-default"]').setValue(false);
    await wrapper.find(save).trigger('click');
    await flushPromises();
    expect(updateAddress).toHaveBeenCalledTimes(1);
    expect(updateAddress).toHaveBeenCalledWith('address-owned-id', { label: 'Văn phòng', isDefault: false });
    expect(createAddress).not.toHaveBeenCalled();
    expect(wrapper.find(modal).exists()).toBe(false);
    wrapper.unmount();
  });

  it('rejects a typed street change that still has the old pin', async () => {
    const wrapper = await render();
    await openEdit(wrapper);
    await wrapper.find(streetInput).setValue('34 New Street');
    await wrapper.find(save).trigger('click');
    await flushPromises();
    expect(updateAddress).not.toHaveBeenCalled();
    expect(wrapper.find(addressError).text()).toContain('vị trí');
    expect(wrapper.find(modal).exists()).toBe(true);
    wrapper.unmount();
  });

  it('saves a moved street only after coordinate lookup verifies the same district/province', async () => {
    updateAddress.mockResolvedValue({ ...oldAddress, line1: '34 New Street', lat: 10.776, lng: 106.702 });
    const wrapper = await render();
    await openEdit(wrapper);
    await wrapper.find(streetInput).setValue('34 New Street');
    await wrapper.find(latitudeInput).setValue('10.776');
    await wrapper.find(longitudeInput).setValue('106.702');
    await wrapper.find('[data-testid="verify-saved-address-coordinates"]').trigger('click');
    await flushPromises();
    await wrapper.find(save).trigger('click');
    await flushPromises();
    expect(reverse).toHaveBeenCalledWith(10.776, 106.702);
    expect(updateAddress).toHaveBeenCalledWith('address-owned-id', expect.objectContaining({
      line1: '34 New Street', district: 'Quận 1', province: 'TP. Hồ Chí Minh', lat: 10.776, lng: 106.702,
    }));
    expect(createAddress).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('rejects moving to a different administrative area instead of retaining old codes', async () => {
    reverse.mockResolvedValue({ formattedAddress: '8 Different Street', ward: 'Phường 2', district: 'Quận 3', province: 'TP. Hồ Chí Minh' });
    const wrapper = await render();
    await openEdit(wrapper);
    await wrapper.find(streetInput).setValue('8 Different Street');
    await wrapper.find(latitudeInput).setValue('10.79');
    await wrapper.find(longitudeInput).setValue('106.68');
    await wrapper.find('[data-testid="verify-saved-address-coordinates"]').trigger('click');
    await flushPromises();
    await wrapper.find(save).trigger('click');
    expect(updateAddress).not.toHaveBeenCalled();
    expect(wrapper.find(addressError).text()).toContain('khu vực');
    wrapper.unmount();
  });

  it('resets edit state on cancel before opening add-new; create never PATCHes old ID', async () => {
    const wrapper = await render();
    await openEdit(wrapper);
    await wrapper.find(labelInput).setValue('Stale edit');
    await wrapper.find('[data-testid="cancel-saved-address"]').trigger('click');
    await wrapper.find('[data-testid="add-saved-address"]').trigger('click');
    expect((wrapper.find(streetInput).element as HTMLInputElement).value).toBe('');
    expect((wrapper.find(latitudeInput).element as HTMLInputElement).value).toBe('');
    expect(wrapper.find(modal).text()).toContain('Thêm');
    expect(updateAddress).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('creates a brand-new address after switching from edit mode, without patching the old ID', async () => {
    createAddress.mockResolvedValue({ ...oldAddress, id: 'new-address-id', line1: '34 New Street' });
    const wrapper = await render();
    await openEdit(wrapper);
    await wrapper.find('[data-testid="cancel-saved-address"]').trigger('click');
    await wrapper.find('[data-testid="add-saved-address"]').trigger('click');
    await wrapper.find(streetInput).setValue('34 New Street');
    await wrapper.find(latitudeInput).setValue('10.776');
    await wrapper.find(longitudeInput).setValue('106.702');
    await wrapper.find('[data-testid="verify-saved-address-coordinates"]').trigger('click');
    await flushPromises();
    await wrapper.find(save).trigger('click');
    await flushPromises();
    expect(createAddress).toHaveBeenCalledTimes(1);
    expect(createAddress).toHaveBeenCalledWith(expect.objectContaining({
      line1: '34 New Street', lat: 10.776, lng: 106.702, province: 'TP. Hồ Chí Minh',
    }));
    expect(updateAddress).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('ignores late geocoder responses after the user types a newer street', async () => {
    let release!: (location: { formattedAddress: string; ward: string; district: string; province: string }) => void;
    reverse.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const wrapper = await render();
    await openEdit(wrapper);
    await wrapper.find(streetInput).setValue('34 New Street');
    await wrapper.find(latitudeInput).setValue('10.776');
    await wrapper.find(longitudeInput).setValue('106.702');
    await wrapper.find('[data-testid="verify-saved-address-coordinates"]').trigger('click');
    await wrapper.find(streetInput).setValue('46 Newer Street');
    release({ formattedAddress: '34 New Street', ward: 'Phường 1', district: 'Quận 1', province: 'TP. Hồ Chí Minh' });
    await flushPromises();
    expect((wrapper.find(streetInput).element as HTMLInputElement).value).toBe('46 Newer Street');
    await wrapper.find(save).trigger('click');
    expect(updateAddress).not.toHaveBeenCalled();
    expect(wrapper.find(addressError).text()).toContain('vị trí');
    wrapper.unmount();
  });

  it('keeps server-confirmed updated address visible when list refresh fails after PATCH', async () => {
    getAddresses.mockReset().mockResolvedValueOnce([{ ...oldAddress }]).mockRejectedValueOnce(new Error('temporary list failure'));
    updateAddress.mockResolvedValue({ ...oldAddress, label: 'Saved label' });
    const wrapper = await render();
    await openEdit(wrapper);
    await wrapper.find(labelInput).setValue('Saved label');
    await wrapper.find(save).trigger('click');
    await flushPromises();
    expect(updateAddress).toHaveBeenCalledTimes(1);
    expect(wrapper.find(modal).exists()).toBe(false);
    expect(wrapper.text()).toContain('Saved label');
    wrapper.unmount();
  });
  it('keeps edit modal and error on failed PATCH, supports retry and prevents duplicate save while pending', async () => {
    let release!: (value: UserAddress) => void;
    updateAddress.mockRejectedValueOnce(new Error('private backend detail'))
      .mockImplementationOnce(() => new Promise<UserAddress>(resolve => { release = resolve; }));
    const wrapper = await render();
    await openEdit(wrapper);
    await wrapper.find(labelInput).setValue('Updated label');
    await wrapper.find(save).trigger('click');
    await flushPromises();
    expect(wrapper.find(modal).exists()).toBe(true);
    expect(wrapper.find(addressError).exists()).toBe(true);
    expect(wrapper.text()).not.toContain('private backend detail');
    await wrapper.find(save).trigger('click');
    await wrapper.find(save).trigger('click');
    expect(updateAddress).toHaveBeenCalledTimes(2);
    release({ ...oldAddress, label: 'Updated label' });
    await flushPromises();
    expect(wrapper.find(modal).exists()).toBe(false);
    wrapper.unmount();
  });
});