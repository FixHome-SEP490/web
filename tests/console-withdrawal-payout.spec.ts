import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

/**
 * The Service Manager's side: approval now pays out through payOS, so the page
 * must say where each payout ended up and let a stuck one be re-checked.
 */

const { walletApi, toast } = vi.hoisted(() => ({
  walletApi: {
    listWallets: vi.fn(),
    listWithdrawals: vi.fn(),
    getPayoutOverview: vi.fn(),
    reconcileWithdrawal: vi.fn(),
    getWalletConfig: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../src/api/wallet.api', () => ({ walletApi }));
vi.mock('vue-sonner', () => ({ toast }));

import ConsoleWalletsPage from '../src/pages/console/ConsoleWalletsPage.vue';

const OVERVIEW = {
  provider: 'payos' as const,
  sourceBalance: 49_980_000,
  paidOut: { count: 2, amount: 20_000 },
  processing: { count: 1, amount: 10_000 },
  pending: { count: 1, amount: 10_000 },
  failed: { count: 1, amount: 10_000 },
};

const row = (overrides: Record<string, unknown>) => ({
  id: 'wd-1',
  walletId: 'w-1',
  technicianId: 't-1',
  amount: 10_000,
  bankName: 'Vietcombank',
  bankAccountNumber: '0123456789',
  bankAccountName: 'PHAM DUC TOAN',
  status: 'PENDING',
  requestedAt: '2026-09-29T00:00:00Z',
  technician: { id: 't-1', fullName: 'PHAM DUC TOAN', phoneNumber: '0900000000' },
  ...overrides,
});

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

async function openWithdrawalsTab(): Promise<VueWrapper> {
  const wrapper = mount(ConsoleWalletsPage, { global: { stubs } });
  await flushPromises();
  const tab = wrapper.findAll('button').find((b) => b.text().includes('Yêu cầu rút tiền'))!;
  await tab.trigger('click');
  await flushPromises();
  return wrapper;
}

const button = (wrapper: VueWrapper, text: string) => {
  const found = wrapper.findAll('button').find((b) => b.text().includes(text));
  if (!found) throw new Error(`no button "${text}"`);
  return found;
};

describe('Duyệt và chi tiền tự động (console)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    walletApi.listWallets.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 1 } });
    walletApi.listWithdrawals.mockResolvedValue({
      data: [row({})],
      meta: { total: 1, totalPages: 1 },
    });
    walletApi.getPayoutOverview.mockResolvedValue({ ...OVERVIEW });
  });

  it('shows what has been paid, what is moving and the payout source', async () => {
    const wrapper = await openWithdrawalsTab();

    expect(wrapper.text()).toContain('Ví nguồn chi hộ');
    expect(wrapper.text()).toContain('Đã chuyển cho kỹ thuật viên');
    expect(wrapper.text()).toContain('2 lệnh thành công');
    expect(wrapper.text()).toContain('1 lệnh chờ payOS xác nhận');
  });

  it('never mentions a simulated payout: the backend has no mock provider any more', async () => {
    const wrapper = await openWithdrawalsTab();

    expect(wrapper.text()).not.toContain('giả lập');
    expect(wrapper.text()).toContain('Ví payOS dùng để chi hộ');
    expect(wrapper.text()).not.toContain('Chưa cấu hình payOS');
  });

  it('says plainly when payOS is not configured and nothing can be paid out', async () => {
    walletApi.getPayoutOverview.mockResolvedValue({ ...OVERVIEW, provider: 'disabled', sourceBalance: null });
    const wrapper = await openWithdrawalsTab();

    expect(wrapper.text()).toContain('Chưa cấu hình payOS nên chưa thể chi tiền rút cho kỹ thuật viên.');
    expect(wrapper.text()).toContain('Không đọc được');
    expect(wrapper.text()).not.toContain('giả lập');
  });

  it('offers no approve or reject: managers only track the money leaving', async () => {
    const wrapper = await openWithdrawalsTab();

    const labels = wrapper.findAll('button').map((b) => b.text());
    expect(labels.some((t) => /Duyệt/.test(t))).toBe(false);
    expect(labels.some((t) => /Từ chối/.test(t))).toBe(false);
  });

  it('tracks failed payouts and says the money went back', async () => {
    const wrapper = await openWithdrawalsTab();

    expect(wrapper.text()).toContain('Chuyển thất bại');
    expect(wrapper.text()).toContain('tiền đã hoàn về ví kỹ thuật viên');
  });

  it('passes on the server${q}s reason when a re-check fails', async () => {
    walletApi.listWithdrawals.mockResolvedValue({
      data: [row({ status: 'PROCESSING' })],
      meta: { total: 1, totalPages: 1 },
    });
    walletApi.reconcileWithdrawal.mockRejectedValue({
      response: { data: { error: { message: 'Yêu cầu rút tiền không tồn tại' } } },
    });
    const wrapper = await openWithdrawalsTab();

    await button(wrapper, 'Kiểm tra lại').trigger('click');
    await flushPromises();

    expect(toast.error).toHaveBeenCalledWith('Yêu cầu rút tiền không tồn tại');
  });

  it('offers a re-check for a payout still in flight', async () => {
    walletApi.listWithdrawals.mockResolvedValue({
      data: [row({ status: 'PROCESSING' })],
      meta: { total: 1, totalPages: 1 },
    });
    walletApi.reconcileWithdrawal.mockResolvedValue({
      ...row({ status: 'SUCCESS', payoutBankReference: 'FT1' }),
      message: 'Đã chi tiền về tài khoản ngân hàng của kỹ thuật viên',
    });
    const wrapper = await openWithdrawalsTab();

    expect(wrapper.text()).toContain('Đang chuyển tiền');
    await button(wrapper, 'Kiểm tra lại').trigger('click');
    await flushPromises();

    expect(walletApi.reconcileWithdrawal).toHaveBeenCalledWith('wd-1');
    expect(toast.success).toHaveBeenCalled();
  });

  it('shows the failure reason and the refund on a failed row', async () => {
    walletApi.listWithdrawals.mockResolvedValue({
      data: [row({ status: 'FAILED', failureReason: 'Ngân hàng từ chối' })],
      meta: { total: 1, totalPages: 1 },
    });
    const wrapper = await openWithdrawalsTab();

    expect(wrapper.text()).toContain('Chuyển thất bại');
    expect(wrapper.text()).toContain('Ngân hàng từ chối · đã hoàn tiền vào ví');
  });
});
