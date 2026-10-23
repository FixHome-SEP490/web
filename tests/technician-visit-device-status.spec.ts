import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TechnicianVisitDeviceNavigator from '../src/components/technician/TechnicianVisitDeviceNavigator.vue';
import { projectTechnicianVisitDeviceStatus } from '../src/utils/technician-visit-device-status';

describe('technician visit device status', () => {
  it('uses a neutral label when an open child has no authorized detail', () => {
    expect(projectTechnicianVisitDeviceStatus('open', null, null)).toMatchObject({
      label: 'Chưa cập nhật',
      outcome: false,
      custodyLabel: null,
    });
  });

  it('projects an official sent quotation before generic order progress', () => {
    expect(projectTechnicianVisitDeviceStatus('open', {
      status: 'EN_ROUTE',
      quotation: { status: 'SENT' },
    }, [])).toMatchObject({ label: 'Chờ khách duyệt báo giá', tone: 'attention' });
  });

  it.each([
    ['requested', 'Chờ linh kiện'],
    ['ready', 'Linh kiện sẵn sàng nhận'],
    ['delivering', 'Linh kiện đang giao'],
    ['received', 'Đã nhận linh kiện'],
  ] as const)('projects PartRequest %s as %s', (status, label) => {
    expect(projectTechnicianVisitDeviceStatus('open', { status: 'UNDER_REPAIR' }, [{ status }]).label).toBe(label);
  });

  it('shows repair progress only when the child order and its parts read are confirmed', () => {
    expect(projectTechnicianVisitDeviceStatus('open', { status: 'UNDER_REPAIR' }, []).label).toBe('Đang sửa');
    expect(projectTechnicianVisitDeviceStatus('open', { status: 'UNDER_REPAIR' }, null).label).toBe('Chưa cập nhật');
  });

  it.each([
    ['succeeded', 'Đã sửa xong'],
    ['failed', 'Không sửa được'],
    ['quote_declined', 'Khách không duyệt báo giá'],
    ['cancelled', 'Đã huỷ'],
  ] as const)('keeps the group outcome %s visible over stale child data', (state, label) => {
    expect(projectTechnicianVisitDeviceStatus(state, { status: 'UNDER_REPAIR' }, [{ status: 'ready' }])).toMatchObject({
      label,
      outcome: true,
    });
  });

  it('keeps terminal outcomes and adds the exact custody action when known', () => {
    expect(projectTechnicianVisitDeviceStatus('failed', null, null, { needDeclare: 0, awaitingManager: 2 })).toMatchObject({
      label: 'Không sửa được',
      custodyLabel: '2 linh kiện chờ Quản lý Dịch vụ xác nhận',
    });
    expect(projectTechnicianVisitDeviceStatus('succeeded', null, null, { needDeclare: 1, awaitingManager: 0 })).toMatchObject({
      label: 'Đã sửa xong',
      custodyLabel: '1 linh kiện còn cần khai trả',
    });
    expect(projectTechnicianVisitDeviceStatus('failed', null, null, { needDeclare: 1, awaitingManager: 2 })).toMatchObject({
      label: 'Không sửa được',
      custodyLabel: '1 linh kiện còn cần khai trả · 2 linh kiện chờ Quản lý Dịch vụ xác nhận',
    });
  });
});

describe('TechnicianVisitDeviceNavigator', () => {
  it('shows a separate projected action line per machine and routes the ready-parts action to its child', async () => {
    const wrapper = mount(TechnicianVisitDeviceNavigator, {
      props: {
        activeOrderId: 'order-1',
        devices: [
          { sequence: 1, bookingId: 'booking-1', serviceName: 'Máy lạnh', serviceOrderId: 'order-1', state: 'open', amount: 0, paid: false },
          { sequence: 2, bookingId: 'booking-2', serviceName: 'Máy giặt', serviceOrderId: 'order-2', state: 'open', amount: 0, paid: false },
          { sequence: 3, bookingId: 'booking-3', serviceName: 'Tủ lạnh', serviceOrderId: 'order-3', state: 'failed', amount: 0, paid: false },
        ],
        statusByOrderId: {
          'order-1': { label: 'Chờ khách duyệt báo giá', tone: 'attention', outcome: false, custodyLabel: null },
          'order-2': { label: 'Linh kiện sẵn sàng nhận', tone: 'attention', outcome: false, custodyLabel: null },
          'order-3': { label: 'Không sửa được', tone: 'danger', outcome: true, custodyLabel: '2 linh kiện chờ Quản lý Dịch vụ xác nhận' },
        },
        pendingReadyPartRequest: { orderId: 'order-2', sequence: 2 },
      },
      global: {
        stubs: { 'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    });

    expect(wrapper.get('[data-testid="tech-visit-action-status-1"]').text()).toBe('Chờ khách duyệt báo giá');
    expect(wrapper.get('[data-testid="tech-visit-action-status-2"]').text()).toBe('Linh kiện sẵn sàng nhận');
    expect(wrapper.get('[data-testid="tech-visit-action-status-3"]').text()).toBe('Không sửa được');
    expect(wrapper.get('[data-testid="tech-visit-custody-status-3"]').text()).toBe('2 linh kiện chờ Quản lý Dịch vụ xác nhận');
    expect(wrapper.get('[data-testid="tech-visit-ready-parts-alert"]').text()).toContain('Máy 2 có linh kiện sẵn sàng nhận');

    await wrapper.get('[data-testid="tech-visit-ready-parts-action"]').trigger('click');
    expect(wrapper.emitted('openParts')).toEqual([['order-2']]);
  });
});
