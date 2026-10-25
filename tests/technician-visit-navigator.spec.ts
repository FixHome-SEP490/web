import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TechnicianVisitDeviceNavigator from '../src/components/technician/TechnicianVisitDeviceNavigator.vue';
import type { VisitCheckout } from '../src/api/visit-groups.api';

const device = (
  sequence: number,
  serviceOrderId: string | null,
  state: VisitCheckout['devices'][number]['state'] = 'open',
): VisitCheckout['devices'][number] => ({
  sequence,
  serviceOrderId,
  bookingId: `b${sequence}`,
  serviceName: sequence === 1 ? 'Máy lạnh' : sequence === 2 ? 'Máy giặt' : 'Tủ lạnh',
  deviceLabel: `Phòng ${sequence}`,
  orderCode: serviceOrderId,
  state,
  invoiceId: null,
  amount: 0,
  paid: false,
});

const routerLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
};

function render(devices: VisitCheckout['devices'], activeOrderId: string) {
  return mount(TechnicianVisitDeviceNavigator, {
    props: { devices, activeOrderId },
    global: { stubs: { 'router-link': routerLinkStub } },
  });
}

describe('Technician VisitGroup machine navigation', () => {
  it('labels one shared visit and separates each child price and parts from the current machine', () => {
    const wrapper = mount(TechnicianVisitDeviceNavigator, {
      props: { devices: [device(1, 'o1'), device(2, 'o2'), device(3, 'o3')], activeOrderId: 'o1', overviewByOrderId: {
        o1: { price: 449000, priceLabel: 'Tiền công cố định', partsLabel: 'Đã nhận qua QR', extraLabel: '1 chờ duyệt' },
        o2: { price: null, priceLabel: 'Cần khảo sát để báo giá', partsLabel: 'Chưa đặt linh kiện trước', extraLabel: '' },
      } }, global: { stubs: { 'router-link': routerLinkStub } },
    });
    expect(wrapper.text()).toContain('Chung cả lượt');
    expect(wrapper.text()).toContain('Một kỹ thuật viên');
    expect(wrapper.get('[data-testid="tech-visit-device-1"]').text()).toContain('Đang xem');
    expect(wrapper.get('[data-testid="tech-visit-device-1"]').text()).toContain('Tiền công cố định');
    expect(wrapper.get('[data-testid="tech-visit-device-1"]').text()).toContain('1 chờ duyệt');
    expect(wrapper.get('[data-testid="tech-visit-device-2"]').text()).toContain('Cần khảo sát để báo giá');
    expect(wrapper.get('[data-testid="tech-visit-device-3"]').text()).toContain('Chưa cập nhật giá');
  });

  it('shows three ordered machines, active order and a link to the next open machine', () => {
    const wrapper = render([
      device(3, 'o3', 'open'),
      device(1, 'o1', 'succeeded'),
      device(2, 'o2', 'open'),
    ], 'o1');

    expect(wrapper.get('[data-testid="tech-visit-progress"]').text()).toContain('1/3');
    const chips = wrapper.findAll('[data-testid^="tech-visit-device-"]');
    expect(chips.map((c) => c.attributes('data-testid'))).toEqual([
      'tech-visit-device-1',
      'tech-visit-device-2',
      'tech-visit-device-3',
    ]);
    expect(wrapper.get('[data-testid="tech-visit-device-1"]').attributes('aria-current')).toBe('page');
    expect(wrapper.get('[data-testid="tech-visit-device-1"]').text()).toContain('Máy lạnh · Phòng 1');
    expect(wrapper.get('[data-testid="tech-visit-device-1"]').text()).toContain('Đã sửa xong');
    expect(wrapper.get('[data-testid="tech-visit-device-2"]').attributes('href')).toBe('/tech/jobs/o2');
    expect(wrapper.get('[data-testid="tech-visit-device-3"]').attributes('href')).toBe('/tech/jobs/o3');
    expect(wrapper.get('[data-testid="tech-visit-next"]').attributes('href')).toBe('/tech/jobs/o2');
  });

  it('does not suggest leaving the selected machine before recording its outcome', () => {
    const wrapper = render([device(1, 'o1', 'open'), device(2, 'o2', 'open')], 'o1');
    expect(wrapper.find('[data-testid="tech-visit-next"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="tech-visit-device-2"]').attributes('href')).toBe('/tech/jobs/o2');
  });

  it('names the active machine and its status for assistive navigation', () => {
    const wrapper = render([device(1, 'o1', 'failed'), device(2, 'o2')], 'o1');
    expect(wrapper.get('[aria-current="page"]').attributes('aria-label')).toBe('Máy 1: Máy lạnh · Phòng 1, Không sửa được');
  });

  it('keeps machines without a real ServiceOrder ID unclickable', () => {
    const wrapper = render([device(1, 'o1'), device(2, null)], 'o1');
    expect(wrapper.get('[data-testid="tech-visit-device-2"]').attributes('href')).toBeUndefined();
    expect(wrapper.get('[data-testid="tech-visit-device-2"]').text()).toContain('Chưa có công việc');
    expect(wrapper.find('[data-testid="tech-visit-next"]').exists()).toBe(false);
  });

  it('never treats a failed or declined quote as successful or chargeable', () => {
    const wrapper = render([device(1, 'o1', 'failed'), device(2, 'o2', 'quote_declined')], 'o2');
    expect(wrapper.get('[data-testid="tech-visit-progress"]').text()).toContain('2/2');
    expect(wrapper.get('[data-testid="tech-visit-device-1"]').text()).toContain('Không sửa được');
    expect(wrapper.get('[data-testid="tech-visit-device-2"]').text()).toContain('Khách không duyệt báo giá');
    expect(wrapper.text()).not.toContain('Đã thanh toán');
    expect(wrapper.find('[data-testid="tech-visit-next"]').exists()).toBe(false);
  });
});
