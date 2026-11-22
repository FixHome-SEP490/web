import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import FhConfirmDialog from '../src/components/FhConfirmDialog.vue';

// BUG DETECTOR 210: the admin lock box and the manager handover box use this dialog; it must be announced as a modal named by its title.
describe('FhConfirmDialog accessibility', () => {
  it('is a labelled modal dialog with a named close button', () => {
    const wrapper = mount(FhConfirmDialog, {
      props: { open: true, title: 'Khoá tài khoản', consequence: 'Người dùng sẽ không đăng nhập được.' },
      global: { stubs: { Teleport: true } },
    });
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
    const titleId = dialog.attributes('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(wrapper.get(`#${CSS.escape(titleId!)}`).text()).toBe('Khoá tài khoản');
    const describedBy = dialog.attributes('aria-describedby');
    expect(wrapper.get(`#${CSS.escape(describedBy!)}`).text()).toContain('không đăng nhập được');
    expect(wrapper.get('button[aria-label="Đóng"]').attributes('type')).toBe('button');
  });

  it('gives two open dialogs different title ids', () => {
    const Page = defineComponent({ render: () => [
      h(FhConfirmDialog, { open: true, title: 'A', consequence: 'x' }),
      h(FhConfirmDialog, { open: true, title: 'B', consequence: 'y' }),
    ] });
    const ids = mount(Page, { global: { stubs: { Teleport: true } } }).findAll('[role="dialog"]').map((d) => d.attributes('aria-labelledby'));
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
