// Admin review of customer identity checks (PO 14/10/2026): the review page has
// two tabs, "Kỹ thuật viên" and "Khách hàng". The customer tab lists waiting
// checks first, searches on the server, opens a drawer with both CCCD photos
// and approves or rejects with a reason of at least 5 characters.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  getDocumentAccess: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  getVerifications: vi.fn(),
}));
vi.mock('../src/api/admin-customer-verifications.api', () => ({
  adminCustomerVerificationsApi: {
    list: api.list,
    detail: api.detail,
    getDocumentAccess: api.getDocumentAccess,
    approve: api.approve,
    reject: api.reject,
  },
}));
vi.mock('../src/api/admin-verifications.api', () => ({
  adminVerificationsApi: { getVerifications: api.getVerifications, getVerification: vi.fn(), getDocumentAccess: vi.fn(), approveVerification: vi.fn(), rejectVerification: vi.fn() },
}));
vi.mock('../src/api/vietnam-provinces.api', () => ({ vietnamProvincesApi: { getProvincesWithDistricts: vi.fn().mockResolvedValue([]) } }));

import ConsoleTechniciansPage from '../src/pages/console/ConsoleTechniciansPage.vue';
import router from '../src/router';

const stubs = { teleport: true };

const pending = {
  id: 'v1',
  customerId: 'c1',
  status: 'pending',
  fullName: 'Nguyễn Văn An',
  dateOfBirth: '1990-05-20',
  gender: 'male',
  citizenIdNumber: '079090000001',
  address: '12 Lê Lợi, TP. Hồ Chí Minh',
  submittedAt: '2026-10-14T09:00:00Z',
  reviewedAt: null,
  rejectionReason: null,
  verifiedFullName: null,
  documents: [
    { id: 'd1', documentType: 'citizen_id_front', fileName: 'cccd-mat-truoc.jpg', fileSize: 1000, mimeType: 'image/jpeg', createdAt: '2026-10-14T09:00:00Z' },
    { id: 'd2', documentType: 'citizen_id_back', fileName: 'cccd-mat-sau.jpg', fileSize: 1000, mimeType: 'image/jpeg', createdAt: '2026-10-14T09:00:00Z' },
  ],
  customer: { id: 'c1', fullName: 'Nguyễn Văn An', email: 'an@example.invalid', phoneNumber: '0904000001', status: 'active' },
  reviewedBy: null,
};

async function openCustomerTab(): Promise<VueWrapper> {
  const w = mount(ConsoleTechniciansPage, { global: { stubs } });
  await flushPromises();
  await w.findAll('[role="tab"]').find((t) => t.text().includes('Khách hàng'))!.trigger('click');
  await flushPromises();
  return w;
}

const button = (w: VueWrapper, text: string) => w.findAll('button').find((b) => b.text().trim() === text)!;

