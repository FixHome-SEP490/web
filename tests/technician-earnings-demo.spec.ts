import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TechnicianEarningsPage from '../src/pages/technician/TechnicianEarningsPage.vue';

describe('Technician wallet demo does not pretend to transfer real money', () => {
  it('labels sample figures and disables withdraw/export actions', async () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    try {
      const wrapper = mount(TechnicianEarningsPage, {
        global: { stubs: { FhMoney: true, FhTable: true, FhButton: {
          props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>',
        } } },
      });
      expect(wrapper.get('[data-testid="wallet-demo-notice"]').text()).toContain('không phải tiền thật');
      expect(wrapper.text()).toContain('không thể rút');
      expect(wrapper.text()).toContain('Chưa chốt');
      expect(wrapper.text()).not.toContain('Vietcombank');
      expect(wrapper.text()).not.toContain('cố định 15%');
      const withdraw = wrapper.findAll('button').find(button => button.text().includes('Rút tiền'));
      const exportButton = wrapper.findAll('button').find(button => button.text().includes('Xuất đối soát'));
      expect(withdraw?.attributes('disabled')).toBeDefined();
      expect(exportButton?.attributes('disabled')).toBeDefined();
      await withdraw?.trigger('click');
      await exportButton?.trigger('click');
      expect(alert).not.toHaveBeenCalled();
      wrapper.unmount();
    } finally { vi.unstubAllGlobals(); }
  });
});