import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { hasShippingPolicyData, readInvoiceShippingSnapshot, readShippingPolicy } from '../src/utils/shipping-policy';
import ShippingShareBreakdown from '../src/components/ShippingShareBreakdown.vue';

describe('readShippingPolicy', () => {
  it('keeps incomplete share metadata visible for fail-closed rendering', () => {
    expect(hasShippingPolicyData({ shippingFee: 20_000, customerShippingShare: 14_000, technicianShippingShare: 6_000 })).toBe(true);
    expect(hasShippingPolicyData({ shippingFee: 20_000 })).toBe(false);
  });

  it('keeps snapshots with no policy or share fields on the legacy full-shipping path', () => {
    expect(readShippingPolicy({ shippingFee: 20_000 })).toMatchObject({
      state: 'valid', policyVersion: 'LEGACY_100_0', courierCost: 20_000,
      customerShare: 20_000, technicianShare: 0,
    });
  });

  it('reads the frozen invoice snapshot instead of deriving 70/30 on the client', () => {
    const snapshot = readInvoiceShippingSnapshot({
      id: 'invoice-1', shippingFee: 20_000, shippingPolicyVersion: 'W3_70_30_V1',
      customerShippingShare: 14_000, technicianShippingShare: 6_000,
    });
    expect(snapshot).toEqual({ shippingFee: 20_000, shippingPolicyVersion: 'W3_70_30_V1',
      customerShippingShare: 14_000, technicianShippingShare: 6_000, technicianNetLabor: undefined });
    expect(readShippingPolicy(snapshot!)).toMatchObject({ state: 'valid', customerShare: 14_000, technicianShare: 6_000 });
    expect(readInvoiceShippingSnapshot({ id: 'invoice-2', shippingFee: 20_000 })).toBeNull();
  });

  it('accepts the authoritative W3 70/30 shares for 20,000 VND', () => {
    expect(readShippingPolicy({
      shippingFee: 20_000, shippingPolicyVersion: 'W3_70_30_V1',
      customerShippingShare: 14_000, technicianShippingShare: 6_000,
    })).toMatchObject({ state: 'valid', customerShare: 14_000, technicianShare: 6_000 });
  });

  it('validates half-up rounding using exact integer arithmetic', () => {
    expect(readShippingPolicy({
      shippingFee: 1, shippingPolicyVersion: 'W3_70_30_V1',
      customerShippingShare: 1, technicianShippingShare: 0,
    })).toMatchObject({ state: 'valid', customerShare: 1, technicianShare: 0 });
    expect(readShippingPolicy({
      shippingFee: 5, shippingPolicyVersion: 'W3_70_30_V1',
      customerShippingShare: 4, technicianShippingShare: 1,
    })).toMatchObject({ state: 'valid', customerShare: 4, technicianShare: 1 });
    expect(readShippingPolicy({
      shippingFee: 5, shippingPolicyVersion: 'W3_70_30_V1',
      customerShippingShare: 3, technicianShippingShare: 2,
    }).state).toBe('error');
  });

  it('rejects W3 shares that sum correctly but do not match the 70/30 ratio', () => {
    expect(readShippingPolicy({
      shippingFee: 20_000, shippingPolicyVersion: 'W3_70_30_V1',
      customerShippingShare: 10_000, technicianShippingShare: 10_000,
    }).state).toBe('error');
  });

  it('rejects incomplete or inconsistent W3 snapshots', () => {
    expect(readShippingPolicy({
      shippingFee: 20_000, shippingPolicyVersion: 'W3_70_30_V1',
      customerShippingShare: 14_000,
    }).state).toBe('error');
    expect(readShippingPolicy({
      shippingFee: 20_000, shippingPolicyVersion: 'W3_70_30_V1',
      customerShippingShare: 14_000, technicianShippingShare: 5_999,
    }).state).toBe('error');
  });

  it('rejects split shares when the policy version is absent', () => {
    expect(readShippingPolicy({
      shippingFee: 20_000, customerShippingShare: 14_000, technicianShippingShare: 6_000,
    }).state).toBe('error');
  });

  it('only accepts explicit legacy shares when they equal full customer cost and zero technician cost', () => {
    expect(readShippingPolicy({
      shippingFee: 20_000, shippingPolicyVersion: 'LEGACY_100_0',
      customerShippingShare: 20_000, technicianShippingShare: 0,
    }).state).toBe('valid');
    expect(readShippingPolicy({
      shippingFee: 20_000, shippingPolicyVersion: 'LEGACY_100_0',
      customerShippingShare: 14_000, technicianShippingShare: 6_000,
    }).state).toBe('error');
  });

  it('rejects fractional, negative, unsafe, and noncanonical numeric strings', () => {
    for (const shippingFee of [1.5, -1, Number.MAX_SAFE_INTEGER + 1, '020']) {
      expect(readShippingPolicy({ shippingFee, shippingPolicyVersion: 'W3_70_30_V1', customerShippingShare: 14, technicianShippingShare: 6 }).state).toBe('error');
    }
    expect(readShippingPolicy({ shippingFee: '20', shippingPolicyVersion: 'W3_70_30_V1', customerShippingShare: '14', technicianShippingShare: '6' }))
      .toMatchObject({ state: 'valid', courierCost: 20, customerShare: 14, technicianShare: 6 });
  });

  it('shows technician net labor only when the server supplied a valid amount', () => {
    const snapshot = readShippingPolicy({
      shippingFee: 5, shippingPolicyVersion: 'W3_70_30_V1', customerShippingShare: 4,
      technicianShippingShare: 1, technicianNetLabor: 84_000,
    });
    expect(snapshot).toMatchObject({ state: 'valid', technicianNetLabor: 84_000 });
    expect(readShippingPolicy({ shippingFee: 5, shippingPolicyVersion: 'W3_70_30_V1', customerShippingShare: 4, technicianShippingShare: 1 }))
      .toMatchObject({ state: 'valid', technicianNetLabor: null });
  });
});

