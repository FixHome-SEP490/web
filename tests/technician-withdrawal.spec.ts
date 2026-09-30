import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

/**
 * The technician's side of withdrawing: an account is saved once and checked
 * against KYC on the server, and a withdrawal carries nothing but the amount.
 * These tests pin the page to that contract.
 */

const { walletApi, toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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
vi.mock('vue-sonner', () => ({ toast }));
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

const ACCOUNT = {
  bankBin: '970436',
  bankCode: 'VCB',
  bankName: 'Vietcombank',
  accountNumber: '0123456789',
  accountName: 'PHAM DUC TOAN',
  updatedAt: '2026-09-29T00:00:00Z',
};

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

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(TechnicianWalletPage, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

const button = (wrapper: VueWrapper, text: string) => {
  const found = wrapper.findAll('button').find((b) => b.text().includes(text));
  if (!found) throw new Error(`no button "${text}"`);
  return found;
};

describe('Rút tiền phía kỹ thuật viên (web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletApi.getMyWallet.mockResolvedValue({ ...WALLET });
    walletApi.getMyTransactions.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 1 } });
    walletApi.getMyWithdrawals.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 1 } });
    walletApi.getMyBankAccount.mockResolvedValue(null);
    walletApi.listBanks.mockResolvedValue([
      { bin: '970436', code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại Thương Việt Nam' },
    ]);
  });

  it('asks for a bank account first when none is saved', async () => {
    const wrapper = await mountPage();

    await button(wrapper, 'Rút tiền về ngân hàng').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Bạn cần khai báo tài khoản nhận tiền trước khi rút');
    expect(walletApi.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('refuses a malformed account number before calling the server', async () => {
    const wrapper = await mountPage();
    await button(wrapper, 'Khai báo tài khoản').trigger('click');
    await flushPromises();

    await wrapper.get('#bank-bin').setValue('970436');
    await wrapper.get('#bank-account-number').setValue('0123 ABC');
    await wrapper.get('#bank-account-name').setValue('Phạm Đức Toàn');
    await button(wrapper, 'Lưu tài khoản').trigger('click');

    expect(wrapper.text()).toContain('Số tài khoản chỉ gồm chữ số');
    expect(walletApi.saveMyBankAccount).not.toHaveBeenCalled();
  });

  it('saves the account, then carries on to the withdrawal it was opened for', async () => {
    walletApi.saveMyBankAccount.mockResolvedValue({ ...ACCOUNT });
    const wrapper = await mountPage();
    await button(wrapper, 'Rút tiền về ngân hàng').trigger('click');
    await flushPromises();

    await wrapper.get('#bank-bin').setValue('970436');
    await wrapper.get('#bank-account-number').setValue('0123456789');
    await wrapper.get('#bank-account-name').setValue('Phạm Đức Toàn');
    await button(wrapper, 'Lưu tài khoản').trigger('click');
    await flushPromises();

    expect(walletApi.saveMyBankAccount).toHaveBeenCalledWith({
      bankBin: '970436',
      accountNumber: '0123456789',
      accountName: 'Phạm Đức Toàn',
    });
    expect(wrapper.text()).toContain('Rút tiền về ngân hàng');
    expect(wrapper.text()).toContain('Chuyển về tài khoản');
  });

  it('sends only the amount: the destination is the saved account', async () => {
    walletApi.getMyBankAccount.mockResolvedValue({ ...ACCOUNT });
    walletApi.requestWithdrawal.mockResolvedValue({
      id: 'wd-1',
      status: 'SUCCESS',
      payoutBankReference: 'FT123',
      message: 'Đã chuyển tiền về tài khoản ngân hàng của bạn',
    });
    const wrapper = await mountPage();

    await button(wrapper, 'Rút tiền về ngân hàng').trigger('click');
    const amountInput = wrapper
      .findAll('input[type="number"]')
      .find((i) => i.attributes('placeholder') === '100000')!;
    await amountInput.setValue(50_000);
    await button(wrapper, 'Rút tiền ngay').trigger('click');
    await flushPromises();

    expect(walletApi.requestWithdrawal).toHaveBeenCalledWith(50_000);
    // No approval step: the answer is the payout result, shown straight away.
    expect(toast.success).toHaveBeenCalledWith('Đã chuyển tiền về tài khoản ngân hàng của bạn', {
      description: 'Mã giao dịch ngân hàng: FT123',
    });
  });

  it('holds the 10.000 ₫ minimum on the client too', async () => {
    walletApi.getMyBankAccount.mockResolvedValue({ ...ACCOUNT });
    const wrapper = await mountPage();
    await button(wrapper, 'Rút tiền về ngân hàng').trigger('click');

    const amountInput = wrapper
      .findAll('input[type="number"]')
      .find((i) => i.attributes('placeholder') === '100000')!;
    await amountInput.setValue(9_999);
    await button(wrapper, 'Rút tiền ngay').trigger('click');

    expect(wrapper.text()).toContain('Số tiền rút tối thiểu là');
    expect(walletApi.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('shows the server\'s own reason when a withdrawal is refused', async () => {
    walletApi.getMyBankAccount.mockResolvedValue({ ...ACCOUNT });
    walletApi.requestWithdrawal.mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'CONFLICT',
            message: 'Bạn đang có một yêu cầu rút tiền đang chờ xử lý.',
          },
        },
      },
    });
    const wrapper = await mountPage();
    await button(wrapper, 'Rút tiền về ngân hàng').trigger('click');
    await button(wrapper, 'Rút tiền ngay').trigger('click');
    await flushPromises();

    // The old page read response.data.message, which the backend never sets,
    // and fell back to a generic line.
    expect(wrapper.text()).toContain('Bạn đang có một yêu cầu rút tiền đang chờ xử lý.');
  });

  it('blocks a second withdrawal while one is still moving to the bank', async () => {
    walletApi.getMyWallet.mockResolvedValue({ ...WALLET, processingWithdrawal: 50_000 });
    walletApi.getMyBankAccount.mockResolvedValue({ ...ACCOUNT });
    const wrapper = await mountPage();

    const withdraw = button(wrapper, 'Rút tiền về ngân hàng');
    expect(withdraw.attributes('disabled')).toBeDefined();
    expect(withdraw.attributes('title')).toContain('đang được chuyển');
    expect(wrapper.text()).toContain('Đang chuyển về ngân hàng');
  });

  it('shows only the last four digits of the saved account outside the form', async () => {
    walletApi.getMyBankAccount.mockResolvedValue({ ...ACCOUNT });
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('•••• 6789');
    expect(wrapper.text()).toContain('PHAM DUC TOAN');
  });

  it('explains a failed payout and the refund in the withdrawal history', async () => {
    walletApi.getMyBankAccount.mockResolvedValue({ ...ACCOUNT });
    walletApi.getMyWithdrawals.mockResolvedValue({
      data: [
        {
          id: 'wd-fail',
          amount: 10_000,
          status: 'FAILED',
          failureReason: 'Số tài khoản nhận không tồn tại',
          bankName: 'Vietcombank',
          bankAccountNumber: '1234560000',
          bankAccountName: 'PHAM DUC TOAN',
          requestedAt: '2026-09-29T00:00:00Z',
        },
        {
          id: 'wd-ok',
          amount: 10_000,
          status: 'SUCCESS',
          payoutBankReference: 'FT26273123',
          bankName: 'Vietcombank',
          bankAccountNumber: '0123456789',
          bankAccountName: 'PHAM DUC TOAN',
          requestedAt: '2026-09-29T00:00:00Z',
        },
      ],
      meta: { total: 2, totalPages: 1 },
    });
    const wrapper = await mountPage();

    await button(wrapper, 'Lịch sử rút tiền').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Chuyển thất bại');
    expect(wrapper.text()).toContain('Số tài khoản nhận không tồn tại');
    expect(wrapper.text()).toContain('Tiền đã được hoàn lại vào ví');
    expect(wrapper.text()).toContain('Đã chi tiền');
    expect(wrapper.text()).toContain('FT26273123');
  });
});

