// Service Manager and Admin: customers' withdrawals (PO 16/10/2026). The payout
// section of /console/wallets has two tabs, "Kỹ thuật viên" and "Khách hàng",
// each with its own list and its own totals, never mixed; the payOS source
// balance is the one channel both share and shows once above the tabs.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

const { walletApi, customerApi, apiClient, toast } = vi.hoisted(() => ({
  walletApi: {
    listWallets: vi.fn(),
    listWithdrawals: vi.fn(),
    getPayoutOverview: vi.fn(),
    reconcileWithdrawal: vi.fn(),
    getWalletConfig: vi.fn(),
  },
  customerApi: { list: vi.fn(), payoutOverview: vi.fn(), reconcile: vi.fn() },
  apiClient: { get: vi.fn(), post: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../src/api/wallet.api', () => ({ walletApi }));
vi.mock('../src/api/console-customer-withdrawals.api', () => ({ consoleCustomerWithdrawalsApi: customerApi }));
vi.mock('../src/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/client')>()),
  default: apiClient,
}));
vi.mock('vue-sonner', () => ({ toast }));

import ConsoleWalletsPage from '../src/pages/console/ConsoleWalletsPage.vue';

const TECH_OVERVIEW = {
  provider: 'payos' as const,
  sourceBalance: 49_980_000,
  paidOut: { count: 2, amount: 3_330_000 },
  processing: { count: 1, amount: 10_000 },
  pending: { count: 0, amount: 0 },
  failed: { count: 1, amount: 10_000 },
};

const CUSTOMER_OVERVIEW = {
  provider: 'payos' as const,
  sourceBalance: 49_980_000,
  paidOut: { count: 3, amount: 750_000 },
  processing: { count: 1, amount: 120_000 },
  pending: { count: 0, amount: 0 },
  failed: { count: 2, amount: 90_000 },
};

const techRow = {
  id: 'wd-1',
  walletId: 'w-1',
  technicianId: 't-1',
  amount: 10_000,
  bankName: 'Vietcombank',
  bankAccountNumber: '0123456789',
  bankAccountName: 'PHAM DUC TOAN',
  status: 'PROCESSING',
  requestedAt: '2026-10-15T00:00:00Z',
  technician: { id: 't-1', fullName: 'PHAM DUC TOAN', phoneNumber: '0900000000' },
};

const customerRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'cw-1',
  amount: 250_000,
  status: 'SUCCESS',
  bankName: 'Techcombank',
  bankAccountNumber: '••••1234',
  bankAccountName: 'NGUYEN VAN AN',
  requestedAt: '2026-10-16T02:00:00Z',
  payoutAttemptedAt: '2026-10-16T02:00:05Z',
  payoutBankReference: 'FT26289001',
  failureReason: null,
  refundTransactionId: null,
  updatedAt: '2026-10-16T02:00:06Z',
  customer: { id: 'c-1', fullName: 'Nguyễn Văn An', email: 'an@example.invalid', phoneNumber: '0904000001' },
  ...overrides,
});

const page = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 15 });

const stubs = {
  FhButton: {
    props: ['disabled', 'loading', 'variant', 'size'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  FhStatusPill: {
    props: ['status', 'label'],
    template: '<span class="pill">{{ label || status }}</span>',
  },
};

const tab = (w: VueWrapper, label: string) => {
  const found = w.findAll('[role="tab"]').find((t) => t.text().startsWith(label));
  if (!found) throw new Error(`no tab "${label}"`);
  return found;
};

async function openPayouts(options: Parameters<typeof mount>[1] = {}): Promise<VueWrapper> {
  const w = mount(ConsoleWalletsPage, { ...options, global: { stubs, ...(options.global ?? {}) } });
  await flushPromises();
  await tab(w, 'Yêu cầu rút tiền').trigger('click');
  await flushPromises();
  return w;
}

async function openCustomers(): Promise<VueWrapper> {
  const w = await openPayouts();
  await tab(w, 'Khách hàng').trigger('click');
  await flushPromises();
  return w;
}

const occurrences = (text: string, part: string) => text.split(part).length - 1;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  walletApi.listWallets.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 1 } });
  walletApi.listWithdrawals.mockResolvedValue({ data: [techRow], meta: { total: 1, totalPages: 1 } });
  walletApi.getPayoutOverview.mockResolvedValue({ ...TECH_OVERVIEW });
  customerApi.list.mockResolvedValue(page([customerRow()]));
  customerApi.payoutOverview.mockResolvedValue({ ...CUSTOMER_OVERVIEW });
});

