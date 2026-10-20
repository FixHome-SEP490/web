import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CompactServiceCard from '../src/components/booking/CompactServiceCard.vue';

const service = {
  id: 'catalog-v2', categoryId: 'air', categoryName: 'Điện lạnh',
  name: 'Vệ sinh điều hòa', code: 'AC-01', estimatedMinutes: 60,
  isActive: true, pricingMode: 'inspection_required' as const,
};

describe('catalog summary prices in the booking finder', () => {
  it('renders the real survey estimate field when no approved minimum exists', () => {
    const wrapper = mount(CompactServiceCard, {
      props: { service: { ...service, priceSummary: { kind: 'inspection_reference', minLaborVnd: null, maxLaborVnd: null, suggestedLaborVnd: 249000 } }, selected: false },
    });
    // One short label per row (PO 20/10/2026); a survey reference is never written as a floor.
    expect(wrapper.get('[data-testid="booking-service-price"]').text()).toBe('Tham khảo 249k');
    expect(wrapper.text()).not.toContain('Từ 249');
    wrapper.unmount();
  });
  it.each([
    ['fixed_range', 199000, 449000, '199k – 449k'],
    ['fixed_range', 349000, 349000, '349k'],
    ['inspection_reference', 249000, 249000, 'Tham khảo 249k'],
    ['inspection_reference', 249000, null, 'Tham khảo 249k'],
    ['inspection_only', null, null, 'Khảo sát, báo giá'],
    ['fixed_range', null, null, 'Khảo sát, báo giá'],
    ['fixed_range', 449000, 199000, 'Khảo sát, báo giá'],
    ['inspection_reference', null, null, 'Khảo sát, báo giá'],
  ] as const)('renders %s (%s–%s) ahead of the parent mode', async (kind, minLaborVnd, maxLaborVnd, label) => {
    const wrapper = mount(CompactServiceCard, {
      props: { service: { ...service, priceSummary: { kind, minLaborVnd, maxLaborVnd } }, selected: true },
    });
    expect(wrapper.get('[data-testid="booking-service-price"]').text()).toBe(label);
    expect(wrapper.text()).not.toContain('Từ ');
    expect(wrapper.text()).not.toContain('Báo giá trước khi sửa');
    expect(wrapper.text()).not.toContain('Khảo sát tận nơi');
    const select = wrapper.get('[data-testid="booking-service-card"]');
    expect(select.attributes('aria-pressed')).toBe('true');
    await wrapper.get('[data-testid="booking-service-details"]').trigger('click');
    expect(wrapper.emitted('details')).toEqual([[service.id]]);
    expect(wrapper.emitted('select')).toBeUndefined();
    await select.trigger('click');
    expect(wrapper.emitted('select')).toEqual([[service.id]]);
  });
});
