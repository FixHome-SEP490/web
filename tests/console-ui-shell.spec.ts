import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import router from '../src/router';
import { consoleNavigation } from '../src/components/console/console-navigation';
import ConsoleTable from '../src/components/console/ConsoleTable.vue';
import ConsoleMoreMenu from '../src/components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../src/components/console/ConsoleMenuItem.vue';
import ConsoleLoadError from '../src/components/console/ConsoleLoadError.vue';
import ConsolePageHeader from '../src/components/console/ConsolePageHeader.vue';
import { CONSOLE_LOAD_ERROR } from '../src/components/console/console-ui';
import {
  bookingStatusLabel,
  cashSettlementLabel,
  looksLikeCode,
  orderStatusLabel,
  paymentStatusLabel,
  roleLabel,
} from '../src/components/console/console-labels';
import { auditActionLabel, auditResourceLabel } from '../src/components/console/audit-labels';

// Console redesign (PO 10/10/2026): one header per page, compact toolbars,
// plain tables, one "⋯" menu for secondary actions, no codes on screen.

const { getConsoleOrders } = vi.hoisted(() => ({ getConsoleOrders: vi.fn() }));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getConsoleOrders } }));
const { getServiceAreas } = vi.hoisted(() => ({ getServiceAreas: vi.fn() }));
vi.mock('../src/api/service-areas.api', () => ({ serviceAreasApi: { getServiceAreas } }));

const CODE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;

describe('Console sidebar', () => {
  const routeFor = (path: string) => router.resolve(path).matched.at(-1);

  it.each(['SERVICE_MANAGER', 'ADMIN'])('lists every page once for %s, each one the role may open', (role) => {
    const items = consoleNavigation(role).flatMap((group) => group.items);
    const paths = items.map((item) => item.path);
    const labels = items.map((item) => item.label);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(labels).size).toBe(labels.length);
    for (const item of items) {
      const roles = routeFor(item.path)?.meta.roles as string[] | undefined;
      expect(roles, item.path).toContain(role);
      expect(item.label.length, item.label).toBeLessThanOrEqual(20);
      expect(item.label).not.toMatch(/Board|Platform|KTV|KYC|&|\(/);
    }
  });

  it('keeps manager-only pages out of the admin menu and admin pages out of the manager menu', () => {
    const sm = consoleNavigation('SERVICE_MANAGER').flatMap((g) => g.items.map((i) => i.path));
    const admin = consoleNavigation('ADMIN').flatMap((g) => g.items.map((i) => i.path));
    expect(sm).toEqual(expect.arrayContaining(['/console/support', '/console/cancellations', '/console/reputation']));
    expect(admin).not.toContain('/console/support');
    expect(sm.some((p) => p.startsWith('/console/admin/'))).toBe(false);
    expect(admin).toEqual(expect.arrayContaining(['/console/admin/users', '/console/admin/config', '/console/warranty']));
    expect(consoleNavigation('CUSTOMER')).toEqual([]);
  });

  it('gives every console route a plain Vietnamese title', () => {
    const consoleRoutes = router.getRoutes().filter((r) => r.path.startsWith('/console') && r.meta.title);
    expect(consoleRoutes.length).toBeGreaterThan(15);
    for (const r of consoleRoutes) {
      expect(String(r.meta.title), r.path).not.toMatch(/Board|Platform|Console|Dashboard|KTV|&|\(\d+\)/);
    }
  });
});

describe('Console building blocks', () => {
  it('draws a table with the given columns, hides minor ones on narrow screens and tags rows', () => {
    const w = mount(ConsoleTable, {
      props: {
        columns: [{ key: 'name', label: 'Tên' }, { key: 'note', label: 'Ghi chú', hideBelow: 'xl' }],
        rows: [{ id: 'a', name: 'Một', note: 'x' }],
        rowTestId: (row: { id: string }) => `row-${row.id}`,
      },
    });
    expect(w.findAll('th').map((th) => th.text())).toEqual(['Tên', 'Ghi chú']);
    expect(w.findAll('th')[1].classes()).toEqual(expect.arrayContaining(['hidden', 'xl:table-cell']));
    expect(w.get('[data-testid="row-a"]').text()).toContain('Một');
  });

  it('shows a skeleton shaped like the table while loading, and the empty text after', async () => {
    const w = mount(ConsoleTable, { props: { columns: [{ key: 'a', label: 'A' }], rows: [], loading: true, emptyText: 'Trống.' } });
    expect(w.find('[data-testid="console-table-skeleton"]').exists()).toBe(true);
    await w.setProps({ loading: false });
    expect(w.text()).toContain('Trống.');
  });

  it('keeps secondary actions in the "⋯" menu, which closes after a choice and on Escape', async () => {
    const onPick = vi.fn();
    const w = mount({
      components: { ConsoleMoreMenu, ConsoleMenuItem },
      template: '<ConsoleMoreMenu><ConsoleMenuItem @click="pick">Làm mới</ConsoleMenuItem></ConsoleMoreMenu>',
      methods: { pick: onPick },
    }, { attachTo: document.body });
    const trigger = w.get('button[aria-haspopup="menu"]');
    expect(trigger.attributes('aria-label')).toBe('Thao tác khác');
    expect(w.get('[role="menu"]').isVisible()).toBe(false);
    await trigger.trigger('click');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    await w.get('[role="menuitem"]').trigger('click');
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(trigger.attributes('aria-expanded')).toBe('false');
    await trigger.trigger('click');
    await w.get('[role="menu"]').trigger('keydown', { key: 'Escape' });
    expect(trigger.attributes('aria-expanded')).toBe('false');
    w.unmount();
  });

  it('says only "Chưa tải được, vui lòng thử lại." with a retry when a load fails', async () => {
    const w = mount(ConsoleLoadError);
    expect(w.text()).toContain(CONSOLE_LOAD_ERROR);
    await w.get('button').trigger('click');
    expect(w.emitted('retry')).toHaveLength(1);
  });

  it('puts the title on the left and the actions on the right', () => {
    const w = mount(ConsolePageHeader, {
      props: { title: 'Đơn sửa chữa', count: 12 },
      slots: { actions: '<button>Thêm</button>' },
      global: { stubs: { 'router-link': RouterLinkStub } },
    });
    expect(w.get('h1').text()).toBe('Đơn sửa chữa');
    expect(w.get('[data-testid="page-count"]').text()).toBe('12');
    expect(w.text()).toContain('Thêm');
  });
});

