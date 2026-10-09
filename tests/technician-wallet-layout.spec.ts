import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

/**
 * The wallet screen after the layout clean-up (PO 10/10/2026): every money
 * action appears once, refresh is a quiet icon, and a failed list says so in
 * plain words with a way to try again.
 */

const { walletApi } = vi.hoisted(() => ({
  walletApi: {
    getMyWallet: vi.fn(),
    getMyTransactions: vi.fn(),
    getMyWithdrawals: vi.fn(),
    getMyBankAccount: vi.fn(),
    listBanks: vi.fn(),
    saveMyBankAccount: vi.fn(),
    requestWithdrawal: vi.fn(),
    topUp: vi.fn(),
  },
}));

vi.mock('../src/api/wallet.api', () => ({ walletApi }));
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import TechnicianWalletPage from '../src/pages/technician/TechnicianWalletPage.vue';

const WALLET = {
  id: 'w-1',
  technicianId: 't-1',
  balance: 850_000,
  pendingWithdrawal: 0,
  processingWithdrawal: 0,
  minimumBalance: 200_000,
  minimumWithdrawal: 10_000,
  availableBalance: 850_000,
  withdrawableBalance: 650_000,
  eligibleForJobs: true,
};

const stubs = {
  FhButton: {
    props: ['disabled', 'loading', 'variant', 'size'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  FhStatusPill: { props: ['status', 'label'], template: '<span>{{ label || status }}</span>' },
  FhSkeleton: { template: '<div data-testid="skeleton" />' },
};

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(TechnicianWalletPage, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

const buttonsWith = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll('button').filter((b) => b.text().includes(text));

describe('Ví kỹ thuật viên: bố cục gọn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletApi.getMyWallet.mockReset();
    walletApi.getMyTransactions.mockReset();
    walletApi.getMyWallet.mockResolvedValue({ ...WALLET });
    walletApi.getMyTransactions.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 1 } });
    walletApi.getMyWithdrawals.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 1 } });
    walletApi.getMyBankAccount.mockResolvedValue(null);
    walletApi.listBanks.mockResolvedValue([]);
  });

  it('shows a skeleton, not a spinner line, while the wallet loads', async () => {
    walletApi.getMyWallet.mockReturnValue(new Promise(() => {}));
    const wrapper = mount(TechnicianWalletPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.findAll('[data-testid="skeleton"]').length).toBeGreaterThan(0);
    expect(wrapper.text()).not.toContain('Đang tải thông tin ví');
  });

  it('refresh is one icon button with a label for screen readers', async () => {
    const wrapper = await mountPage();
    const refresh = wrapper.findAll('button[aria-label="Làm mới"]');

    expect(refresh).toHaveLength(1);
    expect(refresh[0].text()).toBe('');
    expect(buttonsWith(wrapper, 'Làm mới')).toHaveLength(0);

    await refresh[0].trigger('click');
    await flushPromises();
    expect(walletApi.getMyWallet).toHaveBeenCalledTimes(2);
  });

  it('a negative, ineligible wallet shows one warning and a single top-up button', async () => {
    walletApi.getMyWallet.mockResolvedValue({ ...WALLET, balance: -50_000, eligibleForJobs: false, withdrawableBalance: 0 });
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('Số dư đang âm');
    expect(wrapper.text()).not.toContain('Số dư dưới mức ký quỹ');
    // The ledger filter chip "Nạp tiền" is a filter, not a top-up action.
    expect(buttonsWith(wrapper, 'Nạp tiền vào ví')).toHaveLength(1);
    expect(buttonsWith(wrapper, 'Nạp tiền ngay')).toHaveLength(0);
    expect(buttonsWith(wrapper, 'Thanh toán công nợ')).toHaveLength(0);
  });

  it('an ineligible wallet says why in one line, without a second top-up button', async () => {
    walletApi.getMyWallet.mockResolvedValue({ ...WALLET, balance: 100_000, eligibleForJobs: false, withdrawableBalance: 0 });
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('Số dư dưới mức ký quỹ');
    expect(wrapper.text()).toContain('bạn tạm không nhận lời mời mới');
    // The ledger filter chip "Nạp tiền" is a filter, not a top-up action.
    expect(buttonsWith(wrapper, 'Nạp tiền vào ví')).toHaveLength(1);
    expect(buttonsWith(wrapper, 'Nạp tiền ngay')).toHaveLength(0);
  });

  it('shows each balance figure once', async () => {
    const wrapper = await mountPage();
    const text = wrapper.text();

    expect(text.split('Có thể rút').length - 1).toBe(1);
    expect(text.split('Ký quỹ tối thiểu').length - 1).toBe(1);
    expect(text.split('Đang chuyển về ngân hàng').length - 1).toBe(1);
  });

  it('says on screen why withdrawing is blocked, not only in a tooltip', async () => {
    walletApi.getMyWallet.mockResolvedValue({ ...WALLET, processingWithdrawal: 50_000 });
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('Bạn có lệnh rút đang được chuyển về ngân hàng.');
  });

  it('a failed history list shows a plain line and retries', async () => {
    walletApi.getMyTransactions
      .mockRejectedValueOnce({ response: { status: 500, data: { error: { code: 'INTERNAL', message: 'Internal server error' } } } })
      .mockResolvedValueOnce({ data: [], meta: { total: 0, totalPages: 1 } });
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('Không thể tải biến động số dư. Vui lòng thử lại.');
    expect(wrapper.text()).not.toMatch(/Internal server error|INTERNAL|500/);

    await buttonsWith(wrapper, 'Thử lại')[0].trigger('click');
    await flushPromises();
    expect(walletApi.getMyTransactions).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Chưa có biến động số dư.');
  });

  it('keeps the top-up form open after an error so the amount can be fixed', async () => {
    const wrapper = await mountPage();
    await buttonsWith(wrapper, 'Nạp tiền vào ví')[0].trigger('click');

    const amount = wrapper.get('#topup-amount');
    await amount.setValue(5_000);
    await buttonsWith(wrapper, 'Nạp tiền qua VNPay')[0].trigger('click');

    expect(wrapper.text()).toContain('Số tiền nạp tối thiểu là 10.000 ₫');
    expect(wrapper.find('#topup-amount').exists()).toBe(true);
    expect(walletApi.topUp).not.toHaveBeenCalled();
  });

  it('a ledger line for a repair job is a real button that opens the job', async () => {
    walletApi.getMyTransactions.mockResolvedValue({
      data: [
        {
          id: 'tx-1',
          type: 'ONLINE_EARNING',
          amount: 300_000,
          balanceAfter: 1_150_000,
          referenceType: 'SERVICE_ORDER',
          referenceId: 'so-9',
          description: 'Thu nhập đơn online',
          createdAt: '2026-10-09T03:00:00Z',
        },
      ],
      meta: { total: 1, totalPages: 1 },
    });
    const wrapper = await mountPage();
    const row = wrapper.findAll('button[title="Mở đơn sửa chữa liên quan"]');

    expect(row).toHaveLength(1);
    expect(row[0].text()).toContain('Số dư sau');
  });
});