describe('Rút tiền của khách hàng trong console', () => {
  it('splits the payout section into technicians and customers, technicians first', async () => {
    const w = await openPayouts();

    const labels = w.findAll('[role="tab"]').map((t) => t.text());
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/^Kỹ thuật viên/), 'Khách hàng']));
    expect(w.text()).toContain('PHAM DUC TOAN');
    expect(w.find('[data-testid="customer-withdrawals"]').exists()).toBe(false);
    expect(customerApi.list).not.toHaveBeenCalled();
    expect(customerApi.payoutOverview).not.toHaveBeenCalled();
  });

  it('keeps the two lists apart when switching tabs', async () => {
    const w = await openPayouts();
    const techListCalls = walletApi.listWithdrawals.mock.calls.length;
    const techOverviewCalls = walletApi.getPayoutOverview.mock.calls.length;

    await tab(w, 'Khách hàng').trigger('click');
    await flushPromises();

    expect(customerApi.list).toHaveBeenCalledWith({ page: 1, limit: 15, status: undefined, search: '' });
    expect(customerApi.payoutOverview).toHaveBeenCalledTimes(1);
    expect(walletApi.listWithdrawals).toHaveBeenCalledTimes(techListCalls);
    expect(walletApi.getPayoutOverview).toHaveBeenCalledTimes(techOverviewCalls);
    expect(w.text()).toContain('Nguyễn Văn An');
    expect(w.text()).not.toContain('PHAM DUC TOAN');
    expect(w.text()).not.toContain('Đã chuyển cho kỹ thuật viên');
    // The tab shows how many customer withdrawals there are once the list is read.
    expect(tab(w, 'Khách hàng').text()).toBe('Khách hàng 1');

    const customerCalls = customerApi.list.mock.calls.length;
    await tab(w, 'Kỹ thuật viên').trigger('click');
    await flushPromises();

    expect(walletApi.listWithdrawals.mock.calls.length).toBeGreaterThan(techListCalls);
    expect(customerApi.list).toHaveBeenCalledTimes(customerCalls);
    expect(w.text()).toContain('PHAM DUC TOAN');
    expect(w.text()).not.toContain('Nguyễn Văn An');
    expect(w.text()).not.toContain('Đã chuyển cho khách hàng');
  });

  it('lists the customer, the contact, the amount and the masked account', async () => {
    const w = await openCustomers();

    const row = w.get('[data-testid="cw-row-cw-1"]');
    expect(row.text()).toContain('Nguyễn Văn An');
    expect(row.text()).toContain('an@example.invalid · 0904000001');
    expect(row.text()).toMatch(/250\.000/);
    expect(row.text()).toContain('Techcombank');
    expect(row.text()).toContain('••••1234 · NGUYEN VAN AN');
    expect(row.text()).toContain('Đã chi tiền');
    expect(row.text()).toContain('Mã giao dịch FT26289001');
  });

  it('says why a payout failed and that the money went back to the wallet', async () => {
    customerApi.list.mockResolvedValue(
      page([
        customerRow({ id: 'cw-f', status: 'FAILED', payoutBankReference: null, failureReason: 'Ngân hàng từ chối', refundTransactionId: 'tx-9' }),
        customerRow({ id: 'cw-p', status: 'PROCESSING', payoutBankReference: null, failureReason: 'Đang chờ ngân hàng xử lý' }),
      ]),
    );
    const w = await openCustomers();

    expect(w.get('[data-testid="cw-row-cw-f"]').text()).toContain('Ngân hàng từ chối · đã hoàn tiền vào ví');
    expect(w.get('[data-testid="cw-row-cw-p"]').text()).toContain('Đang chờ ngân hàng xử lý');
    expect(w.get('[data-testid="cw-row-cw-p"]').text()).toContain('Đang chuyển tiền');
  });

  it('filters by status and searches on the server', async () => {
    const w = await openCustomers();

    await w.get('[data-testid="cw-status"]').setValue('FAILED');
    await flushPromises();
    expect(customerApi.list).toHaveBeenLastCalledWith({ page: 1, limit: 15, status: 'FAILED', search: '' });

    await w.get('[data-testid="customer-withdrawals"] input[type="search"]').setValue('  0904  ');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(customerApi.list).toHaveBeenLastCalledWith({ page: 1, limit: 15, status: 'FAILED', search: '0904' });
    expect(walletApi.listWithdrawals).not.toHaveBeenCalledWith(expect.objectContaining({ search: expect.anything() }));
  });

  it('offers a re-check only for a payout still in flight, then reads the list and totals again', async () => {
    customerApi.list.mockResolvedValue(
      page([
        customerRow({ id: 'cw-s' }),
        customerRow({ id: 'cw-f', status: 'FAILED', payoutBankReference: null, failureReason: 'Sai số tài khoản', refundTransactionId: 'tx-1' }),
        customerRow({ id: 'cw-p', status: 'PROCESSING', payoutBankReference: null }),
      ]),
    );
    customerApi.reconcile.mockResolvedValue({
      ...customerRow({ id: 'cw-p', status: 'SUCCESS', payoutBankReference: 'FT26289777' }),
      message: 'Đã chi tiền về tài khoản ngân hàng của khách hàng',
    });
    const w = await openCustomers();

    const buttons = w.findAll('[data-testid="cw-reconcile"]');
    expect(buttons).toHaveLength(1);
    expect(w.get('[data-testid="cw-row-cw-p"]').find('[data-testid="cw-reconcile"]').exists()).toBe(true);
    expect(w.get('[data-testid="cw-row-cw-s"]').find('[data-testid="cw-reconcile"]').exists()).toBe(false);
    expect(w.get('[data-testid="cw-row-cw-f"]').find('[data-testid="cw-reconcile"]').exists()).toBe(false);

    const listCalls = customerApi.list.mock.calls.length;
    const overviewCalls = customerApi.payoutOverview.mock.calls.length;
    await buttons[0]!.trigger('click');
    await flushPromises();

    expect(customerApi.reconcile).toHaveBeenCalledWith('cw-p');
    expect(walletApi.reconcileWithdrawal).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Đã chi tiền về tài khoản ngân hàng của khách hàng', {
      description: 'Mã giao dịch ngân hàng: FT26289777',
    });
    expect(customerApi.list.mock.calls.length).toBeGreaterThan(listCalls);
    expect(customerApi.payoutOverview.mock.calls.length).toBeGreaterThan(overviewCalls);
  });

  it('passes on the server reason when a re-check fails', async () => {
    customerApi.list.mockResolvedValue(page([customerRow({ id: 'cw-p', status: 'PROCESSING', payoutBankReference: null })]));
    customerApi.reconcile.mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Không tìm thấy lệnh rút tiền' } } },
    });
    const w = await openCustomers();

    await w.get('[data-testid="cw-reconcile"]').trigger('click');
    await flushPromises();

    expect(toast.error).toHaveBeenCalledWith('Không tìm thấy lệnh rút tiền');
  });

  it('shows the customer totals and the shared payout source once', async () => {
    const w = await openCustomers();

    const totals = w.get('[data-testid="cw-overview"]').text();
    expect(totals).toContain('Đã chuyển cho khách hàng');
    expect(totals).toMatch(/750\.000/);
    expect(totals).toContain('3 lệnh thành công');
    expect(totals).toMatch(/120\.000/);
    expect(totals).toContain('1 lệnh chờ payOS xác nhận');
    expect(totals).toMatch(/90\.000/);
    expect(totals).toContain('2 lệnh, tiền đã hoàn về ví khách hàng');
    // Technician totals never sit next to the customer ones.
    expect(totals).not.toContain('3.330.000');

    const text = w.text();
    expect(occurrences(text, 'Ví nguồn chi hộ')).toBe(1);
    expect(occurrences(text, '49.980.000')).toBe(1);
    expect(w.get('[data-testid="payout-source"]').text()).toContain('chung cho kỹ thuật viên và khách hàng');
  });

  it('shows the shared payout source once on the technician tab too', async () => {
    const w = await openPayouts();

    expect(occurrences(w.text(), 'Ví nguồn chi hộ')).toBe(1);
    expect(occurrences(w.text(), '49.980.000')).toBe(1);
  });

  it('says plainly when payOS is not configured for customer payouts', async () => {
    customerApi.payoutOverview.mockResolvedValue({ ...CUSTOMER_OVERVIEW, provider: 'disabled', sourceBalance: null });
    const w = await openCustomers();

    expect(w.text()).toContain('Chưa cấu hình payOS nên chưa thể chi tiền rút cho khách hàng.');
  });

  it('keeps the open tab in the address (?payout=customers)', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/console/wallets', component: { template: '<div />' } }],
    });
    await router.push('/console/wallets?payout=customers');
    await router.isReady();
    const w = mount(ConsoleWalletsPage, { global: { stubs, plugins: [router] } });
    await flushPromises();

    // Opening the link lands on the customer list directly.
    expect(w.find('[data-testid="customer-withdrawals"]').exists()).toBe(true);
    expect(customerApi.list).toHaveBeenCalled();

    await tab(w, 'Kỹ thuật viên').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.payout).toBeUndefined();

    await tab(w, 'Khách hàng').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.payout).toBe('customers');
  });
});