describe('Codes in words', () => {
  it('turns roles, payment, order, booking and cash statuses into Vietnamese, never the code', () => {
    expect(roleLabel('SERVICE_MANAGER')).toBe('Quản lý dịch vụ');
    expect(paymentStatusLabel('UNPAID')).toBe('Chưa thanh toán');
    expect(orderStatusLabel('en_route')).toBe('Đang di chuyển');
    expect(bookingStatusLabel('MATCHING')).toBe('Đang tìm kỹ thuật viên');
    expect(cashSettlementLabel('pending_confirmation')).toBe('Chờ khách xác nhận');
    for (const unknown of ['WEIRD_STATE', 'x_y', '']) {
      for (const label of [roleLabel(unknown), paymentStatusLabel(unknown), orderStatusLabel(unknown), bookingStatusLabel(unknown), cashSettlementLabel(unknown)]) {
        expect(label).not.toMatch(CODE);
        expect(label).not.toBe(unknown);
      }
    }
  });

  it('names audit actions and objects, with a neutral phrase for new ones', () => {
    expect(auditActionLabel('BOOKING_CREATE')).toBe('Tạo yêu cầu đặt lịch');
    expect(auditActionLabel('WALLET_ADJUSTMENT')).toBe('Điều chỉnh ví kỹ thuật viên');
    expect(auditActionLabel('SOMETHING_NEW')).toBe('Thao tác khác');
    expect(auditResourceLabel('service_order')).toBe('Đơn sửa chữa');
    expect(auditResourceLabel('unknown_table')).toBe('Đối tượng khác');
  });

  it('recognises code-like text', () => {
    expect(looksLikeCode('ORDER_CANCELLED')).toBe(true);
    expect(looksLikeCode('in_review')).toBe(true);
    expect(looksLikeCode('FH-20261001-AAAA0001')).toBe(false);
    expect(looksLikeCode('Đổi ý')).toBe(false);
  });
});

describe('Console pages on a failed load', () => {
  beforeEach(() => vi.clearAllMocks());
  const stubs = { 'router-link': RouterLinkStub, RouterLink: RouterLinkStub };

  it('orders: one plain sentence and a retry, no status code or English', async () => {
    getConsoleOrders.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 500'), { response: { status: 500 } }));
    const { default: Page } = await import('../src/pages/console/ConsoleOrdersPage.vue');
    const w = mount(Page, { global: { stubs } });
    await flushPromises();
    expect(w.text()).toContain(CONSOLE_LOAD_ERROR);
    expect(w.text()).not.toMatch(/500|status code|Request failed/);
    getConsoleOrders.mockResolvedValueOnce([]);
    await w.findAll('button').find((b) => b.text() === 'Thử lại')!.trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Không có đơn nào phù hợp.');
  });

  it('orders: status filter speaks Vietnamese only', async () => {
    getConsoleOrders.mockResolvedValueOnce([]);
    const { default: Page } = await import('../src/pages/console/ConsoleOrdersPage.vue');
    const w = mount(Page, { global: { stubs } });
    await flushPromises();
    const options = w.findAll('option').map((o) => o.text());
    expect(options).toContain('Đang di chuyển');
    for (const option of options) expect(option).not.toMatch(CODE);
  });

  it('service areas: no invented areas when the server fails', async () => {
    getServiceAreas.mockRejectedValueOnce(new Error('Network Error'));
    const { default: Page } = await import('../src/pages/console/ServiceAreasPage.vue');
    const w = mount(Page, { global: { stubs } });
    await flushPromises();
    expect(w.text()).toContain(CONSOLE_LOAD_ERROR);
    expect(w.text()).not.toContain('Quận Ba Đình');
    expect(w.text()).not.toContain('Network Error');
  });
});
