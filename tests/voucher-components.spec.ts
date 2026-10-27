import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import CustomerVoucherWorkspace from '../src/components/vouchers/CustomerVoucherWorkspace.vue';
import ConsoleVoucherWorkspace from '../src/components/vouchers/ConsoleVoucherWorkspace.vue';
import VoucherOfferCard from '../src/components/vouchers/VoucherOfferCard.vue';
import type { VoucherOffer } from '../src/components/vouchers/voucher-model';

const generalOffer: VoucherOffer = {
  id: 'general-1',
  code: 'FIXHOME10',
  title: 'Sửa nhà tháng 11',
  description: 'Ưu đãi cho dịch vụ đủ điều kiện.',
  kind: 'GENERAL',
  status: 'ACTIVE',
  discount: { type: 'PERCENT', value: 10, capVnd: 100000 },
  minSpendVnd: 200000,
  scope: ['LABOR', 'PARTS'],
  categoryNames: ['Điện lạnh'],
  serviceNames: ['Sửa máy lạnh'],
  startsAt: '2026-11-01T00:00:00.000Z',
  expiresAt: '2026-11-30T16:59:00.000Z',
  perCustomerLimit: 1,
  successfulRedemptionLimit: 100,
  remainingSuccessfulRedemptions: 42,
  ownerCustomerId: null,
  walletStatus: null,
  eligibility: { eligible: false, reasons: ['Đơn chưa đạt mức tối thiểu.'] },
};

const personalOffer: VoucherOffer = {
  ...generalOffer,
  id: 'personal-1',
  code: 'BUDAP-1',
  title: 'Ưu đãi hỗ trợ sửa chữa',
  kind: 'PERSONAL',
  ownerCustomerId: 'customer-1',
  walletStatus: 'AVAILABLE',
};