describe('ShippingShareBreakdown', () => {
  const w3 = {
    fulfillmentMethod: 'delivery' as const,
    shippingFee: 20_000,
    shippingPolicyVersion: 'W3_70_30_V1',
    customerShippingShare: 14_000,
    technicianShippingShare: 6_000,
  };

  it('shows both authoritative shares to the customer without consent or payment status', () => {
    const wrapper = mount(ShippingShareBreakdown, { props: { snapshot: w3, role: 'customer' } });
    expect(wrapper.text()).toContain('Phần khách hàng (70%)');
    expect(wrapper.text()).toContain('Phần kỹ thuật viên (30%)');
    expect(wrapper.text()).not.toMatch(/đã duyệt|đã thanh toán|đã đồng ý/i);
    wrapper.unmount();
  });

  it('preserves each role’s exact legacy shipping copy when policy fields are absent', () => {
    const snapshot = { fulfillmentMethod: 'delivery' as const, shippingFee: 20_000 };
    const customer = mount(ShippingShareBreakdown, { props: { snapshot, role: 'customer' } });
    expect(customer.text()).toContain('Phí giao linh kiện');
    customer.unmount();

    const technician = mount(ShippingShareBreakdown, { props: { snapshot, role: 'technician' } });
    expect(technician.text()).toContain('Phí giao hàng:');
    technician.unmount();

    const manager = mount(ShippingShareBreakdown, { props: { snapshot, role: 'manager' } });
    expect(manager.text()).toContain('Tổng phí giao hàng');
    manager.unmount();
  });

  it('shows server net labor only to a technician when the source provided it', () => {
    const withValue = mount(ShippingShareBreakdown, { props: { snapshot: { ...w3, technicianNetLabor: 84_000 }, role: 'technician' } });
    expect(withValue.text()).toContain('Tiền công thực nhận sau phí giao');
    withValue.unmount();

    const withoutValue = mount(ShippingShareBreakdown, { props: { snapshot: w3, role: 'technician' } });
    expect(withoutValue.text()).not.toContain('Tiền công thực nhận sau phí giao');
    withoutValue.unmount();
  });

  it('shows SM the full courier cost and keeps pickup free', () => {
    const manager = mount(ShippingShareBreakdown, { props: { snapshot: w3, role: 'manager' } });
    expect(manager.text()).toContain('Tổng phí giao thực tế');
    expect(manager.text()).toContain('20.000');
    manager.unmount();

    const pickup = mount(ShippingShareBreakdown, { props: { snapshot: w3, fulfillmentMethod: 'pickup', role: 'customer' } });
    expect(pickup.text()).toBe('');
    pickup.unmount();
  });

  it('fails closed in the UI for an inconsistent server snapshot', () => {
    const wrapper = mount(ShippingShareBreakdown, { props: { snapshot: { ...w3, technicianShippingShare: 5_999 }, role: 'customer' } });
    expect(wrapper.get('[role="alert"]').text()).toContain('Chưa thể đối chiếu');
    expect(wrapper.text()).not.toContain('Phần khách hàng (70%)');
    wrapper.unmount();
  });

  it('does not spread unrelated request fields into the rendered element', () => {
    const wrapper = mount(ShippingShareBreakdown, {
      props: { snapshot: { ...w3, qrToken: 'sample-only' }, role: 'customer' },
    });
    expect(wrapper.attributes()).not.toHaveProperty('qrtoken');
    wrapper.unmount();
  });
});
