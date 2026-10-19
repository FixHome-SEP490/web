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
    expect(wrapper.text()).toContain('Tham khảo 249.000đ');
    expect(wrapper.text()).toContain('Thợ khảo sát, báo giá để khách duyệt');
    expect(wrapper.text()).not.toContain('Từ 249');
    wrapper.unmount();
  });
  it.each([
    ['fixed_range', 199000, 449000, '199.000 – 449.000đ', 'Giá công theo thiết bị/phạm vi'],
    ['fixed_range', 349000, 349000, '349.000đ', 'Giá công theo thiết bị/phạm vi'],
    ['inspection_reference', 249000, 249000, 'Tham khảo 249.000đ', 'Thợ khảo sát, báo giá để khách duyệt'],
    ['inspection_reference', 249000, null, 'Tham khảo 249.000đ', 'Thợ khảo sát, báo giá để khách duyệt'],
    ['inspection_only', null, null, 'Khảo sát & báo giá', ''],
    ['fixed_range', null, null, 'Khảo sát & báo giá', ''],
    ['fixed_range', 449000, 199000, 'Khảo sát & báo giá', ''],
    ['inspection_reference', null, null, 'Khảo sát & báo giá', ''],
  ] as const)('renders %s (%s–%s) ahead of the parent mode', async (kind, minLaborVnd, maxLaborVnd, label, caption) => {
    const wrapper = mount(CompactServiceCard, {
      props: { service: { ...service, priceSummary: { kind, minLaborVnd, maxLaborVnd } }, selected: true },
    });
    expect(wrapper.text()).toContain(label);
    if (caption) expect(wrapper.text()).toContain(caption);
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
