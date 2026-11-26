import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const { pushMock, toastMock, routeQuery, apiClientMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
  routeQuery: { orderId: undefined as string | undefined },
  apiClientMock: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    useRoute: () => ({ query: routeQuery, params: { id: 'order-stopped' }, meta: { title: 'Linh kiện cần trả' } }),
    useRouter: () => ({ push: pushMock }),
  };
});

vi.mock('vue-sonner', () => ({
  toast: toastMock,
}));

vi.mock('../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/client')>();
  return {
    ...actual,
    default: apiClientMock,
    apiClient: apiClientMock,
  };
});

vi.mock('../src/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'tech-1', fullName: 'Phạm Đức Toàn', role: 'TECHNICIAN' },
    hasRole: (r: string) => r === 'TECHNICIAN',
  }),
}));

vi.mock('../src/composables/usePartReturnsRefresh', () => ({
  usePartReturnsRefresh: vi.fn(),
}));

import { usePartReturnsRefresh } from '../src/composables/usePartReturnsRefresh';
import TechnicianPartReturnsPage from '../src/pages/technician/TechnicianPartReturnsPage.vue';
import DeclarePartReturnModal from '../src/components/technician/DeclarePartReturnModal.vue';
import TechnicianJobDetailPage from '../src/pages/technician/TechnicianJobDetailPage.vue';
import router from '../src/router';
import type { PartCustodyReturnRecord } from '../src/api/part-requests.api';

const mockOrder1 = {
  id: 'order-1',
  code: 'FH-20261119-A37F7F98',
  serviceName: 'Sửa điều hòa',
  status: 'COMPLETED',
  paymentStatus: 'PAID',
  laborTotal: 0,
  partsTotal: 0,
  grandTotal: 0,
  completedAt: '2026-11-19T15:30:00Z',
  historical: false,
};

const mockOrder2 = {
  id: 'order-2',
  code: 'FH-20261118-9C4E2D11',
  serviceName: 'Lắp đặt máy lọc nước',
  status: 'COMPLETED',
  paymentStatus: 'PAID',
  laborTotal: 0,
  partsTotal: 0,
  grandTotal: 0,
  completedAt: '2026-11-18T11:20:00Z',
  historical: false,
};

const mockRecord1: PartCustodyReturnRecord = {
  id: 'c-1',
  orderId: 'order-1',
  partRequestId: 'req-1',
  partRequestItemId: 'item-1',
  partNameSnapshot: 'Lõi lọc nước PP',
  issuedQty: 2,
  usedQty: 1,
  declaredQty: 0,
  managerAcceptedQty: 0,
  outstandingQty: 1, // needDeclare = 1, awaiting = 0
  version: 1,
};

const mockRecord2: PartCustodyReturnRecord = {
  id: 'c-2',
  orderId: 'order-1',
  partRequestId: 'req-1',
  partRequestItemId: 'item-2',
  partNameSnapshot: 'Ống đồng 6.35',
  issuedQty: 5,
  usedQty: 5,
  declaredQty: 0,
  managerAcceptedQty: 0,
  outstandingQty: 0, // completed = 5
  version: 1,
};

const mockRecord3: PartCustodyReturnRecord = {
  id: 'c-3',
  orderId: 'order-1',
  partRequestId: 'req-1',
  partRequestItemId: 'item-3',
  partNameSnapshot: 'Van điện từ',
  issuedQty: 1,
  usedQty: 0,
  declaredQty: 1,
  managerAcceptedQty: 0,
  outstandingQty: 1, // needDeclare = 0, awaiting = 1
  version: 1,
};

const mockRecord4: PartCustodyReturnRecord = {
  id: 'c-4',
  orderId: 'order-2',
  partRequestId: 'req-2',
  partRequestItemId: 'item-4',
  partNameSnapshot: 'Bơm tăng áp',
  issuedQty: 1,
  usedQty: 0,
  declaredQty: 1,
  managerAcceptedQty: 0,
  outstandingQty: 1, // needDeclare = 0, awaiting = 1
  version: 1,
};

