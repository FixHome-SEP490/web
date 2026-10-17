// Customer withdrawal (PO 14/10/2026): the step shown follows the server's
// withdrawal-info. Identity check once (none, pending, rejected), then a bank
// account in the verified name, then the amount (the whole balance by default,
// 10.000 ₫ at least), paid at once; one open withdrawal at a time.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  topUp: vi.fn(),
  withdrawalInfo: vi.fn(),
  listBanks: vi.fn(),
  saveBankAccount: vi.fn(),
  withdraw: vi.fn(),
  listWithdrawals: vi.fn(),
  getMine: vi.fn(),
}));
vi.mock('../src/api/customer-wallet.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/customer-wallet.api')>()),
  customerWalletApi: {
    summary: api.summary,
    topUp: api.topUp,
    withdrawalInfo: api.withdrawalInfo,
    listBanks: api.listBanks,
    saveBankAccount: api.saveBankAccount,
    withdraw: api.withdraw,
    listWithdrawals: api.listWithdrawals,
  },
}));
vi.mock('../src/api/customer-verification.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/customer-verification.api')>()),
  customerVerificationApi: { getMine: api.getMine },
}));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }));

import CustomerWithdrawPanel from '../src/components/customer/CustomerWithdrawPanel.vue';
import CustomerWalletPage from '../src/pages/customer/CustomerWalletPage.vue';
import type { CustomerWithdrawalInfo } from '../src/api/customer-wallet.api';

const stubs = {
  'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
  teleport: true,
};

const bankAccount = {
  bankBin: '970436',
  bankCode: 'VCB',
  bankName: 'Vietcombank',
  accountNumber: '0123456789',
  accountName: 'NGUYEN VAN AN',
  updatedAt: '2026-10-14T08:00:00Z',
};

function info(overrides: Partial<CustomerWithdrawalInfo> = {}): CustomerWithdrawalInfo {
  return {
    kycStatus: 'verified',
    kycRejectionReason: null,
    hasBankAccount: true,
    bankAccount,
    minimumAmount: 10_000,
    maximumAmount: 750_000,
    payoutAvailable: true,
    openWithdrawal: null,
    canWithdraw: true,
    ...overrides,
  };
}

const withdrawal = {
  id: 'w1',
  amount: 750_000,
  status: 'SUCCESS' as const,
  bankName: 'Vietcombank',
  bankAccountNumber: '••••6789',
  bankAccountName: 'NGUYEN VAN AN',
  requestedAt: '2026-10-14T09:00:00Z',
  payoutAttemptedAt: '2026-10-14T09:00:01Z',
  payoutBankReference: 'FT123',
  failureReason: null,
  refundTransactionId: null,
  updatedAt: '2026-10-14T09:00:01Z',
};

