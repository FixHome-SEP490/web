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
    approveWithdrawal: vi.fn(),
    reconcileWithdrawal: vi.fn(),
    rejectWithdrawal: vi.fn(),
    getWalletConfig: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../src/api/wallet.api', () => ({ walletApi }));
vi.mock('vue-sonner', () => ({ toast }));

import ConsoleWalletsPage from '../src/pages/console/ConsoleWalletsPage.vue';

const OVERVIEW = {
  provider: 'mock' as const,
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

  it('warns loudly that the simulator moves no real money', async () => {
    const wrapper = await openWithdrawalsTab();

    expect(wrapper.text()).toContain('chế độ giả lập chi hộ');
  });

  it('no longer asks the manager to confirm a manual transfer', async () => {
    const wrapper = await openWithdrawalsTab();
    await button(wrapper, 'Duyệt và chi').trigger('click');

    expect(wrapper.text()).not.toContain('đã hoàn tất lệnh chuyển khoản');
    expect(wrapper.text()).toContain('bạn không cần chuyển tay');
  });

  it('reports a paid withdrawal with its bank reference', async () => {
    walletApi.approveWithdrawal.mockResolvedValue({
      ...row({ status: 'SUCCESS', payoutBankReference: 'FT26273123' }),
      message: 'Đã chi tiền về tài khoản ngân hàng của kỹ thuật viên',
    });
    const wrapper = await openWithdrawalsTab();

    await button(wrapper, 'Duyệt và chi').trigger('click');
    await button(wrapper, 'Duyệt và chi tiền').trigger('click');
    await flushPromises();

    expect(walletApi.approveWithdrawal).toHaveBeenCalledWith('wd-1');
    expect(toast.success).toHaveBeenCalledWith(
      'Đã chi tiền về tài khoản ngân hàng của kỹ thuật viên',
      { description: 'Mã giao dịch ngân hàng: FT26273123' },
    );
  });

  it('reports a failed payout as an error, with the reason', async () => {
    walletApi.approveWithdrawal.mockResolvedValue({
      ...row({ status: 'FAILED', failureReason: 'Số tài khoản nhận không tồn tại' }),
      message: 'Chi tiền không thành công, số tiền đã được hoàn lại vào ví kỹ thuật viên',
    });
    const wrapper = await openWithdrawalsTab();

    await button(wrapper, 'Duyệt và chi').trigger('click');
    await button(wrapper, 'Duyệt và chi tiền').trigger('click');
    await flushPromises();

    expect(toast.error).toHaveBeenCalledWith(
      'Chi tiền không thành công, số tiền đã được hoàn lại vào ví kỹ thuật viên',
      { description: 'Số tài khoản nhận không tồn tại' },
    );
  });

  it('passes on the server\'s reason when the payout source is short', async () => {
    walletApi.approveWithdrawal.mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Ví nguồn chi hộ không đủ số dư: còn 5.000 ₫, cần 10.000 ₫.',
          },
        },
      },
    });
    const wrapper = await openWithdrawalsTab();

    await button(wrapper, 'Duyệt và chi').trigger('click');
    await button(wrapper, 'Duyệt và chi tiền').trigger('click');
    await flushPromises();

    expect(toast.error).toHaveBeenCalledWith(
      'Ví nguồn chi hộ không đủ số dư: còn 5.000 ₫, cần 10.000 ₫.',
    );
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
