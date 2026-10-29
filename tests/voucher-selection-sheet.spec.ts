// The reusable voucher sheet is a consent surface over server preview and
// reservation state. It must never calculate or apply a client-side discount.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

import VoucherSelectionSheet from '../src/components/vouchers/VoucherSelectionSheet.vue';
import type { VoucherOffer } from '../src/components/vouchers/voucher-model';

const personalOffer: VoucherOffer = {
  id: 'claim-personal',
  code: 'BUDAP10',
  title: 'Ưu đãi hỗ trợ sửa chữa',
  description: 'Ưu đãi được cấp cho lượt sửa chữa này.',
  kind: 'PERSONAL',
  status: 'ACTIVE',
  discount: { type: 'PERCENT', value: 10, capVnd: 100000 },
  minSpendVnd: 100000,
  scope: ['LABOR', 'PARTS'],
  categoryNames: ['Điện lạnh'],
  serviceNames: ['Sửa máy lạnh'],
  startsAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2026-12-31T16:59:00.000Z',
  perCustomerLimit: 1,
  successfulRedemptionLimit: null,
  remainingSuccessfulRedemptions: null,
  ownerCustomerId: 'customer-1',
  walletStatus: 'AVAILABLE',
  eligibility: { eligible: false, reasons: ['Điều kiện sử dụng sẽ được kiểm tra khi áp dụng ưu đãi được hỗ trợ.'] },
};

const generalOffer: VoucherOffer = {
  ...personalOffer,
  id: 'claim-general',
  code: 'FIXHOME50',
  title: 'Ưu đãi chung tháng 10',
  kind: 'GENERAL',
};

const activeReservation = {
  voucherId: 'claim-personal',
  expiresAt: '2026-10-26T10:15:00.000Z',
  serverTimeAtResponse: '2026-10-26T10:00:00.000Z',
};

let wrappers: VueWrapper[] = [];

function mountSheet(props: Record<string, unknown> = {}) {
  const wrapper = mount(VoucherSelectionSheet, {
    props: {
      open: true,
      state: 'ready',
      offers: [personalOffer, generalOffer],
      customerId: 'customer-1',
      ...props,
    },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return wrapper;
}

function panel(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="voucher-selection-sheet"]');
}

afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  wrappers = [];
  document.body.style.overflow = '';
});