async function mountPanel(): Promise<VueWrapper> {
  const w = mount(CustomerWithdrawPanel, { global: { stubs } });
  await flushPromises();
  return w;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.withdrawalInfo.mockResolvedValue(info());
  api.listBanks.mockResolvedValue([{ bin: '970436', code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' }]);
  api.getMine.mockResolvedValue({
    status: 'verified',
    rejectionReason: null,
    verification: { verifiedFullName: 'Nguyễn Văn Đức An', fullName: 'Nguyễn Văn Đức An' },
    profile: { fullName: 'Nguyễn Văn Đức An', dateOfBirth: '1990-01-02', gender: 'male', citizenIdNumber: '079090000001', address: '12 Lê Lợi, Quận 1' },
  });
  api.listWithdrawals.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
});

describe('Customer withdrawal: identity step', () => {
  it('asks for the identity check first and sends the customer to it', async () => {
    api.withdrawalInfo.mockResolvedValue(info({ kycStatus: 'none', bankAccount: null, hasBankAccount: false, canWithdraw: false }));
    const w = await mountPanel();
    expect(w.get('[data-testid="withdraw-kyc-needed"]').text()).toContain('xác minh danh tính bằng ảnh hai mặt CCCD');
    expect(w.get('[data-testid="withdraw-kyc-link"]').attributes('href')).toBe('/app/kyc');
    expect(w.find('[data-testid="withdraw-form"]').exists()).toBe(false);
    expect(w.find('[data-testid="withdraw-bank-form"]').exists()).toBe(false);
  });

  it('while pending shows a yellow note and no way to withdraw', async () => {
    api.withdrawalInfo.mockResolvedValue(info({ kycStatus: 'pending', bankAccount: null, hasBankAccount: false, canWithdraw: false }));
    const w = await mountPanel();
    const note = w.get('[data-testid="withdraw-kyc-pending"]');
    expect(note.text()).toContain('Hồ sơ xác minh đang chờ duyệt');
    expect(note.classes()).toContain('bg-warning-50');
    expect(w.find('[data-testid="withdraw-form"]').exists()).toBe(false);
    expect(w.find('[data-testid="withdraw-kyc-link"]').exists()).toBe(false);
  });

  it('when rejected shows the reason in red and lets the customer send again', async () => {
    api.withdrawalInfo.mockResolvedValue(
      info({ kycStatus: 'rejected', kycRejectionReason: 'Ảnh mặt sau bị mờ, vui lòng chụp lại.', bankAccount: null, hasBankAccount: false, canWithdraw: false }),
    );
    const w = await mountPanel();
    const box = w.get('[data-testid="withdraw-kyc-rejected"]');
    expect(box.text()).toContain('Ảnh mặt sau bị mờ');
    expect(box.classes()).toContain('bg-danger-50');
    expect(w.get('[data-testid="withdraw-kyc-link"]').text()).toBe('Gửi lại hồ sơ');
    expect(w.get('[data-testid="withdraw-kyc-link"]').attributes('href')).toBe('/app/kyc');
  });

  it('shows a plain sentence and "Thử lại" when the step cannot be read', async () => {
    api.withdrawalInfo.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce(info());
    const w = await mountPanel();
    expect(w.text()).not.toContain('Network Error');
    expect(w.text()).toContain('Chưa tải được thông tin rút tiền');
    await w.findAll('button').find((b) => b.text() === 'Thử lại')!.trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="withdraw-form"]').exists()).toBe(true);
  });
});

describe('Customer withdrawal: bank account', () => {
  it('asks for a bank account in the verified name, written as banks print it', async () => {
    api.withdrawalInfo.mockResolvedValueOnce(info({ bankAccount: null, hasBankAccount: false, canWithdraw: false })).mockResolvedValue(info());
    api.saveBankAccount.mockResolvedValue(bankAccount);
    const w = await mountPanel();
    expect(w.find('[data-testid="withdraw-form"]').exists()).toBe(false);
    expect((w.get('[data-testid="withdraw-bank-name"]').element as HTMLInputElement).value).toBe('NGUYEN VAN DUC AN');

    await w.get('[data-testid="withdraw-bank-select"]').setValue('970436');
    await w.get('[data-testid="withdraw-bank-number"]').setValue('12ab34');
    await w.get('[data-testid="withdraw-bank-form"]').trigger('submit');
    expect(api.saveBankAccount).not.toHaveBeenCalled();
    expect(w.get('[data-testid="withdraw-bank-error"]').text()).toContain('chỉ gồm chữ số');

    await w.get('[data-testid="withdraw-bank-number"]').setValue('0123456789');
    await w.get('[data-testid="withdraw-bank-form"]').trigger('submit');
    await flushPromises();
    expect(api.saveBankAccount).toHaveBeenCalledWith({ bankBin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN DUC AN' });
    // The next step reads the saved account.
    expect(w.find('[data-testid="withdraw-form"]').exists()).toBe(true);
  });

  it('keeps the form open with the server reason when the name does not match', async () => {
    api.withdrawalInfo.mockResolvedValue(info({ bankAccount: null, hasBankAccount: false, canWithdraw: false }));
    api.saveBankAccount.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 422'), {
        isAxiosError: true,
        response: { status: 422, data: { success: false, error: { code: 'VALIDATION_FAILED', message: 'Tên chủ tài khoản phải trùng với tên đã xác minh danh tính: NGUYEN VAN DUC AN' } } },
      }),
    );
    const w = await mountPanel();
    await w.get('[data-testid="withdraw-bank-select"]').setValue('970436');
    await w.get('[data-testid="withdraw-bank-number"]').setValue('0123456789');
    await w.get('[data-testid="withdraw-bank-name"]').setValue('TRAN THI B');
    await w.get('[data-testid="withdraw-bank-form"]').trigger('submit');
    await flushPromises();
    const error = w.get('[data-testid="withdraw-bank-error"]').text();
    expect(error).toContain('Tên chủ tài khoản phải trùng');
    expect(error).not.toMatch(/422|VALIDATION_FAILED/);
  });
});

