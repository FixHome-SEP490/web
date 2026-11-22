import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const { apiClientMock } = vi.hoisted(() => ({ apiClientMock: { get: vi.fn(), post: vi.fn() } }));
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ query: {}, params: {}, meta: { title: 'Linh kiện cần trả' } }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../src/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/client')>()),
  default: apiClientMock,
  apiClient: apiClientMock,
}));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'tech-1', role: 'TECHNICIAN' }, hasRole: () => true }) }));
vi.mock('../src/composables/usePartReturnsRefresh', () => ({ usePartReturnsRefresh: vi.fn() }));

import TechnicianPartReturnsPage from '../src/pages/technician/TechnicianPartReturnsPage.vue';

const claim = (id: string, partRequest: Record<string, unknown> | null) => ({
  id, status: 'in_progress', order: { id: `o-${id}`, code: `FH-${id}`, serviceName: 'Sửa điều hòa' }, partRequest,
});
const part = (overrides: Record<string, unknown> = {}) => ({
  id: 'pr', status: 'received', faultyReturnDueAt: '2099-01-01T00:00:00.000Z', faultyReturnedAt: null, faultyReturnChargedAt: null, ...overrides,
});
const mountWith = async (claims: unknown[]) => {
  apiClientMock.get.mockImplementation(async (url: string) => {
    if (url === '/part-returns/mine') return { data: { data: [] } };
    if (url === '/warranty-claims/mine') return { data: { data: claims, meta: { page: 1, pageSize: 100, total: claims.length } } };
    return { data: { data: [] } };
  });
  const wrapper = mount(TechnicianPartReturnsPage, { global: { plugins: [createPinia()], stubs: { 'router-link': { props: ['to'], template: '<a><slot /></a>' } } } });
  await flushPromises();
  return wrapper;
};

beforeEach(() => { vi.clearAllMocks(); setActivePinia(createPinia()); });

describe('faulty warranty parts on the technician returns page', () => {
  it('lists the faulty parts still to hand in, soonest deadline first, even when the ledger is empty', async () => {
    const wrapper = await mountWith([
      claim('later', part({ faultyReturnDueAt: '2099-06-01T00:00:00.000Z' })),
      claim('soon', part({ faultyReturnDueAt: '2099-02-01T00:00:00.000Z' })),
      claim('done', part({ faultyReturnedAt: '2026-11-20T00:00:00.000Z' })),
      claim('waiting', part({ status: 'ready' })),
      claim('none', null),
    ]);
    const section = wrapper.get('[data-testid="faulty-warranty-returns"]');
    expect(section.text()).toContain('Linh kiện hỏng cần nộp (bảo hành)');
    const rows = section.findAll('li');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('FH-soon');
    expect(rows[1].text()).toContain('FH-later');
  });

  it('flags an overdue part and one already charged to the wallet', async () => {
    const wrapper = await mountWith([
      claim('late', part({ faultyReturnDueAt: '2020-01-01T00:00:00.000Z' })),
      claim('charged', part({ faultyReturnDueAt: '2020-01-01T00:00:00.000Z', faultyReturnChargedAt: '2020-01-02T00:00:00.000Z' })),
    ]);
    const text = wrapper.get('[data-testid="faulty-warranty-returns"]').text();
    expect(text).toContain('Đã quá hạn nộp');
    expect(text).toContain('đã bị trừ ví');
  });

  it('shows nothing when no faulty part is left to hand in', async () => {
    const wrapper = await mountWith([claim('done', part({ faultyReturnedAt: '2026-11-20T00:00:00.000Z' }))]);
    expect(wrapper.find('[data-testid="faulty-warranty-returns"]').exists()).toBe(false);
  });
});
