import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { useAuthStore } from '../src/stores/auth';

// QA 25/11/2026: after "Xác nhận danh tính" the drawer kept showing the old "Chờ duyệt" record.
const api = vi.hoisted(() => ({ getVerifications: vi.fn(), getVerification: vi.fn(), approveVerification: vi.fn() }));
vi.mock('../src/api/admin-verifications.api', () => ({
  adminVerificationsApi: { ...api, getDocumentAccess: vi.fn(), rejectVerification: vi.fn() },
}));
vi.mock('../src/api/admin-customer-verifications.api', () => ({ adminCustomerVerificationsApi: { list: vi.fn(), detail: vi.fn(), getDocumentAccess: vi.fn(), approve: vi.fn(), reject: vi.fn() } }));
vi.mock('../src/api/vietnam-provinces.api', () => ({ vietnamProvincesApi: { getProvincesWithDistricts: vi.fn().mockResolvedValue([]) } }));

import ConsoleTechniciansPage from '../src/pages/console/ConsoleTechniciansPage.vue';

const record = (status: string) => ({
  id: 'v1', technicianId: 't1', status, submittedAt: '2026-11-25T11:25:00Z', documents: [],
  technician: { id: 't1', fullName: 'Ngo Viet Hoang', email: 'h@example.test', phoneNumber: '0394060729' },
});

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  useAuthStore().setAuth('token', { id: 'sm1', fullName: 'Quản lý', email: 'sm@example.test', role: 'service_manager', status: 'ACTIVE' } as never);
  api.getVerifications.mockResolvedValue({ data: [record('PENDING')], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } });
  api.getVerification.mockResolvedValue(record('PENDING'));
  api.approveVerification.mockResolvedValue(record('VERIFIED'));
});

describe('identity review drawer', () => {
  it('closes after the identity is confirmed, instead of staying on the old pending record', async () => {
    const w = mount(ConsoleTechniciansPage, { global: { stubs: { teleport: true } } });
    await flushPromises();
    await w.findAll('button').find((b) => b.text().includes('Ngo Viet Hoang'))!.trigger('click');
    await flushPromises();
    const confirm = w.findAll('button').find((b) => b.text() === 'Xác nhận danh tính');
    expect(confirm, 'the drawer is open with its confirm button').toBeDefined();
    await confirm!.trigger('click');
    await flushPromises();
    expect(api.approveVerification).toHaveBeenCalledWith('v1');
    expect(w.text()).not.toContain('Xác nhận danh tính');
    expect(w.text()).toContain('Đã xác nhận danh tính của Ngo Viet Hoang');
  });
});
