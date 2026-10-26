import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import BookingSummary from '../src/components/booking/BookingSummary.vue';
import VisitOrderDetailsPanel from '../src/components/customer/VisitOrderDetails.vue';
import TechnicianVisitDeviceNavigator from '../src/components/technician/TechnicianVisitDeviceNavigator.vue';
import type { VisitCheckout } from '../src/api/visit-groups.api';
import type { VisitOrderDetails } from '../src/composables/useVisitOrderDetails';

enableAutoUnmount(afterEach);

function details(): VisitOrderDetails {
  return {
    order: {
      id: 'o1', code: 'SO-TEST', bookingId: 'b1', serviceName: 'Sửa máy giặt',
      status: 'UNDER_REPAIR', customerName: '', customerPhone: '', addressSummary: '',
      scheduledAt: '', createdAt: '', laborTotal: 199000, partsTotal: 0,
      grandTotal: 199000, paymentStatus: 'UNPAID',
      quotation: { id: 'q1', status: 'approved', laborTotal: 199000, partsTotal: 0,
        items: [{ type: 'LABOR', description: 'Kiểm tra và sửa máy giặt', quantity: 1, unitPrice: 199000, lineTotal: 199000 }] },
    },
    costs: [], invoice: null, costsError: false, invoiceError: false, evidenceError: false,
    evidence: [
      { id: 'before', type: 'before', mediaUrl: '/test-before.jpg', note: 'Van xả bị nứt' },
      { id: 'after', type: 'after', mediaUrl: '/test-after.jpg', note: 'Đã thay van xả' },
    ],
  };
}

describe('T1 summary and child detail accessibility', () => {
  it('moves the selected marker with props while preserving each child status and parts target', async () => {
    const devices: VisitCheckout['devices'] = [1, 2, 3].map(sequence => ({
      sequence, serviceOrderId: `o${sequence}`, bookingId: `b${sequence}`,
      serviceName: 'Máy giặt cửa trước', deviceLabel: `Phòng ${sequence}`, orderCode: `SO-${sequence}`,
      state: 'open', invoiceId: null, amount: 0, paid: false,
    }));
    const wrapper = mount(TechnicianVisitDeviceNavigator, { props: {
      devices, activeOrderId: 'o1', pendingReadyPartRequest: { orderId: 'o3', sequence: 3 },
      statusByOrderId: { o2: { label: 'Chờ khách duyệt báo giá', tone: 'attention', outcome: false, custodyLabel: null } },
    }, global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });
    expect(wrapper.get('[aria-current="page"]').attributes('data-testid')).toBe('tech-visit-device-1');
    await wrapper.setProps({ activeOrderId: 'o2' });
    expect(wrapper.findAll('[aria-current="page"]')).toHaveLength(1);
    const current = wrapper.get('[aria-current="page"]');
    expect(current.attributes('data-testid')).toBe('tech-visit-device-2');
    expect(current.text()).toContain('Chờ khách duyệt báo giá');
    expect(current.find('.sr-only').exists()).toBe(false);
    expect(current.text()).toContain('Đang xem');
    expect(wrapper.get('[data-testid="tech-visit-device-1"]').attributes('href')).toBe('/tech/jobs/o1');
    await wrapper.get('[data-testid="tech-visit-ready-parts-action"]').trigger('click');
    expect(wrapper.emitted('openParts')).toEqual([['o3']]);
  });

  it('qualifies firm labor on the phone bar and preserves the saved third-machine count', async () => {
    const wrapper = mount(BookingSummary, { props: {
      ctaLabel: 'Tiếp tục với 3 thiết bị', price: { kind: 'firm', amount: 597000 },
      devices: [1, 2, 3].map(n => ({ label: `Máy ${n}`, serviceName: 'Vệ sinh máy lạnh', deviceText: null, price: { kind: 'firm' as const, amount: 199000 } })),
    } });
    const bar = wrapper.get('[data-testid="booking-summary-bar"]');
    expect(bar.text()).toContain('3 thiết bị');
    expect(bar.text()).toContain('chưa gồm linh kiện');
    await bar.get('button').trigger('click');
    expect(wrapper.emitted('next')).toHaveLength(1);
    await wrapper.setProps({ ctaDisabled: true });
    await bar.get('button').trigger('click');
    expect(wrapper.emitted('next')).toHaveLength(1);
  });

  it('labels repair evidence by phase and keeps notes separate from photo descriptions', () => {
    const wrapper = mount(VisitOrderDetailsPanel, { props: { details: details(), disabled: false } });
    const figures = wrapper.findAll('figure');
    expect(figures[0]!.get('img').attributes('alt')).toContain('trước sửa chữa');
    expect(figures[1]!.get('img').attributes('alt')).toContain('sau sửa chữa');
    expect(figures[0]!.get('figcaption').text()).toContain('Van xả bị nứt');
    expect(figures[1]!.get('figcaption').text()).toContain('Đã thay van xả');
  });

  it('distinguishes an approved quotation from pending supplements without changing decision gates', async () => {
    const bundle = details();
    bundle.costs = [{ id: 'c1', serviceOrderId: 'o1', technicianId: 't1', status: 'PENDING_APPROVAL', reason: 'Thay van xả',
      totalLaborDelta: 0, totalPartsDelta: 50000, expiresAt: '2099-01-01T00:00:00Z', createdAt: '',
      items: [{ id: 'ci1', type: 'PARTS_EQUIPMENT', description: 'Van xả', quantity: 1, unitPrice: 50000, lineTotal: 50000, partSource: 'external' }] }];
    const wrapper = mount(VisitOrderDetailsPanel, { props: { details: bundle, disabled: false } });
    expect(wrapper.get('[data-testid="visit-inline-quotation"]').text()).toContain('Đã duyệt báo giá');
    expect(wrapper.find('[data-testid="visit-quote-approve"]').exists()).toBe(false);
    const approve = wrapper.get('[data-testid="visit-cost-approve-c1"]');
    expect(approve.attributes('disabled')).toBeDefined();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await approve.trigger('click');
    expect(wrapper.emitted('cost')).toEqual([['c1', 'APPROVE', true]]);
    await wrapper.setProps({ disabled: true });
    await approve.trigger('click');
    expect(wrapper.emitted('cost')).toHaveLength(1);
  });
});
