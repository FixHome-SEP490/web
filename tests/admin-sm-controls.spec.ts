import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// BUG 173, 175, 176, 177: admin controls. The user detail can lock, notify one account and hand a
// warehouse to a service manager; the admin can broadcast a notice and switch SM permissions.
const api = vi.hoisted(() => ({
  getUsers: vi.fn(), getUser: vi.fn(), createTechnician: vi.fn(), updateStatus: vi.fn(),
  list: vi.fn(), update: vi.fn(),
  listSmPermissions: vi.fn(), setSmPermission: vi.fn(), broadcast: vi.fn(), notifyUser: vi.fn(),
  listBroadcasts: vi.fn(), recallBroadcast: vi.fn(),
}));
vi.mock('../src/api/admin-users.api', () => ({ adminUsersApi: { getUsers: api.getUsers, getUser: api.getUser, createTechnician: api.createTechnician, updateStatus: api.updateStatus } }));
vi.mock('../src/api/warehouses.api', () => ({ warehousesApi: { list: api.list, update: api.update } }));
vi.mock('../src/api/admin-controls.api', () => ({ adminControlsApi: { listSmPermissions: api.listSmPermissions, setSmPermission: api.setSmPermission, broadcast: api.broadcast, notifyUser: api.notifyUser, listBroadcasts: api.listBroadcasts, recallBroadcast: api.recallBroadcast } }));
import AdminUsersPage from '../src/pages/console/admin/AdminUsersPage.vue';
import AdminBroadcastPage from '../src/pages/console/admin/AdminBroadcastPage.vue';
import AdminSmPermissionsPage from '../src/pages/console/admin/AdminSmPermissionsPage.vue';
import { consoleNavigation } from '../src/components/console/console-navigation';

const sm = {
  id: 'sm-1', email: 'sm5@fixhome.vn', fullName: 'Quản lý 5', phoneNumber: null, role: 'service_manager',
  status: 'active', isActive: true, avatarUrl: null, bookingSuspendedUntil: null, permissions: [],
  createdAt: '2026-11-07T03:00:00Z', updatedAt: '2026-11-12T08:30:00Z',
};
const wh = (id: string, name: string, responsibleUserId: string) => ({ id, name, address: 'x', latitude: 10, longitude: 106, status: 'active', responsibleUserId, createdAt: '', updatedAt: '' });

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  api.getUsers.mockResolvedValue({ data: [sm], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } });
  api.getUser.mockResolvedValue(sm);
  api.listBroadcasts.mockResolvedValue([]);
  api.list.mockResolvedValue([wh('w1', 'Kho Thủ Đức', 'sm-1'), wh('w2', 'Kho Quận 7', 'sm-2')]);
});

async function openSmDetail() {
  const w = mount(AdminUsersPage, { attachTo: document.body });
  await flushPromises();
  await w.get('table tbody button').trigger('click');
  await flushPromises();
  return w;
}

describe('User detail actions (BUG 173, 175)', () => {
  it('shows the warehouses a service manager runs and hands over another one', async () => {
    const w = await openSmDetail();
    expect(w.get('[data-testid="user-detail-warehouses"]').text()).toContain('Kho Thủ Đức');
    api.update.mockResolvedValue(wh('w2', 'Kho Quận 7', 'sm-1'));
    await w.get('[data-testid="user-detail-assign-select"]').setValue('w2');
    await w.get('[data-testid="user-detail-assign"]').trigger('click');
    await flushPromises();
    expect(api.update).toHaveBeenCalledWith('w2', { responsibleUserId: 'sm-1' });
    expect(w.get('[data-testid="user-detail-warehouses"]').text()).toContain('Kho Quận 7');
  });

  it('sends a notice to this one account', async () => {
    api.notifyUser.mockResolvedValue(undefined);
    const w = await openSmDetail();
    await w.get('[data-testid="user-detail-notify-title"]').setValue('  Nhắc lịch 🔔 ');
    await w.get('[data-testid="user-detail-notify-message"]').setValue('Họp lúc 9h');
    await w.get('[data-testid="user-detail-notify-send"]').trigger('submit');
    await w.get('form[aria-label="Gửi thông báo"]').trigger('submit');
    await flushPromises();
    expect(api.notifyUser).toHaveBeenCalledWith({ userId: 'sm-1', title: 'Nhắc lịch 🔔', message: 'Họp lúc 9h' });
    expect(w.get('[data-testid="user-detail-notice"]').text()).toContain('Đã gửi thông báo');
  });

  it('locks the account from the detail through the confirm dialog', async () => {
    api.updateStatus.mockResolvedValue({ ...sm, status: 'locked' });
    const w = await openSmDetail();
    await w.get('[data-testid="user-detail-toggle"]').trigger('click');
    await flushPromises();
    const dialog = w.findComponent({ name: 'FhConfirmDialog' });
    expect(dialog.props('open')).toBe(true);
    dialog.vm.$emit('confirm');
    await flushPromises();
    expect(api.updateStatus).toHaveBeenCalledWith('sm-1', { status: 'locked' });
    w.unmount();
  });
});