beforeEach(() => {
  vi.clearAllMocks();
  api.getVerifications.mockResolvedValue({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  api.list.mockResolvedValue({ items: [pending], total: 1, page: 1, pageSize: 10 });
  api.getDocumentAccess.mockImplementation(async (_id: string, docId: string) => `https://storage.example/${docId}`);
  api.approve.mockResolvedValue({ ...pending, status: 'verified' });
  api.reject.mockResolvedValue({ ...pending, status: 'rejected' });
});

describe('Admin identity review page', () => {
  it('is admin only, named for both kinds of review, with two tabs', async () => {
    const route = router.resolve('/console/technicians').matched.at(-1);
    expect(route?.meta.roles).toEqual(['ADMIN']);
    expect(route?.meta.title).toBe('Duyệt xác minh danh tính');
    const w = mount(ConsoleTechniciansPage, { global: { stubs } });
    await flushPromises();
    expect(w.text()).toContain('Duyệt xác minh danh tính');
    expect(w.findAll('[role="tab"]').map((t) => t.text())).toEqual(['Kỹ thuật viên', 'Khách hàng']);
    expect(api.getVerifications).toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
  });

  it('lists waiting customer checks first', async () => {
    const w = await openCustomerTab();
    expect(api.list).toHaveBeenCalledWith({ status: 'pending', search: '', page: 1, limit: 10 });
    const row = w.get('[data-testid="cv-row-v1"]');
    expect(row.text()).toContain('Nguyễn Văn An');
    expect(row.text()).toContain('079090000001');
    expect(row.text()).toContain('Đang chờ duyệt');
  });

  it('filters by status and searches on the server', async () => {
    const w = await openCustomerTab();
    await w.get('[data-testid="cv-status"]').setValue('all');
    await flushPromises();
    expect(api.list).toHaveBeenLastCalledWith({ status: undefined, search: '', page: 1, limit: 10 });
    await w.get('input[type="search"]').setValue('  0790  ');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(api.list).toHaveBeenLastCalledWith({ status: undefined, search: '0790', page: 1, limit: 10 });
  });

  it('shows the details and both CCCD photos in the drawer', async () => {
    const w = await openCustomerTab();
    await button(w, 'Nguyễn Văn An').trigger('click');
    await flushPromises();
    const drawer = w.get('[data-testid="customer-verification-drawer"]');
    expect(drawer.text()).toContain('20/05/1990');
    expect(drawer.text()).toContain('Nam');
    expect(drawer.text()).toContain('12 Lê Lợi, TP. Hồ Chí Minh');
    expect(api.getDocumentAccess).toHaveBeenCalledWith('v1', 'd1');
    expect(api.getDocumentAccess).toHaveBeenCalledWith('v1', 'd2');
    const images = drawer.findAll('img').map((img) => img.attributes('src'));
    expect(images).toEqual(['https://storage.example/d1', 'https://storage.example/d2']);
  });

  it('approves a waiting check and reads the list again', async () => {
    const w = await openCustomerTab();
    const calls = api.list.mock.calls.length;
    await w.get('[data-testid="cv-approve"]').trigger('click');
    await flushPromises();
    expect(api.approve).toHaveBeenCalledWith('v1');
    expect(w.get('[data-testid="cv-message"]').text()).toContain('Đã duyệt xác minh danh tính của Nguyễn Văn An');
    expect(api.list.mock.calls.length).toBeGreaterThan(calls);
  });

  it('needs a reason of at least 5 characters to reject', async () => {
    const w = await openCustomerTab();
    await button(w, 'Nguyễn Văn An').trigger('click');
    await flushPromises();
    await w.get('[data-testid="cv-drawer-reject"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="cv-reject-reason"]').setValue('  mờ ');
    await button(w, 'Từ chối hồ sơ').trigger('click');
    await flushPromises();
    expect(api.reject).not.toHaveBeenCalled();
    expect(w.get('[data-testid="cv-reject-error"]').text()).toContain('ít nhất 5 ký tự');

    await w.get('[data-testid="cv-reject-reason"]').setValue('Ảnh mặt sau bị mờ, vui lòng chụp lại.');
    await button(w, 'Từ chối hồ sơ').trigger('click');
    await flushPromises();
    expect(api.reject).toHaveBeenCalledWith('v1', 'Ảnh mặt sau bị mờ, vui lòng chụp lại.');
    expect(w.get('[data-testid="cv-message"]').text()).toContain('Đã từ chối hồ sơ của Nguyễn Văn An');
    expect(w.find('[data-testid="customer-verification-drawer"]').exists()).toBe(false);
  });

  it('shows the server reason, not a code, when a decision is refused', async () => {
    api.approve.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: { status: 409, data: { success: false, error: { code: 'CONFLICT', message: 'Hồ sơ này đã được xử lý.' } } },
      }),
    );
    const w = await openCustomerTab();
    await w.get('[data-testid="cv-approve"]').trigger('click');
    await flushPromises();
    const text = w.get('[data-testid="cv-message"]').text();
    expect(text).toContain('Hồ sơ này đã được xử lý.');
    expect(text).not.toMatch(/409|CONFLICT/);
  });
});
