import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// Admin users page: the role and status filters send values the server accepts, a locked account can be
// filtered, one account opens in a detail box, and a technician account needs a valid Vietnamese mobile.
const { getUsers, getUser, createTechnician, updateStatus } = vi.hoisted(() => ({
  getUsers: vi.fn(), getUser: vi.fn(), createTechnician: vi.fn(), updateStatus: vi.fn(),
}));
vi.mock('../src/api/admin-users.api', () => ({ adminUsersApi: { getUsers, getUser, createTechnician, updateStatus } }));
import AdminUsersPage from '../src/pages/console/admin/AdminUsersPage.vue';

const user = {
  id: 'u1', email: 'customer10@fixhome.vn', fullName: 'Khách hàng Demo 10', phoneNumber: '0901234567', role: 'customer',
  status: 'locked', isActive: false, avatarUrl: null, bookingSuspendedUntil: null, permissions: [],
  createdAt: '2026-11-07T03:00:00Z', updatedAt: '2026-11-12T08:30:00Z',
};
const mountPage = async () => {
  const w = mount(AdminUsersPage, { attachTo: document.body });
  await flushPromises();
  return w;
};

describe('Admin users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    getUsers.mockResolvedValue({ data: [user], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } });
    getUser.mockResolvedValue({ ...user, phoneNumber: '0909999999' });
  });

  it('sends the role in the form the server accepts and can filter locked accounts', async () => {
    const w = await mountPage();
    await w.get('select[aria-label="Vai trò"]').setValue('service_manager');
    await flushPromises();
    expect(getUsers).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'service_manager' }));
    const statuses = w.get('select[aria-label="Trạng thái"]').findAll('option').map((o) => o.element.value);
    expect(statuses).toContain('locked');
    await w.get('select[aria-label="Trạng thái"]').setValue('locked');
    await flushPromises();
    expect(getUsers).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'locked' }));
  });

  it('opens one account with the details read fresh from the server', async () => {
    const w = await mountPage();
    await w.get('table tbody button').trigger('click');
    await flushPromises();
    expect(getUser).toHaveBeenCalledWith('u1');
    const box = w.get('[data-testid="user-detail"]').text();
    for (const piece of ['Khách hàng Demo 10', 'customer10@fixhome.vn', '0909999999', 'Đã khoá', 'Khách hàng']) expect(box).toContain(piece);
  });

  it('refuses a technician phone that is not a Vietnamese mobile before calling the server', async () => {
    const w = await mountPage();
    await w.findAll('button').find((b) => b.text().includes('Tạo tài khoản thợ'))!.trigger('click');
    const inputs = w.findAll('[role="dialog"] input');
    await inputs[0].setValue('Thợ Mới');
    await inputs[1].setValue('tho.moi@fixhome.test');
    await inputs[2].setValue('abc');
    await w.get('[role="dialog"] form').trigger('submit');
    await flushPromises();
    expect(createTechnician).not.toHaveBeenCalled();
    expect(w.get('[role="dialog"]').text()).toContain('Số điện thoại phải là số di động Việt Nam 10 số');
    createTechnician.mockResolvedValue({ user: { ...user, role: 'technician', email: 'tho.moi@fixhome.test' }, tempPassword: 'Tmp-123456' });
    await inputs[2].setValue('090 123 4567');
    await w.get('[role="dialog"] form').trigger('submit');
    await flushPromises();
    expect(createTechnician).toHaveBeenCalledWith({ email: 'tho.moi@fixhome.test', fullName: 'Thợ Mới', phoneNumber: '0901234567' });
  });
});