describe('voucher components', () => {
  it('shows real campaign terms, remaining paid-redemption quota, and the eligibility reason', () => {
    const wrapper = mount(VoucherOfferCard, {
      props: { offer: generalOffer, connected: true },
    });

    expect(wrapper.text()).toContain('Giảm 10%');
    expect(wrapper.text()).toContain('100.000 ₫');
    expect(wrapper.text()).toContain('200.000 ₫');
    expect(wrapper.text()).toContain('42 / 100 lượt thanh toán thành công còn lại');
    expect(wrapper.text()).toContain('Tiền công và linh kiện');
    expect(wrapper.text()).toContain('Đơn chưa đạt mức tối thiểu.');
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
  });

  it('does not expose a personal voucher in another customer’s wallet', async () => {
    const wrapper = mount(CustomerVoucherWorkspace, {
      props: {
        state: 'ready',
        offers: [personalOffer],
        customerId: 'customer-2',
        actionsEnabled: false,
      },
    });

    await wrapper.get('[role="tab"][aria-label="Ưu đãi của tôi"]').trigger('click');
    expect(wrapper.text()).not.toContain('Ưu đãi hỗ trợ sửa chữa');
  });

  it('shows an owned claimed GENERAL voucher in Mine and excludes foreign or guest wallets', async () => {
    const ownedGeneral = { ...generalOffer, ownerCustomerId: 'customer-1', walletStatus: 'AVAILABLE' as const };
    const foreignGeneral = { ...generalOffer, id: 'general-foreign', title: 'Ưu đãi của khách khác', ownerCustomerId: 'customer-2', walletStatus: 'AVAILABLE' as const };
    const owned = mount(CustomerVoucherWorkspace, {
      props: { state: 'ready', offers: [ownedGeneral, foreignGeneral], customerId: 'customer-1', actionsEnabled: false },
    });

    expect(owned.text()).toContain('Sửa nhà tháng 11');
    expect(owned.text()).not.toContain('Ưu đãi của khách khác');
    await owned.get('[role="tab"][aria-label="Ưu đãi chung"]').trigger('click');
    expect(owned.text()).not.toContain('Sửa nhà tháng 11');
    owned.unmount();

    const guest = mount(CustomerVoucherWorkspace, {
      props: { state: 'ready', offers: [ownedGeneral], customerId: null, actionsEnabled: false },
    });
    expect(guest.text()).not.toContain('Sửa nhà tháng 11');
    guest.unmount();
  });

  it('moves the customer tab selection and focus with the arrow keys', async () => {
    const wrapper = mount(CustomerVoucherWorkspace, {
      props: { state: 'ready', offers: [], customerId: 'customer-1', actionsEnabled: false },
    });

    await wrapper.get('[data-voucher-tab="mine"]').trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.get('[data-voucher-tab="general"]').attributes('aria-selected')).toBe('true');
  });

  it('keeps manual code validation disabled while the adapter is unavailable', () => {
    const wrapper = mount(CustomerVoucherWorkspace, {
      props: {
        state: 'unavailable',
        offers: [],
        customerId: 'customer-1',
        actionsEnabled: false,
      },
    });

    expect(wrapper.get('input[aria-label="Mã ưu đãi"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button[aria-label="Lưu mã vào ví"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('chưa thể sử dụng');
  });

  it('starts a countdown interval only for an active server reservation and cleans it on change and unmount', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const wrapper = mount(VoucherOfferCard, { props: { offer: generalOffer } });
    try {
      expect(setIntervalSpy).not.toHaveBeenCalled();

      const activeReservation = {
        expiresAt: '2026-10-26T10:15:00.000Z',
        serverTimeAtResponse: '2026-10-26T10:00:00.000Z',
      };
      await wrapper.setProps({ offer: { ...generalOffer, reservation: activeReservation } });
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(wrapper.get('[role="timer"]').attributes('aria-live')).toBe('off');
      const firstTimer = setIntervalSpy.mock.results[0].value;

      await wrapper.setProps({ offer: {
        ...generalOffer,
        reservation: { expiresAt: activeReservation.serverTimeAtResponse, serverTimeAtResponse: activeReservation.serverTimeAtResponse },
      } });
      expect(clearIntervalSpy).toHaveBeenCalledWith(firstTimer);
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(wrapper.find('[role="timer"]').exists()).toBe(false);
      expect(wrapper.text()).toContain('Thời gian giữ chỗ đã hết.');

      await wrapper.setProps({ offer: { ...generalOffer, reservation: activeReservation } });
      const latestTimer = setIntervalSpy.mock.results[1].value;
      wrapper.unmount();
      expect(clearIntervalSpy).toHaveBeenCalledWith(latestTimer);
    } finally {
      wrapper.unmount();
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    }
  });

  it('disables campaign creation without management permission', () => {
    const wrapper = mount(ConsoleVoucherWorkspace, { props: { state: 'ready', campaigns: [], canManage: false } });
    const create = wrapper.findAll('button').find(button => button.text().includes('Tạo chiến dịch'))!;
    expect(create.attributes('disabled')).toBeDefined();
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('keeps terms immutable while exposing the server status action', async () => {
    const activeCampaign = { ...generalOffer, status: 'ACTIVE' as const };
    const wrapper = mount(ConsoleVoucherWorkspace, {
      props: {
        state: 'ready',
        campaigns: [activeCampaign],
        auditEvents: [],
        connected: true,
        canManage: true,
        fundingApproved: true,
      },
    });

    expect(wrapper.find('button[aria-label="Chỉnh sửa Sửa nhà tháng 11"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Chiến dịch đã phát hành');
    const pauseButton = wrapper.get('button[aria-label="Tạm dừng Sửa nhà tháng 11"]');
    expect(pauseButton.attributes('disabled')).toBeUndefined();
    await pauseButton.trigger('click');
    expect(wrapper.emitted('setCampaignStatus')).toEqual([['general-1', false]]);
    expect(wrapper.emitted('updateCampaign')).toBeUndefined();
  });
});