describe('VoucherSelectionSheet', () => {
  it('renders only while open as a named modal and starts in a stable tab', async () => {
    const wrapper = mountSheet({ open: false });
    expect(wrapper.find('[data-testid="voucher-selection-sheet"]').exists()).toBe(false);

    await wrapper.setProps({ open: true });
    await nextTick();
    const dialog = panel(wrapper);
    expect(dialog.attributes('role')).toBe('dialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
    const labelledBy = dialog.attributes('aria-labelledby') ?? '';
    const describedBy = dialog.attributes('aria-describedby') ?? '';
    expect(wrapper.get(`#${labelledBy}`).text()).toContain('Chọn voucher');
    expect(wrapper.get(`#${describedBy}`).text()).toContain('Chưa áp dụng giảm giá');
    expect(document.activeElement).toBe(wrapper.get('[data-testid="voucher-selection-close"]').element);
    expect(wrapper.text()).toContain('Chưa áp dụng giảm giá');
  });

  it('splits owned vouchers into PERSONAL and GENERAL tabs and supports arrow keys', async () => {
    const wrapper = mountSheet();

    expect(wrapper.text()).toContain('Ưu đãi hỗ trợ sửa chữa');
    expect(wrapper.text()).not.toContain('Ưu đãi chung tháng 10');
    expect(wrapper.get('[data-testid="voucher-selection-tab-personal"]').attributes('aria-selected')).toBe('true');

    await wrapper.get('[data-testid="voucher-selection-tab-general"]').trigger('click');
    expect(wrapper.text()).toContain('Ưu đãi chung tháng 10');
    expect(wrapper.text()).not.toContain('Ưu đãi hỗ trợ sửa chữa');

    await wrapper.get('[data-testid="voucher-selection-tab-general"]').trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.get('[data-testid="voucher-selection-tab-personal"]').attributes('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(wrapper.get('[data-testid="voucher-selection-tab-personal"]').element);
  });

  it('shows authoritative eligible and ineligible reasons without inventing a total', async () => {
    const wrapper = mountSheet({
      serverQuote: {
        eligibleVoucherIds: ['claim-general'],
        ineligibleReasons: { 'claim-personal': 'Đơn chưa đạt mức tối thiểu 300.000 ₫.' },
      },
    });

    const personalOption = wrapper.get('[data-voucher-id="claim-personal"]');
    const personalReason = personalOption.get('[data-testid="voucher-selection-eligibility"]');
    expect(personalReason.attributes('data-eligibility')).toBe('ineligible');
    expect(personalOption.text()).toContain('Đơn chưa đạt mức tối thiểu 300.000 ₫.');

    await wrapper.get('[data-testid="voucher-selection-tab-general"]').trigger('click');
    const generalOption = wrapper.get('[data-voucher-id="claim-general"]');
    const generalReason = generalOption.get('[data-testid="voucher-selection-eligibility"]');
    expect(generalReason.attributes('data-eligibility')).toBe('eligible');
    expect(generalReason.text()).toContain('Đủ điều kiện theo máy chủ');

    expect(wrapper.text()).not.toContain('Còn phải trả');
    expect(wrapper.text()).not.toContain('Tổng thanh toán');
  });

  it('marks wallet vouchers as unchecked until a server quote arrives', () => {
    const wrapper = mountSheet();
    const option = wrapper.get('[data-voucher-id="claim-personal"]');
    const status = option.get('[data-testid="voucher-selection-eligibility"]');
    expect(status.attributes('data-eligibility')).toBe('unknown');
    expect(status.text()).toContain('Chưa kiểm tra với hóa đơn');
    expect(option.text()).toContain('sẽ được kiểm tra');
  });

  it('shows the server reservation timestamp and a 15-minute countdown', () => {
    const wrapper = mountSheet({ serverReservation: activeReservation });
    const reservation = wrapper.get('[data-testid="voucher-selection-reservation"]');
    expect(reservation.text()).toContain('Giữ chỗ còn 15:00');
    expect(reservation.text()).toContain('Máy chủ ghi nhận 17:00');
    expect(reservation.text()).toContain('hết hạn 17:15');
    expect(reservation.get('[role="timer"]').attributes('aria-live')).toBe('off');
  });

  it('shows the 15-minute policy before a hold and the expired state after it', async () => {
    const wrapper = mountSheet();
    expect(wrapper.get('[data-testid="voucher-selection-reservation"]').text()).toContain('tối đa 15 phút');

    await wrapper.setProps({
      serverReservation: {
        voucherId: 'claim-personal',
        expiresAt: '2026-10-26T10:00:00.000Z',
        serverTimeAtResponse: '2026-10-26T10:00:00.000Z',
      },
    });
    expect(wrapper.get('[data-testid="voucher-selection-reservation"]').text()).toContain('Thời gian giữ chỗ đã hết.');
  });

  it('reports empty, loading, error and offline states with honest recovery', async () => {
    const empty = mountSheet({ offers: [] });
    expect(empty.text()).toContain('Chưa có voucher');
    empty.unmount();
    wrappers = wrappers.filter((item) => item !== empty);

    const loading = mountSheet({ state: 'loading' });
    expect(loading.get('[data-testid="voucher-state-panel"]').text()).toContain('Đang tải ưu đãi');
    loading.unmount();
    wrappers = wrappers.filter((item) => item !== loading);

    const error = mountSheet({ state: 'error', message: 'Máy chủ tạm thời không phản hồi.' });
    expect(error.get('[data-testid="voucher-state-panel"]').text()).toContain('Máy chủ tạm thời không phản hồi.');
    await error.get('[data-testid="voucher-state-panel"] button').trigger('click');
    expect(error.emitted('retry')).toHaveLength(1);
    error.unmount();
    wrappers = wrappers.filter((item) => item !== error);

    const offline = mountSheet({ state: 'offline' });
    expect(wrapperText(offline)).toContain('Đang ngoại tuyến');
    expect(wrapperText(offline)).toContain('Chưa có voucher nào được giữ chỗ hoặc áp dụng.');
    await wrapperButton(offline, 'Thử lại').trigger('click');
    expect(offline.emitted('retry')).toHaveLength(1);
  });

  it('keeps the code entry disabled by default and emits only an explicit future intent when enabled', async () => {
    const disabled = mountSheet();
    expect(disabled.get('[data-testid="voucher-selection-code"]').attributes('disabled')).toBeDefined();
    expect(disabled.get('[data-testid="voucher-selection-code-submit"]').attributes('disabled')).toBeDefined();
    expect(disabled.text()).toContain('Mã hiện không được gửi đi.');

    const enabled = mountSheet({ codeEntryEnabled: true });
    await enabled.get('[data-testid="voucher-selection-code"]').setValue(' FIXHOME50 ');
    await enabled.get('[data-testid="voucher-selection-code-submit"]').trigger('click');
    expect(enabled.emitted('verifyCode')).toEqual([['FIXHOME50']]);
  });

  it('traps Tab, closes with Escape, backdrop or Huỷ, and restores the trigger focus', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const wrapper = mountSheet({ open: false });
    await wrapper.setProps({ open: true });
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');
    expect(panel(wrapper).element.contains(document.activeElement)).toBe(true);

    const close = wrapper.get('[data-testid="voucher-selection-close"]');
    const cancel = wrapper.get('[data-testid="voucher-selection-cancel"]');
    (cancel.element as HTMLElement).focus();
    await panel(wrapper).trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(close.element);
    (close.element as HTMLElement).focus();
    await panel(wrapper).trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(cancel.element);

    await panel(wrapper).trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(1);

    await wrapper.get('[data-testid="voucher-selection-overlay"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(2);
    await panel(wrapper).trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(2);
    await cancel.trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(3);

    await wrapper.setProps({ open: false });
    await nextTick();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('');
    trigger.remove();
  });

  it('fails closed when a reusable sheet caller provides no customer identity', () => {
    const wrapper = mountSheet({ customerId: undefined });
    expect(wrapper.text()).not.toContain('Ưu đãi hỗ trợ sửa chữa');
    expect(wrapper.text()).not.toContain('Ưu đãi chung tháng 10');
    expect(wrapper.text()).toContain('Chưa có voucher');
  });

  it('hides vouchers that do not belong to the signed-in customer', () => {
    const wrapper = mountSheet({ customerId: 'customer-2' });
    expect(wrapper.text()).not.toContain('Ưu đãi hỗ trợ sửa chữa');
    expect(wrapper.text()).not.toContain('Ưu đãi chung tháng 10');
    expect(wrapper.text()).toContain('Chưa có voucher');
  });

  it('shows server preview and enables Apply only when the server allows reservation', async () => {
    const serverPreview = {
      scopeId: 'order-1', claimId: 'claim-personal', previewOnly: true as const,
      paymentAvailable: true, reason: null, originalGrossVnd: 250000,
      eligibleBaseVnd: 200000, fixHomeDiscountSubsidyVnd: 50000,
      customerDueVnd: 200000, reasonCodes: ['DISCOUNT_APPLIED'],
    };
    const wrapper = mountSheet({
      serverQuote: { eligibleVoucherIds: ['claim-personal'] },
      serverPreview,
      canApply: true,
    });
    const preview = wrapper.get('[data-testid="voucher-selection-preview"]');
    expect(preview.text()).toContain('250.000');
    expect(preview.text()).toContain('50.000');
    expect(preview.text()).toContain('200.000');
    expect(wrapper.get('[data-testid="voucher-selection-apply"]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-testid="voucher-selection-apply"]').trigger('click');
    expect(wrapper.emitted('apply')).toHaveLength(1);

    await wrapper.setProps({ serverPreview: { ...serverPreview, paymentAvailable: false, reason: 'VOUCHER_FUNDING_NOT_READY' }, canApply: false });
    expect(wrapper.get('[data-testid="voucher-selection-apply"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).not.toContain('Đã áp dụng');
  });

  it('emits the selected voucher id as intent and shows the selected title', async () => {
    const wrapper = mountSheet();
    await wrapper.get('[data-testid="voucher-selection-option"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['claim-personal']]);
    expect(wrapper.get('[data-testid="voucher-selection-selected"]').text()).toContain('Ưu đãi hỗ trợ sửa chữa');
  });
});

function wrapperText(wrapper: VueWrapper): string {
  return wrapper.get('[data-testid="voucher-selection-sheet"]').text();
}

function wrapperButton(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('[data-testid="voucher-selection-sheet"] button').find((button) => button.text() === text)!;
}
