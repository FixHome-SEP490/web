// The service details dialog on its own: a real modal for keyboard and screen
// reader users. It names itself, moves focus inside, keeps Tab trapped, closes
// on Escape and on the backdrop, and hands focus back to whatever opened it.
// Nothing here selects a service by itself: only `confirm` is emitted.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';

import ServiceDetailsDialog from '../src/components/booking/ServiceDetailsDialog.vue';
import type { BookingCatalogService } from '../src/components/booking/booking-service-catalog';

const MoneyStub = defineComponent({
  props: { amount: { type: [Number, String], default: null } },
  setup(props) {
    return () => h('span', { 'data-money': String(props.amount ?? '') });
  },
});

const service: BookingCatalogService = {
  id: 'svc-ac-clean',
  categoryId: 'cat-refrig',
  categoryName: 'Điện lạnh',
  name: 'Vệ sinh điều hòa treo tường',
  pricingMode: 'fixed_price',
  fixedPrice: 200000,
  unit: 'máy',
  estimatedMinutes: 45,
  description: 'Vệ sinh xịt rửa dàn nóng và dàn lạnh',
  scopeDescription: 'Tháo và vệ sinh dàn lạnh tại nhà',
};

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ServiceDetailsDialog, {
    props: { open: true, service, ...props },
    global: { stubs: { teleport: true, FhMoney: MoneyStub } },
    attachTo: document.body,
  });
}

const panel = (wrapper: VueWrapper) => wrapper.get('[data-testid="booking-service-details-dialog"]');
const confirmButton = (wrapper: VueWrapper) => wrapper.get('[data-testid="booking-service-details-confirm"]');
const closeButton = (wrapper: VueWrapper) => wrapper.get('[data-testid="booking-service-details-close"]');

let wrappers: VueWrapper[] = [];
function track(wrapper: VueWrapper) {
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  wrappers = [];
  document.body.style.overflow = '';
});

describe('ServiceDetailsDialog', () => {
  it('renders nothing at all while closed', () => {
    const wrapper = track(mountDialog({ open: false }));
    expect(wrapper.find('[data-testid="booking-service-details-dialog"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Vệ sinh xịt rửa dàn nóng');
  });

  it('is a modal dialog that names itself and shows the full scope and price', () => {
    const wrapper = track(mountDialog());
    const dialog = panel(wrapper);

    expect(dialog.attributes('role')).toBe('dialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
    const labelledBy = dialog.attributes('aria-labelledby') ?? '';
    expect(labelledBy).not.toBe('');
    expect(wrapper.get(`#${labelledBy}`).text()).toBe('Vệ sinh điều hòa treo tường');

    expect(dialog.text()).toContain('Điện lạnh');
    expect(dialog.text()).toContain('Tháo và vệ sinh dàn lạnh tại nhà');
    expect(dialog.text()).toContain('Giá niêm yết');
    expect(dialog.text()).toContain('~45 phút');
    expect(dialog.find('[data-money="200000"]').exists()).toBe(true);
  });

  it('moves focus into the sheet and hands it back to the trigger on close', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const wrapper = track(mountDialog({ open: false }));
    await wrapper.setProps({ open: true });
    await nextTick();
    expect(document.activeElement).toBe(confirmButton(wrapper).element);

    await wrapper.setProps({ open: false });
    await nextTick();
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });

  it('keeps Tab inside the sheet and closes on Escape', async () => {
    const wrapper = track(mountDialog());
    const dialog = panel(wrapper);
    // A dialog that is open on its first render moves focus in on the next tick.
    await nextTick();

    (confirmButton(wrapper).element as HTMLElement).focus();
    await dialog.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton(wrapper).element);

    (closeButton(wrapper).element as HTMLElement).focus();
    await dialog.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirmButton(wrapper).element);

    await dialog.trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('closes from the backdrop and from Đóng, never from a click inside the sheet', async () => {
    const wrapper = track(mountDialog());

    await panel(wrapper).trigger('click');
    expect(wrapper.emitted('close')).toBeUndefined();

    await wrapper.get('[data-testid="booking-service-details-overlay"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);

    await wrapper.get('[data-testid="booking-service-details-dismiss"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(2);
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('emits the confirmed service id and never a selection by itself', async () => {
    const wrapper = track(mountDialog());

    await confirmButton(wrapper).trigger('click');
    expect(wrapper.emitted('confirm')).toEqual([['svc-ac-clean']]);
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('marks an already chosen service and disables its confirm button', async () => {
    const wrapper = track(mountDialog({ selected: true }));
    const confirm = confirmButton(wrapper);
    // A dialog that is open on its first render moves focus in on the next tick.
    await nextTick();

    expect(confirm.attributes('disabled')).toBeDefined();
    expect(confirm.text()).toContain('Đang chọn dịch vụ này');
    // With the confirm button out, focus lands on what is still actionable.
    expect(document.activeElement).toBe(closeButton(wrapper).element);
  });

  it('fails closed on a service without a usable price', () => {
    const wrapper = track(mountDialog({ service: { ...service, id: 'svc-noprice', fixedPrice: 0 } }));
    const dialog = panel(wrapper);

    expect(dialog.text()).toContain('Chưa có giá niêm yết');
    expect(dialog.find('[data-testid="booking-service-details-unavailable"]').exists()).toBe(true);
    expect(dialog.find('[data-money]').exists()).toBe(false);
  });

  it('locks the page scroll while open and releases it on close and on unmount', async () => {
    document.body.style.overflow = 'auto';
    const wrapper = track(mountDialog({ open: false }));

    await wrapper.setProps({ open: true });
    expect(document.body.style.overflow).toBe('hidden');

    await wrapper.setProps({ open: false });
    expect(document.body.style.overflow).toBe('auto');

    await wrapper.setProps({ open: true });
    expect(document.body.style.overflow).toBe('hidden');
    wrapper.unmount();
    expect(document.body.style.overflow).toBe('auto');
  });
});
