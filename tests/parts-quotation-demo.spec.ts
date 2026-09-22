import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PartsQuoteDemoPreview from '../src/components/PartsQuoteDemoPreview.vue';

describe('Parts quote preview is client-only illustrative data', () => {
  it('lets technician visualize example items and a draft total without submitting a quotation', async () => {
    const wrapper = mount(PartsQuoteDemoPreview);
    expect(wrapper.get('[data-testid="parts-quotation-demo"]').text()).toContain('không gửi API');
    expect(wrapper.text()).toContain('không thêm vào báo giá thật');
    const choices = wrapper.findAll('input[type="checkbox"]');
    expect(choices).toHaveLength(3);
    expect(wrapper.get('[data-testid="parts-demo-selected"]').text()).toContain('0');
    expect(wrapper.get('[data-testid="parts-demo-total"]').text()).toContain('120.000');
    await choices[0].setValue(true);
    expect(wrapper.get('[data-testid="parts-demo-selected"]').text()).toContain('1');
    expect(wrapper.get('[data-testid="parts-demo-total"]').text()).toContain('165.000');
    await choices[1].setValue(true);
    expect(wrapper.get('[data-testid="parts-demo-total"]').text()).toContain('240.000');
    await choices[0].setValue(false);
    expect(wrapper.get('[data-testid="parts-demo-total"]').text()).toContain('195.000');
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);
    wrapper.unmount();
  });
});