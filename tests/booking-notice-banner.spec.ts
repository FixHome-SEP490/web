import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BookingNoticeBanner from '../src/components/booking/BookingNoticeBanner.vue';

describe('BookingNoticeBanner.vue', () => {
  it('renders warning banner with exact title, description, and action buttons', async () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();

    const wrapper = mount(BookingNoticeBanner, {
      props: {
        variant: 'warning',
        title: 'Bạn đã đạt giới hạn yêu cầu đang chờ',
        description: 'Bạn đang có 2 lượt sửa chữa chờ kỹ thuật viên nhận. Hãy xem các yêu cầu hiện tại hoặc hủy một yêu cầu trước khi đặt tiếp.',
        primaryCta: {
          label: 'Xem yêu cầu đang chờ',
          onClick: onPrimary,
        },
        secondaryCta: {
          label: 'Để sau',
          onClick: onSecondary,
        },
      },
      global: {
        stubs: {
          'router-link': true,
        },
      },
    });

    expect(wrapper.find('[data-testid="banner-title"]').text()).toBe('Bạn đã đạt giới hạn yêu cầu đang chờ');
    expect(wrapper.find('[data-testid="banner-description"]').text()).toContain('2 lượt sửa chữa chờ kỹ thuật viên nhận');

    const secondaryBtn = wrapper.find('[data-testid="banner-secondary-cta"]');
    expect(secondaryBtn.exists()).toBe(true);
    expect(secondaryBtn.text()).toBe('Để sau');

    const primaryBtn = wrapper.find('[data-testid="banner-primary-cta"]');
    expect(primaryBtn.exists()).toBe(true);
    expect(primaryBtn.text()).toContain('Xem yêu cầu đang chờ');

    await secondaryBtn.trigger('click');
    expect(onSecondary).toHaveBeenCalledTimes(1);

    await primaryBtn.trigger('click');
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('supports error, success, and info variants', () => {
    const variants = [
      { variant: 'error', expectedClass: 'bg-danger-50' },
      { variant: 'success', expectedClass: 'bg-success-50' },
      { variant: 'info', expectedClass: 'bg-info-50' },
      { variant: 'warning', expectedClass: 'bg-[#FFF9F2]' },
    ] as const;

    for (const item of variants) {
      const wrapper = mount(BookingNoticeBanner, {
        props: {
          variant: item.variant,
          title: `Title ${item.variant}`,
          description: `Description ${item.variant}`,
        },
        global: {
          stubs: {
            'router-link': true,
          },
        },
      });
      expect(wrapper.find('[data-testid="banner-title"]').text()).toBe(`Title ${item.variant}`);
      expect(wrapper.classes()).toContain(item.expectedClass);
    }
  });

  it('emits dismiss event when dismissible is enabled', async () => {
    const wrapper = mount(BookingNoticeBanner, {
      props: {
        title: 'Cảnh báo',
        dismissible: true,
      },
      global: {
        stubs: {
          'router-link': true,
        },
      },
    });

    const dismissBtn = wrapper.find('[data-testid="banner-dismiss"]');
    expect(dismissBtn.exists()).toBe(true);
    await dismissBtn.trigger('click');
    expect(wrapper.emitted('dismiss')).toHaveLength(1);
  });
});
