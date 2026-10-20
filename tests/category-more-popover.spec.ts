import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CategoryMorePopover from '../src/components/booking/CategoryMorePopover.vue';

describe('category popover accessibility', () => {
  it('focuses options, returns focus on Escape/selection and closes on outside pointer or focus', async () => {
    const wrapper = mount(CategoryMorePopover, {
      attachTo: document.body,
      props: { categories: [{ id: 'extra', name: 'Danh mục khác' }], modelValue: '' },
    });
    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      const toggle = wrapper.get('[data-testid="category-more-toggle"]');
      await toggle.trigger('click');
      await flushPromises();
      const dialog = wrapper.get('[role="dialog"]');
      expect(toggle.attributes('aria-expanded')).toBe('true');
      expect(toggle.attributes('aria-controls')).toBe(dialog.attributes('id'));
      expect(document.activeElement).toBe(dialog.get('button').element);
      await dialog.trigger('keydown', { key: 'Escape' });
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
      expect(document.activeElement).toBe(toggle.element);
      await toggle.trigger('click');
      await wrapper.get('[role="dialog"] button').trigger('click');
      expect(wrapper.emitted('select')).toEqual([['extra']]);
      expect(document.activeElement).toBe(toggle.element);
      await toggle.trigger('click');
      outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await flushPromises();
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
      await toggle.trigger('click');
      outside.focus();
      await flushPromises();
      expect(toggle.attributes('aria-expanded')).toBe('false');
    } finally {
      wrapper.unmount();
      outside.remove();
    }
  });
});