describe('Customer withdrawal: amount', () => {
  it('starts with the whole balance and shows the bank masked', async () => {
    const w = await mountPanel();
    expect((w.get('[data-testid="withdraw-amount"]').element as HTMLInputElement).value).toBe('750000');
    expect(w.get('[data-testid="withdraw-bank"]').text()).toContain('Vietcombank');
    expect(w.get('[data-testid="withdraw-bank"]').text()).toContain('••••6789');
    expect(w.get('[data-testid="withdraw-bank"]').text()).not.toContain('0123456789');
  });

  it.each([
    ['5000', 'tối thiểu 10.000'],
    ['800000', 'tối đa 750.000'],
    ['0', 'số tiền hợp lệ'],
  ])('refuses %s before asking the server', async (value, reason) => {
    const w = await mountPanel();
    await w.get('[data-testid="withdraw-amount"]').setValue(value);
    await w.get('[data-testid="withdraw-form"]').trigger('submit');
    await flushPromises();
    expect(w.get('[data-testid="withdraw-amount-error"]').text().replace(/\s/g, ' ')).toContain(reason);
    expect(api.withdraw).not.toHaveBeenCalled();
    expect(w.text()).not.toContain('Rút tiền về ngân hàng?');
  });

  it('asks for confirmation, pays out, shows the result and reads the wallet again', async () => {
    api.withdraw.mockResolvedValue({ ...withdrawal, message: 'Đã chuyển tiền về tài khoản ngân hàng.' });
    const w = await mountPanel();
    await w.get('[data-testid="withdraw-form"]').trigger('submit');
    await flushPromises();
    expect(w.text()).toContain('Rút tiền về ngân hàng?');
    expect(w.text()).toContain('Vietcombank ••••6789');
    const calls = api.withdrawalInfo.mock.calls.length;
    await w.findAll('button').find((b) => b.text() === 'Rút tiền' && !b.attributes('data-testid'))!.trigger('click');
    await flushPromises();
    expect(api.withdraw).toHaveBeenCalledWith(750000);
    expect(w.get('[data-testid="withdraw-result"]').text()).toContain('Đã chuyển');
    expect(api.withdrawalInfo.mock.calls.length).toBeGreaterThan(calls);
  });

  it('says a failed payout went back to the wallet', async () => {
    api.withdraw.mockResolvedValue({ ...withdrawal, status: 'FAILED', failureReason: 'Tài khoản nhận không hợp lệ', message: 'x' });
    const w = await mountPanel();
    await w.get('[data-testid="withdraw-amount"]').setValue('100000');
    await w.get('[data-testid="withdraw-form"]').trigger('submit');
    await flushPromises();
    await w.findAll('button').find((b) => b.text() === 'Rút tiền' && !b.attributes('data-testid'))!.trigger('click');
    await flushPromises();
    expect(api.withdraw).toHaveBeenCalledWith(100000);
    const text = w.get('[data-testid="withdraw-result"]').text();
    expect(text).toContain('Tài khoản nhận không hợp lệ');
    expect(text).toContain('hoàn lại vào ví');
  });

  it('turns the form off while a withdrawal is still on its way', async () => {
    api.withdrawalInfo.mockResolvedValue(info({ openWithdrawal: { ...withdrawal, status: 'PROCESSING', amount: 200_000 }, canWithdraw: false }));
    const w = await mountPanel();
    expect(w.get('[data-testid="withdraw-open"]').text().replace(/\s/g, ' ')).toContain('200.000');
    expect(w.get('[data-testid="withdraw-amount"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="withdraw-submit"]').classes()).toContain('pointer-events-none');
    await w.get('[data-testid="withdraw-form"]').trigger('submit');
    await flushPromises();
    expect(w.text()).not.toContain('Rút tiền về ngân hàng?');
    expect(api.withdraw).not.toHaveBeenCalled();
  });

  it('says so when payouts are not open', async () => {
    api.withdrawalInfo.mockResolvedValue(info({ payoutAvailable: false, canWithdraw: false }));
    const closed = await mountPanel();
    expect(closed.get('[data-testid="withdraw-blocked"]').text()).toContain('chưa mở');
    expect(closed.get('[data-testid="withdraw-amount"]').attributes('disabled')).toBeDefined();
  });

  it('says so when the balance is under the minimum', async () => {
    api.withdrawalInfo.mockResolvedValue(info({ maximumAmount: 5_000, canWithdraw: false }));
    const small = await mountPanel();
    expect(small.get('[data-testid="withdraw-blocked"]').text().replace(/\s/g, ' ')).toContain('10.000');
  });
});

describe('Customer wallet page: withdrawal', () => {
  it('opens the withdrawal and its paged history from "Rút tiền"', async () => {
    api.summary.mockResolvedValue({ balance: 750_000, transactions: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    api.listWithdrawals.mockResolvedValue({ items: [withdrawal, { ...withdrawal, id: 'w2', status: 'FAILED', failureReason: 'Ngân hàng từ chối' }], total: 12, page: 1, pageSize: 10 });
    const w = mount(CustomerWalletPage, { global: { stubs } });
    await flushPromises();
    await w.get('[data-testid="wallet-action-withdraw"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="withdraw-panel"]').exists()).toBe(true);
    expect(w.find('[data-testid="topup-amount"]').exists()).toBe(false);
    expect(api.listWithdrawals).toHaveBeenCalledWith(1, 10);
    const history = w.get('[data-testid="withdrawal-history"]');
    expect(history.text()).toContain('Lịch sử rút tiền');
    expect(history.text()).toContain('Đã chuyển');
    expect(history.text()).toContain('Ngân hàng từ chối');
    expect(history.get('[data-testid="pagination-summary"]').text()).toBe('1–10 / 12');
  });
});