describe('API rút tiền của khách hàng cho console', () => {
  it('reads a page with only the filters that are set', async () => {
    const { consoleCustomerWithdrawalsApi } = await vi.importActual<typeof import('../src/api/console-customer-withdrawals.api')>(
      '../src/api/console-customer-withdrawals.api',
    );
    apiClient.get.mockResolvedValueOnce({
      data: { success: true, data: [customerRow({ amount: '250000' })], meta: { page: 2, limit: 15, total: 16, totalPages: 2 } },
    });

    const res = await consoleCustomerWithdrawalsApi.list({ page: 2, limit: 15, status: 'FAILED', search: '  an  ' });

    expect(apiClient.get).toHaveBeenCalledWith('/service-manager/customer-withdrawals', {
      params: { page: 2, limit: 15, status: 'FAILED', search: 'an' },
    });
    expect(res.total).toBe(16);
    expect(res.items[0]!.amount).toBe(250_000);

    apiClient.get.mockResolvedValueOnce({ data: { success: true, data: [], meta: { page: 1, limit: 15, total: 0, totalPages: 0 } } });
    await consoleCustomerWithdrawalsApi.list({ page: 1, limit: 15, search: '   ' });
    expect(apiClient.get).toHaveBeenLastCalledWith('/service-manager/customer-withdrawals', { params: { page: 1, limit: 15 } });
  });

  it('reads the customer totals and re-checks one payout', async () => {
    const { consoleCustomerWithdrawalsApi } = await vi.importActual<typeof import('../src/api/console-customer-withdrawals.api')>(
      '../src/api/console-customer-withdrawals.api',
    );
    apiClient.get.mockResolvedValueOnce({ data: { success: true, data: { ...CUSTOMER_OVERVIEW, sourceBalance: '49980000' } } });
    const overview = await consoleCustomerWithdrawalsApi.payoutOverview();
    expect(apiClient.get).toHaveBeenCalledWith('/service-manager/customer-withdrawals/payout-overview');
    expect(overview.sourceBalance).toBe(49_980_000);
    expect(overview.paidOut).toEqual({ count: 3, amount: 750_000 });

    apiClient.post.mockResolvedValueOnce({ data: { success: true, data: { ...customerRow({ amount: '250000' }), message: 'Đã chi tiền' } } });
    const result = await consoleCustomerWithdrawalsApi.reconcile('cw-1');
    expect(apiClient.post).toHaveBeenCalledWith('/service-manager/customer-withdrawals/cw-1/reconcile');
    expect(result.amount).toBe(250_000);
    expect(result.message).toBe('Đã chi tiền');
  });
});