describe('Rút tiền không cần duyệt (web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletApi.getMyWallet.mockResolvedValue({ ...WALLET });
    walletApi.getMyTransactions.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 1 } });
    walletApi.getMyWithdrawals.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 1 } });
    walletApi.getMyBankAccount.mockResolvedValue({ ...ACCOUNT });
  });

  it('never tells the technician to wait for a manager', async () => {
    const wrapper = await mountPage();
    await button(wrapper, 'Rút tiền về ngân hàng').trigger('click');

    expect(wrapper.text()).not.toMatch(/chờ\s+Quản lý dịch vụ duyệt|Quản lý dịch vụ duyệt xong/);
    expect(wrapper.text()).toContain('không cần chờ duyệt');
  });

  it('announces a failed payout as an error, with the refund', async () => {
    walletApi.requestWithdrawal.mockResolvedValue({
      id: 'wd-2',
      status: 'FAILED',
      failureReason: 'Số tài khoản nhận không tồn tại',
      message: 'Chuyển tiền không thành công, số tiền đã được hoàn lại vào ví của bạn',
    });
    const wrapper = await mountPage();
    await button(wrapper, 'Rút tiền về ngân hàng').trigger('click');
    await button(wrapper, 'Rút tiền ngay').trigger('click');
    await flushPromises();

    expect(toast.error).toHaveBeenCalledWith(
      'Chuyển tiền không thành công, số tiền đã được hoàn lại vào ví của bạn',
      { description: 'Số tài khoản nhận không tồn tại' },
    );
  });

  it('tells the technician when the bank is still working on it', async () => {
    walletApi.requestWithdrawal.mockResolvedValue({
      id: 'wd-3',
      status: 'PROCESSING',
      message: 'Lệnh rút đã gửi, ngân hàng đang xử lý.',
    });
    const wrapper = await mountPage();
    await button(wrapper, 'Rút tiền về ngân hàng').trigger('click');
    await button(wrapper, 'Rút tiền ngay').trigger('click');
    await flushPromises();

    expect(toast.info).toHaveBeenCalledWith('Lệnh rút đã gửi, ngân hàng đang xử lý.');
  });
});