describe('Broadcast (BUG 176)', () => {
  it('asks for confirmation, then sends to the chosen group and reports the count', async () => {
    api.broadcast.mockResolvedValue(1234);
    const w = mount(AdminBroadcastPage);
    expect(w.get('[data-testid="broadcast-submit"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="broadcast-audience"]').setValue('technician');
    await w.get('[data-testid="broadcast-title"]').setValue(' Bảo trì ');
    await w.get('[data-testid="broadcast-message"]').setValue('Hệ thống bảo trì 23h ✨');
    await w.get('form').trigger('submit');
    expect(api.broadcast).not.toHaveBeenCalled();
    await w.get('[data-testid="broadcast-confirm"]').trigger('click');
    await flushPromises();
    expect(api.broadcast).toHaveBeenCalledWith({ title: 'Bảo trì', message: 'Hệ thống bảo trì 23h ✨', audience: 'technician' });
    expect(w.get('[data-testid="broadcast-result"]').text()).toContain('1.234');
  });

  it('lists sent broadcasts and recalls one after confirmation', async () => {
    const KEY = '2026-11-19 01:10:22.123456+00';
    api.listBroadcasts.mockResolvedValue([{ key: KEY, title: 'Bảo trì', message: 'Tối nay', sentAt: '2026-11-18T18:10:22Z', recipients: 7, read: 2 }]);
    api.recallBroadcast.mockResolvedValue(7);
    const w = mount(AdminBroadcastPage);
    await flushPromises();
    expect(w.get('[data-testid="broadcast-sent"]').text()).toContain('7 người nhận · 2 đã xem');
    await w.get(`[data-testid="broadcast-recall-${KEY}"]`).trigger('click');
    const dialog = w.findComponent({ name: 'FhConfirmDialog' });
    expect(dialog.props('open')).toBe(true);
    dialog.vm.$emit('confirm');
    await flushPromises();
    expect(api.recallBroadcast).toHaveBeenCalledWith(KEY);
    expect(w.get('[data-testid="broadcast-result"]').text()).toContain('Đã thu hồi');
    expect(w.find('[data-testid="broadcast-sent"]').exists()).toBe(false);
  });

  it('caps title and message length in the inputs', () => {
    const w = mount(AdminBroadcastPage);
    expect(w.get('[data-testid="broadcast-title"]').attributes('maxlength')).toBe('200');
    expect(w.get('[data-testid="broadcast-message"]').attributes('maxlength')).toBe('2000');
  });
});

describe('Service manager permissions (BUG 177)', () => {
  it('lists the switches by group and flips one', async () => {
    api.listSmPermissions.mockResolvedValue([
      { code: 'order:cancel', group: 'Đơn sửa chữa', label: 'Huỷ đơn thay khách hoặc thợ', granted: true },
      { code: 'audit:read', group: 'Hệ thống', label: 'Xem nhật ký thao tác', granted: false },
    ]);
    api.setSmPermission.mockResolvedValue([
      { code: 'order:cancel', group: 'Đơn sửa chữa', label: 'Huỷ đơn thay khách hoặc thợ', granted: false },
      { code: 'audit:read', group: 'Hệ thống', label: 'Xem nhật ký thao tác', granted: false },
    ]);
    const w = mount(AdminSmPermissionsPage);
    await flushPromises();
    const sw = w.get('[data-testid="sm-perm-order:cancel"]');
    expect(sw.attributes('aria-checked')).toBe('true');
    await sw.trigger('click');
    await flushPromises();
    expect(api.setSmPermission).toHaveBeenCalledWith('order:cancel', false);
    expect(w.get('[data-testid="sm-perm-order:cancel"]').attributes('aria-checked')).toBe('false');
    expect(w.text()).toContain('Đã tắt');
  });

  it('is in the admin menu only', () => {
    const admin = consoleNavigation('ADMIN').flatMap((g) => g.items.map((i) => i.path));
    expect(admin).toEqual(expect.arrayContaining(['/console/admin/sm-permissions', '/console/admin/broadcast']));
    const smPaths = consoleNavigation('SERVICE_MANAGER').flatMap((g) => g.items.map((i) => i.path));
    expect(smPaths).not.toContain('/console/admin/sm-permissions');
  });
});