// What the server answers for /part-returns/mine?status=... over the ledger r1..r4 (BUG DETECTOR 302).
const ledger = [mockRecord1, mockRecord2, mockRecord3, mockRecord4];
const groupOf = (r: PartCustodyReturnRecord) => (r.outstandingQty === 0 ? 'completed' : r.declaredQty > 0 ? 'awaiting_manager' : 'need_declare');
const mineAnswer = (status: string) => ({
  data: {
    data: status === 'all' ? ledger : ledger.filter((r) => groupOf(r) === status),
    meta: {
      status, page: 1, pageSize: 100,
      groups: {
        need_declare: { qty: 1, rows: 1, orders: 1 },
        awaiting_manager: { qty: 2, rows: 2, orders: 2 },
        completed: { qty: 5, rows: 1, orders: 1 },
        exception: { qty: 0, rows: 0, orders: 0 },
        all: { qty: 8, rows: 4, orders: 2 },
      },
    },
  },
});
const statusOf = (config?: { params?: { status?: string } }) => config?.params?.status ?? 'all';

describe('Technician Part Returns Feature', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    routeQuery.orderId = undefined;
  });

  describe('Route and Authorization', () => {
    it('registers /tech/part-returns route with TECHNICIAN access', () => {
      const returnRoute = router.getRoutes().find((r) => r.name === 'tech-part-returns');
      expect(returnRoute).toBeDefined();
      expect(returnRoute?.path).toBe('/tech/part-returns');
      expect(returnRoute?.meta?.roles).toContain('TECHNICIAN');
      expect(returnRoute?.meta?.title).toBe('Linh kiện cần trả');
    });
  });

  describe('TechnicianPartReturnsPage component', () => {
    beforeEach(() => {
      apiClientMock.get.mockImplementation((url: string, config?: { params?: { status?: string } }) => {
        if (url === '/part-returns/mine') {
          return Promise.resolve(mineAnswer(statusOf(config)));
        }
        if (url === '/service-orders/order-1/part-returns') {
          return Promise.resolve({ data: { data: [mockRecord1, mockRecord2, mockRecord3] } });
        }
        if (url === '/service-orders/order-2/part-returns') {
          return Promise.resolve({ data: { data: [mockRecord4] } });
        }
        if (url === '/service-orders/order-1') {
          return Promise.resolve({ data: { data: mockOrder1 } });
        }
        if (url === '/service-orders/order-2') {
          return Promise.resolve({ data: { data: mockOrder2 } });
        }
        return Promise.reject(new Error(`Unhandled GET: ${url}`));
      });
    });

    it('loads custody records and correctly calculates stat cards and pills', async () => {
      const wrapper = mount(TechnicianPartReturnsPage);
      await flushPromises();

      // One read of the open tab with every group's counters; no ledger read per order.
      expect(apiClientMock.get).toHaveBeenCalledWith('/part-returns/mine', { params: { status: 'all', page: 1, pageSize: 100 } });
      expect(apiClientMock.get).not.toHaveBeenCalledWith('/service-orders/order-1/part-returns');
      expect(apiClientMock.get).not.toHaveBeenCalledWith('/service-orders/order-2/part-returns');

      // Check stat cards
      expect(wrapper.find('[data-testid="stat-card-need-declare"]').text()).toContain('1 linh kiện');
      expect(wrapper.find('[data-testid="stat-card-awaiting"]').text()).toContain('2 linh kiện');
      expect(wrapper.find('[data-testid="stat-card-completed"]').text()).toContain('5 linh kiện');

      // Check selected order details
      expect(wrapper.find('[data-testid="selected-order-code"]').text()).toContain('FH-20261119-A37F7F98');
      expect(wrapper.find('[data-testid="selected-job-panel"]').text()).toContain('Sửa điều hòa');

      // Check parts table rows
      expect(wrapper.find('[data-testid="part-row-item-1"]').text()).toContain('Lõi lọc nước PP');
      expect(wrapper.find('[data-testid="part-row-item-1"]').text()).toContain('Cần khai trả');

      expect(wrapper.find('[data-testid="part-row-item-2"]').text()).toContain('Ống đồng 6.35');
      expect(wrapper.find('[data-testid="part-row-item-2"]').text()).toContain('Đã hoàn tất');

      expect(wrapper.find('[data-testid="part-row-item-3"]').text()).toContain('Van điện từ');
      expect(wrapper.find('[data-testid="part-row-item-3"]').text()).toContain('Chờ xác nhận');

      wrapper.unmount();
    });

    it('counts settled parts from the server, which the open list never carries', async () => {
      const base = apiClientMock.get.getMockImplementation()!;
      apiClientMock.get.mockImplementation((url: string, config?: { params?: { status?: string } }) => {
        if (url !== '/part-returns/mine') return base(url);
        const answer = mineAnswer(statusOf(config));
        answer.data.meta.groups.completed = { qty: 12, rows: 4, orders: 3 };
        return Promise.resolve(answer);
      });
      const wrapper = mount(TechnicianPartReturnsPage);
      await flushPromises();
      expect(wrapper.find('[data-testid="stat-card-completed"]').text()).toContain('12 linh kiện');
      wrapper.unmount();
    });

    it('BUG DETECTOR 302: the "Đã hoàn tất" tab reads status=completed and lists the settled lines', async () => {
      const wrapper = mount(TechnicianPartReturnsPage);
      await flushPromises();
      const tab = wrapper.findAll('button').find((b) => b.text().replace(/\s+/g, '') === 'Đãhoàntất1');
      expect(tab!.text()).toContain('1');
      await tab!.trigger('click');
      await flushPromises();
      expect(apiClientMock.get).toHaveBeenCalledWith('/part-returns/mine', { params: { status: 'completed', page: 1, pageSize: 100 } });
      const cards = wrapper.findAll('[data-testid^="job-card-"]');
      expect(cards).toHaveLength(1);
      expect(cards[0].text()).toContain('FH-20261119-A37F7F98');
      expect(wrapper.find('[data-testid="part-row-item-2"]').text()).toContain('Đã hoàn tất');
      expect(wrapper.find('[data-testid="part-row-item-1"]').exists()).toBe(false);
      // The counters stay the server's whatever tab is open.
      expect(wrapper.find('[data-testid="stat-card-need-declare"]').text()).toContain('1 linh kiện');
      expect(wrapper.find('[data-testid="stat-card-awaiting"]').text()).toContain('2 linh kiện');
      wrapper.unmount();
    });

    it('groups lines by the server returnStatus and marks a line whose usage is not recorded yet', async () => {
      const base = apiClientMock.get.getMockImplementation()!;
      const partly = { ...mockRecord3, id: 'c-5', partRequestItemId: 'item-5', issuedQty: 3, declaredQty: 1, outstandingQty: 3, returnStatus: 'declared' };
      const fresh = { ...mockRecord1, usedQty: 0, outstandingQty: 2, usageRecorded: false, returnStatus: 'outstanding' };
      apiClientMock.get.mockImplementation((url: string, config?: { params?: { status?: string } }) => url === '/part-returns/mine'
        ? Promise.resolve({ data: { data: [fresh, partly], meta: mineAnswer(statusOf(config)).data.meta } })
        : base(url));
      const wrapper = mount(TechnicianPartReturnsPage);
      await flushPromises();
      // Declared but not all of it: still the manager's group (PO), not "Cần khai trả".
      expect(wrapper.find('[data-testid="part-row-item-5"]').text()).toContain('Chờ xác nhận');
      expect(wrapper.find('[data-testid="part-row-item-1"]').text()).toContain('Cần khai trả');
      expect(wrapper.find('[data-testid="usage-missing-item-1"]').text()).toBe('Chưa ghi dùng');
      expect(wrapper.find('[data-testid="usage-missing-item-5"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('shows settled guidance instead of filter-empty state when open list is empty and completedQty > 0', async () => {
      apiClientMock.get.mockImplementation((url: string) => {
        if (url === '/part-returns/mine') {
          const zero = { qty: 0, rows: 0, orders: 0 };
          return Promise.resolve({ data: { data: [], meta: { groups: { need_declare: zero, awaiting_manager: zero, completed: { qty: 9, rows: 3, orders: 0 }, exception: zero, all: zero } } } });
        }
        return Promise.resolve({ data: { data: [] } });
      });
      const wrapper = mount(TechnicianPartReturnsPage);
      await flushPromises();

      expect(wrapper.find('[data-testid="stat-card-completed"]').text()).toContain('9 linh kiện');
      expect(wrapper.find('[data-testid="stat-card-completed"]').text()).toContain('Đã tất toán ở các đơn trước');
      expect(wrapper.find('[data-testid="job-list-empty"]').text()).toContain('Không còn công việc cần trả linh kiện');
      expect(wrapper.find('[data-testid="job-list-empty"]').text()).toContain('9 linh kiện');
      expect(wrapper.find('[data-testid="job-detail-column"]').text()).toContain('Đã hoàn tất đối soát toàn bộ');

      wrapper.unmount();
    });

    it('refreshes silently on focus/resync without flashing loading skeletons', async () => {
      const wrapper = mount(TechnicianPartReturnsPage);
      await flushPromises();

      const refreshCallback = vi.mocked(usePartReturnsRefresh).mock.calls[0]?.[0];
      expect(refreshCallback).toBeTypeOf('function');

      let resolveMine!: (val: unknown) => void;
      apiClientMock.get.mockImplementationOnce(() => new Promise((resolve) => { resolveMine = resolve; }));

      const refreshPromise = refreshCallback!();
      await Promise.resolve();

      expect(wrapper.find('[aria-busy="true"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="stat-card-completed"]').text()).toContain('5 linh kiện');
      expect(wrapper.findAll('[data-testid^="job-card-"]')).toHaveLength(2);

      resolveMine(mineAnswer('all'));
      await refreshPromise;
      await flushPromises();

      wrapper.unmount();
    });

    it('filters by status tab when clicking on filter buttons', async () => {
      const wrapper = mount(TechnicianPartReturnsPage);
      await flushPromises();

      // Initially shows all 2 orders
      expect(wrapper.findAll('[data-testid^="job-card-"]')).toHaveLength(2);

      // Click "Cần khai trả"
      const needDeclareBtn = wrapper.findAll('button').find((b) => b.text().includes('Cần khai trả') && b.text().includes('1'));
      expect(needDeclareBtn).toBeDefined();
      await needDeclareBtn!.trigger('click');
      await flushPromises();

      // Only order-1 has needDeclareQty > 0
      const filteredCards = wrapper.findAll('[data-testid^="job-card-"]');
      expect(filteredCards).toHaveLength(1);
      expect(filteredCards[0].text()).toContain('FH-20261119-A37F7F98');

      wrapper.unmount();
    });

    it('filters orders by search query', async () => {
      const wrapper = mount(TechnicianPartReturnsPage);
      await flushPromises();

      const searchInput = wrapper.find('input[data-testid="search-input"]');
      await searchInput.setValue('lọc nước');
      await flushPromises();

      const filteredCards = wrapper.findAll('[data-testid^="job-card-"]');
      // Both match: order-1 has part "Lõi lọc nước PP", order-2 has service "Lắp đặt máy lọc nước"
      expect(filteredCards.length).toBeGreaterThanOrEqual(1);

      await searchInput.setValue('Van điện từ');
      await flushPromises();
      const matchVan = wrapper.findAll('[data-testid^="job-card-"]');
      expect(matchVan).toHaveLength(1);
      expect(matchVan[0].text()).toContain('FH-20261119-A37F7F98');

      wrapper.unmount();
    });

    it('auto-selects order specified in route query', async () => {
      routeQuery.orderId = 'order-2';
      const wrapper = mount(TechnicianPartReturnsPage);
      await flushPromises();

      expect(wrapper.find('[data-testid="selected-order-code"]').text()).toContain('FH-20261118-9C4E2D11');
      expect(wrapper.find('[data-testid="selected-job-panel"]').text()).toContain('Lắp đặt máy lọc nước');

      wrapper.unmount();
    });

    it('navigates to job detail when clicking "Xem chi tiết công việc"', async () => {
      const wrapper = mount(TechnicianPartReturnsPage);
      await flushPromises();

      const detailBtn = wrapper.find('[data-testid="view-job-detail-btn"]');
      await detailBtn.trigger('click');

      expect(pushMock).toHaveBeenCalledWith('/tech/jobs/order-1');
      wrapper.unmount();
    });

    it('renders unavailable state when backend returns 403 or 503', async () => {
      apiClientMock.get.mockImplementationOnce(() => Promise.reject({ response: { status: 503 } }));
      const wrapper = mount(TechnicianPartReturnsPage);
      await flushPromises();

      expect(wrapper.find('[data-testid="part-returns-unavailable"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('Tính năng hoàn trả linh kiện chưa được kích hoạt');

      wrapper.unmount();
    });

    it('renders error state and retries on general failure', async () => {
      apiClientMock.get.mockImplementationOnce(() => Promise.reject(new Error('Network error')));
      const wrapper = mount(TechnicianPartReturnsPage);
      await flushPromises();

      expect(wrapper.find('[data-testid="part-returns-error"]').exists()).toBe(true);

      // Clicking retry
      apiClientMock.get.mockImplementation((url: string) => {
        if (url === '/part-returns/mine') {
          return Promise.resolve({ data: { data: [] } });
        }
        return Promise.resolve({ data: { data: [] } });
      });

      await wrapper.find('[data-testid="part-returns-error"] button').trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-testid="part-returns-error"]').exists()).toBe(false);
      wrapper.unmount();
    });
  });

  describe('DeclarePartReturnModal component', () => {
    it('validates quantity, confirms step, and submits with idempotencyKey and expectedVersion', async () => {
      apiClientMock.post.mockResolvedValueOnce({ data: { data: { ...mockRecord1, declaredQty: 1 } } });

      const wrapper = mount(DeclarePartReturnModal, {
        props: {
          open: true,
          orderId: 'order-1',
          items: [mockRecord1],
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });
      await flushPromises();

      expect(wrapper.find('[data-testid="declare-part-return-modal"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('Lõi lọc nước PP');
      expect(wrapper.text()).toContain('Được phép khai');

      // Max quantity is 1
      const input = wrapper.find('input[data-testid="declare-qty-input"]');
      expect((input.element as HTMLInputElement).value).toBe('1');

      // Next step
      const nextBtn = wrapper.find('[data-testid="declare-next-button"]');
      await nextBtn.trigger('click');
      await flushPromises();

      // Step 2: Confirm
      expect(wrapper.find('[data-testid="declare-step-confirm"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('Xác nhận gửi khai trả');

      // Submit
      const submitBtn = wrapper.find('[data-testid="declare-submit-button"]');
      await submitBtn.trigger('click');
      await flushPromises();

      expect(apiClientMock.post).toHaveBeenCalledWith(
        '/part-requests/req-1/items/item-1/declare-return',
        expect.objectContaining({
          quantity: 1,
          expectedVersion: 1,
          idempotencyKey: expect.stringMatching(/^tech-return-/),
        }),
      );

      expect(toastMock.success).toHaveBeenCalledWith(
        'Đã khai trả linh kiện. Vui lòng chờ quản lý xác nhận thực nhận.',
      );

      expect(wrapper.emitted('success')).toBeTruthy();
      expect(wrapper.emitted('close')).toBeTruthy();

      wrapper.unmount();
    });

    it('handles 409 Conflict safely by refreshing data and prompting user to re-confirm', async () => {
      // First POST returns 409
      apiClientMock.post.mockRejectedValueOnce({ response: { status: 409 } });
      // Refresh GET returns updated version
      apiClientMock.get.mockResolvedValueOnce({
        data: { data: [{ ...mockRecord1, version: 2, outstandingQty: 1 }] },
      });

      const wrapper = mount(DeclarePartReturnModal, {
        props: {
          open: true,
          orderId: 'order-1',
          items: [mockRecord1],
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });
      await flushPromises();

      // Go to confirm and submit
      await wrapper.find('[data-testid="declare-next-button"]').trigger('click');
      await flushPromises();

      await wrapper.find('[data-testid="declare-submit-button"]').trigger('click');
      await flushPromises();

      // Modal returns to form step and shows conflict warning
      expect(wrapper.find('[data-testid="declare-step-form"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="declare-error"]').text()).toContain(
        'Dữ liệu linh kiện đã thay đổi hoặc xung đột phiên bản',
      );

      // Re-fetch was called
      expect(apiClientMock.get).toHaveBeenCalledWith('/service-orders/order-1/part-returns');

      wrapper.unmount();
    });
  });

  describe('Stopped and Historical Job Part Return Link', () => {
    it('provides "Xem linh kiện cần trả" button on historical jobs', async () => {
      apiClientMock.get.mockImplementation(async (path: string) => {
        if (path === '/service-orders/order-stopped') {
          return {
            data: {
              data: {
                id: 'order-stopped',
                code: 'FH-STOPPED-01',
                status: 'CANCELLED',
                historical: true,
                workStopped: true,
                createdAt: '2026-11-01T00:00:00Z',
                completedAt: null,
                cancelledAt: '2026-11-01T10:00:00Z',
              },
            },
          };
        }
        return { data: { data: [] } };
      });

      const wrapper = mount(TechnicianJobDetailPage, {
        global: {
          stubs: {
            FhButton: {
              template: '<button :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')"><slot /></button>',
            },
            FhCard: true,
            FhStatusPill: true,
            FhMoney: true,
            'router-link': true,
          },
        },
      });
      await flushPromises();

      const btn = wrapper.find('[data-testid="historical-part-returns"]');
      expect(btn.exists()).toBe(true);
      expect(btn.text()).toContain('Xem linh kiện cần trả');

      await btn.trigger('click');
      expect(pushMock).toHaveBeenCalledWith({
        path: '/tech/part-returns',
        query: { orderId: 'order-stopped' },
      });

      wrapper.unmount();
    });
  });
});
