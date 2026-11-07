import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const { api, funded } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  funded: { reserve: vi.fn(), wallet: vi.fn(), vnpay: vi.fn(), zero: vi.fn(), confirmCash: vi.fn() },
}));

vi.mock('../src/api/client', () => ({
  default: api,
  getHttpStatus: () => undefined,
  registerAuthSessionInvalidator: vi.fn(),
  registerTokenRefreshed: vi.fn(),
}));

const routeState = vi.hoisted(() => ({ id: 'o-solo-1' }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { get id() { return routeState.id; } }, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ conversations: [] }) }));
vi.mock('../src/api/funded-checkout.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/funded-checkout.api')>()),
  fundedCheckoutApi: funded,
}));

import Page from '../src/pages/customer/CustomerOrderDetailPage.vue';
import { manualBankPending, type ManualBankPaymentResult } from '../src/api/manual-bank.api';
import { useAuthStore } from '../src/stores/auth.store';

interface TestOrderState {
  orderId: string;
  orderCode: string;
  orderStatus: string;
  paymentStatus: string;
  completionRequestedAt: string | null;
  visitGroupId: string | null;
  invoice: Record<string, unknown> | null;
  cashIntent: Record<string, unknown> | null;
  cashFirstEnabled: boolean;
  voucher: Record<string, unknown> | null;
}

let testState: TestOrderState;

const pendingResult = (overrides: Record<string, unknown> = {}) => ({
  data: {
    data: {
      paymentId: 'pay-mb-1',
      invoiceId: 'inv-solo-1',
      amount: 250000,
      status: 'pending',
      ...overrides,
    },
  },
});

const manualPendingResult = (overrides: Partial<ManualBankPaymentResult> = {}): ManualBankPaymentResult => ({
  paymentId: 'pay-mb-1',
  invoiceId: 'inv-solo-1',
  amount: 250000,
  status: 'pending',
  ...overrides,
});

const authAs = (id: string) => {
  useAuthStore().setAuth(`token-${id}`, { id, role: 'CUSTOMER' } as never);
};

const mountPage = async () => {
  api.get.mockImplementation(async (path: string) => {
    if (path === `/finance/cash-intents/SOLO/${routeState.id}`) {
      return { data: { success: true, statusCode: 200, message: 'Success', data: testState.cashIntent, meta: { cashFirstEnabled: testState.cashFirstEnabled } } };
    }
    if (path === `/service-orders/${routeState.id}`) {
      return {
        data: {
          data: {
            id: routeState.id,
            code: testState.orderCode,
            status: testState.orderStatus,
            paymentStatus: testState.paymentStatus,
            completionRequestedAt: testState.completionRequestedAt,
            visitGroupId: testState.visitGroupId,
            laborTotal: 250000,
            partsTotal: 0,
            grandTotal: 250000,
          },
        },
      };
    }
    if (path.endsWith('/invoice')) return { data: { data: testState.invoice } };
    if (path.endsWith('/cash-settlement')) return { data: { data: null } };
    if (path === '/customer/wallet') return { data: { data: { balance: 500000 } } };
    return { data: { data: [] } };
  });

  const w = mount(Page, {
    global: {
      stubs: {
        CustomerStopReplaceRequest: true,
        CustomerCancelledRebookAction: true,
        OrderComplaintPanel: true,
        WarrantyClaimModal: true,
        ReviewTechnicianModal: true,
        RebookDialog: true,
        RouterLink: true,
        Teleport: true,
        VoucherCheckoutChooser: {
          props: ['scopeId'],
          emits: ['applied', 'released'],
          template: '<div data-testid="test-voucher-picker"><button v-if="hasVoucher" data-testid="apply-voucher-btn" @click="$emit(\'applied\', voucherData)">Apply Voucher</button></div>',
          data: () => ({
            hasVoucher: !!testState.voucher,
            voucherData: testState.voucher,
          }),
        },
      },
    },
  });
  await flushPromises();
  return w;
};

const openPayment = async (w: Awaited<ReturnType<typeof mountPage>>) => {
  const payBtn = w.findAll('button').find((b) => b.text().includes('Thanh toán ngay'));
  expect(payBtn).toBeDefined();
  await payBtn!.trigger('click');
  await flushPromises();
};

const chooseManualBank = async (w: Awaited<ReturnType<typeof mountPage>>) => {
  await w.get('[data-testid="pay-method-manual_bank"]').trigger('click');
  await flushPromises();
};

const submitManualBank = async (w: Awaited<ReturnType<typeof mountPage>>) => {
  await w.get('[data-testid="pay-with-manual-bank"]').trigger('click');
  await flushPromises();
};

const setupState = (w: Awaited<ReturnType<typeof mountPage>>) =>
  w.vm.$.setupState as Record<string, (...args: never[]) => unknown> & Record<string, unknown>;

describe('Customer manual bank payment UI', () => {
  beforeEach(() => {
    routeState.id = 'o-solo-1';
    localStorage.clear();
    vi.clearAllMocks();
    api.get.mockReset();
    api.post.mockReset();
    setActivePinia(createPinia());
    authAs('customer-a');
    testState = {
      orderId: 'o-solo-1',
      orderCode: 'FH-SOLO-1',
      orderStatus: 'UNDER_REPAIR',
      paymentStatus: 'unpaid',
      completionRequestedAt: '2026-11-07',
      visitGroupId: null,
      invoice: {
        id: 'inv-solo-1',
        laborTotal: 250000,
        partsTotal: 0,
        grandTotal: 250000,
        items: [{ type: 'labor', description: 'Công sửa chữa', quantity: 1, unitPrice: 250000, lineTotal: 250000 }],
      },
      cashIntent: null,
      cashFirstEnabled: false,
      voucher: null,
    };
  });

  it('allows a SOLO customer with a valid unpaid positive invoice to create a PENDING payment', async () => {
    api.post.mockResolvedValueOnce(pendingResult());

    const w = await mountPage();
    await openPayment(w);
    expect(w.get('[data-testid="pay-method-manual_bank"]').text()).toContain('Chuyển khoản');
    await chooseManualBank(w);

    const infoBox = w.get('[data-testid="pay-manual-bank-info"]');
    expect(infoBox.text()).toContain('Chờ Admin đối chiếu — chưa thanh toán');
    expect(infoBox.text()).toContain('liên hệ đội ngũ FixHome');
    expect(infoBox.text()).not.toMatch(/\b(0\d{9,15}|STK|TK:?\s*\d{8,})\b/i);

    await submitManualBank(w);

    expect(api.post).toHaveBeenCalledWith('/finance/manual-bank/inv-solo-1');
    expect(w.text()).toContain('Chờ Admin đối chiếu — chưa thanh toán');
    expect(w.text()).not.toContain('Đã thanh toán');
    expect(manualBankPending.read('inv-solo-1', 'customer-a')).toMatchObject({
      paymentId: 'pay-mb-1',
      amount: 250000,
      status: 'pending',
    });
    w.unmount();
  });

  it('restores the pending reminder after a reload without ever showing the invoice as paid', async () => {
    api.post.mockResolvedValueOnce(pendingResult());
    const first = await mountPage();
    await openPayment(first);
    await chooseManualBank(first);
    await submitManualBank(first);
    first.unmount();

    const reloaded = await mountPage();
    const alert = reloaded.get('[data-testid="order-manual-bank-pending-alert"]');
    expect(alert.text()).toContain('Chờ Admin đối chiếu — chưa thanh toán');
    expect(alert.get('[data-testid="order-manual-bank-pending-amount"]').text()).toContain('250.000');
    expect(reloaded.text()).not.toContain('Đã thanh toán');
    expect(api.post).toHaveBeenCalledTimes(1);
    reloaded.unmount();
  });

  it('clears the pending reminder when the server reports the order PAID', async () => {
    api.post.mockResolvedValueOnce(pendingResult());
    const w = await mountPage();
    await openPayment(w);
    await chooseManualBank(w);
    await submitManualBank(w);
    expect(w.find('[data-testid="order-manual-bank-pending-alert"]').exists()).toBe(true);

    testState.paymentStatus = 'PAID';
    setupState(w).applyOrderBundle({
      order: {
        id: routeState.id,
        code: testState.orderCode,
        status: 'UNDER_REPAIR',
        paymentStatus: 'PAID',
        completionRequestedAt: testState.completionRequestedAt,
        visitGroupId: null,
      },
      invoice: testState.invoice,
      cashIntent: null,
      evidences: [],
      financialReadReady: true,
    });
    await flushPromises();

    expect(w.find('[data-testid="order-manual-bank-pending-alert"]').exists()).toBe(false);
    expect(manualBankPending.read('inv-solo-1', 'customer-a')).toBeNull();
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(0);
    w.unmount();
  });

  it('supports an idempotent retry without auto-crediting', async () => {
    api.post.mockResolvedValue(pendingResult());

    const w = await mountPage();
    await openPayment(w);
    await chooseManualBank(w);
    await submitManualBank(w);
    expect(api.post).toHaveBeenCalledTimes(1);

    await submitManualBank(w);
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(w.text()).toContain('Chờ Admin đối chiếu — chưa thanh toán');
    expect(w.text()).not.toContain('Đã thanh toán');
    expect(manualBankPending.read('inv-solo-1', 'customer-a')?.paymentId).toBe('pay-mb-1');
    w.unmount();
  });

  it('shows a user-facing error and keeps the invoice unpaid on backend failure', async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 400, data: { message: 'Invoice cannot accept manual bank transfer' } },
    });

    const w = await mountPage();
    await openPayment(w);
    await chooseManualBank(w);
    await submitManualBank(w);

    const errorAlert = w.get('[data-testid="pay-dialog-error"]');
    expect(errorAlert.text()).toBeTruthy();
    expect(w.text()).not.toContain('Đã thanh toán');
    expect(manualBankPending.read('inv-solo-1', 'customer-a')).toBeNull();
    w.unmount();
  });

  it('rejects a malformed server response without creating a reminder', async () => {
    api.post.mockResolvedValueOnce(pendingResult({ invoiceId: 'inv-other' }));

    const w = await mountPage();
    await openPayment(w);
    await chooseManualBank(w);
    await submitManualBank(w);

    expect(w.get('[data-testid="pay-dialog-error"]').text()).toBeTruthy();
    expect(w.find('[data-testid="order-manual-bank-pending-alert"]').exists()).toBe(false);
    expect(w.text()).not.toContain('Đã thanh toán');
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(0);
    w.unmount();
  });

  it('does not fake PAID when the server replays an already-VERIFIED attempt', async () => {
    api.post.mockResolvedValueOnce(pendingResult({ status: 'verified' }));

    const w = await mountPage();
    await openPayment(w);
    await chooseManualBank(w);
    await submitManualBank(w);

    expect(w.find('[data-testid="order-manual-bank-pending-alert"]').exists()).toBe(false);
    expect(w.find('[data-testid="manual-bank-pending"]').exists()).toBe(false);
    expect(w.text()).not.toContain('Đã thanh toán');
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(0);
    w.unmount();
  });

  it('ignores a late response for an invoice that has since changed', async () => {
    let resolvePost!: (value: unknown) => void;
    api.post.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve; }));

    const w = await mountPage();
    await openPayment(w);
    await chooseManualBank(w);
    await w.get('[data-testid="pay-with-manual-bank"]').trigger('click');
    await flushPromises();

    testState.invoice = {
      id: 'inv-changed',
      laborTotal: 300000,
      partsTotal: 0,
      grandTotal: 300000,
      items: [{ type: 'labor', description: 'Công sửa chữa', quantity: 1, unitPrice: 300000, lineTotal: 300000 }],
    };
    setupState(w).applyOrderBundle({
      order: {
        id: routeState.id,
        code: testState.orderCode,
        status: 'UNDER_REPAIR',
        paymentStatus: 'unpaid',
        completionRequestedAt: testState.completionRequestedAt,
        visitGroupId: null,
      },
      invoice: testState.invoice,
      cashIntent: null,
      evidences: [],
      financialReadReady: true,
    });
    await flushPromises();

    resolvePost(pendingResult());
    await flushPromises();

    expect(w.find('[data-testid="order-manual-bank-pending-alert"]').exists()).toBe(false);
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(0);
    expect(w.text()).not.toContain('Đã thanh toán');
    w.unmount();
  });

  it('keeps customer A reminder when B opens the same invoice, then restores it for A', async () => {
    authAs('customer-a');
    api.post.mockResolvedValueOnce(pendingResult());
    const first = await mountPage();
    await openPayment(first);
    await chooseManualBank(first);
    await submitManualBank(first);
    expect(manualBankPending.read('inv-solo-1', 'customer-a')).toMatchObject({ paymentId: 'pay-mb-1' });

    // Same mounted page: switching account hides A's notice; switching back restores it.
    authAs('customer-b');
    await flushPromises();
    expect(first.find('[data-testid="order-manual-bank-pending-alert"]').exists()).toBe(false);
    authAs('customer-a');
    await flushPromises();
    expect(first.find('[data-testid="order-manual-bank-pending-alert"]').exists()).toBe(true);
    first.unmount();

    authAs('customer-b');
    const second = await mountPage();
    expect(second.find('[data-testid="order-manual-bank-pending-alert"]').exists()).toBe(false);
    expect(manualBankPending.read('inv-solo-1', 'customer-b')).toBeNull();
    // B reading the same invoice must not delete A's reminder.
    expect(manualBankPending.read('inv-solo-1', 'customer-a')).toMatchObject({ paymentId: 'pay-mb-1' });
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(1);
    second.unmount();

    authAs('customer-a');
    const third = await mountPage();
    const alert = third.get('[data-testid="order-manual-bank-pending-alert"]');
    expect(alert.text()).toContain('Chờ Admin đối chiếu — chưa thanh toán');
    expect(third.get('[data-testid="order-manual-bank-pending-amount"]').text()).toContain('250.000');
    expect(third.text()).not.toContain('Đã thanh toán');
    third.unmount();
  });

  it('does not restore a reminder whose amount no longer matches the server invoice', async () => {
    api.post.mockResolvedValueOnce(pendingResult());
    const first = await mountPage();
    await openPayment(first);
    await chooseManualBank(first);
    await submitManualBank(first);
    first.unmount();

    testState.invoice = {
      id: 'inv-solo-1',
      laborTotal: 300000,
      partsTotal: 0,
      grandTotal: 300000,
      items: [{ type: 'labor', description: 'Công sửa chữa', quantity: 1, unitPrice: 300000, lineTotal: 300000 }],
    };
    const second = await mountPage();
    expect(second.find('[data-testid="order-manual-bank-pending-alert"]').exists()).toBe(false);
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(0);
    second.unmount();
  });

  it('blocks manual_bank for visit groups (SOLO only)', async () => {
    testState.visitGroupId = 'vg-group-1';
    const w = await mountPage();
    expect(w.find('[data-testid="order-visit-link"]').exists()).toBe(true);
    expect(w.find('[data-testid="pay-method-manual_bank"]').exists()).toBe(false);
    w.unmount();
  });

  it('blocks manual_bank when a voucher is applied', async () => {
    testState.voucher = {
      reservation: { id: 'res-1', claimId: 'claim-1', scopeId: 'o-solo-1' },
      preview: { customerDueVnd: 200000, scopeId: 'o-solo-1', claimId: 'claim-1', paymentAvailable: true },
    };
    const w = await mountPage();
    await openPayment(w);

    await w.get('[data-testid="apply-voucher-btn"]').trigger('click');
    await flushPromises();

    expect(w.find('[data-testid="pay-method-manual_bank"]').exists()).toBe(false);
    w.unmount();
  });

  it('blocks manual_bank when a cash intent is pending', async () => {
    testState.cashIntent = {
      id: 'ci-1',
      scopeKind: 'SOLO',
      scopeId: 'o-solo-1',
      status: 'pending',
      grossVnd: 250000,
      customerDueVnd: 250000,
      technicianId: 'tech-1',
      createdAt: '2026-11-07T00:00:00.000Z',
      receivedAt: null,
      receiptId: null,
    };
    testState.cashFirstEnabled = true;
    const w = await mountPage();
    await openPayment(w);

    expect(w.find('[data-testid="pay-method-manual_bank"]').exists()).toBe(false);
    w.unmount();
  });

  it('blocks manual_bank for a zero-charge invoice', async () => {
    testState.invoice = {
      id: 'inv-zero',
      laborTotal: 0,
      partsTotal: 0,
      grandTotal: 0,
      items: [],
    };
    const w = await mountPage();
    const payBtn = w.findAll('button').find((b) => b.text().includes('Thanh toán ngay'));
    if (payBtn) {
      await payBtn.trigger('click');
      await flushPromises();
      expect(w.find('[data-testid="pay-method-manual_bank"]').exists()).toBe(false);
    }
    w.unmount();
  });

  it('blocks manual_bank before the technician has requested completion', async () => {
    testState.completionRequestedAt = null;
    const w = await mountPage();

    expect(w.find('[data-testid="pay-method-manual_bank"]').exists()).toBe(false);
    expect(w.findAll('button').some((b) => b.text() === 'Thanh toán ngay')).toBe(false);
    w.unmount();
  });

  it('never persists or reveals a reminder without an exact authenticated owner', () => {
    const noOwner = manualBankPending.remember(manualPendingResult(), null);
    expect(noOwner).toMatchObject({ paymentId: 'pay-mb-1', customerId: null, status: 'pending' });
    expect(manualBankPending.read('inv-solo-1', null)).toBeNull();
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(0);

    const blankOwner = manualBankPending.remember(manualPendingResult(), '   ');
    expect(blankOwner).toMatchObject({ customerId: null });
    expect(manualBankPending.read('inv-solo-1', undefined)).toBeNull();
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(0);

    manualBankPending.remember(manualPendingResult(), 'customer-a');
    expect(manualBankPending.read('inv-solo-1', null)).toBeNull();
    expect(manualBankPending.read('inv-solo-1', undefined)).toBeNull();
    expect(manualBankPending.read('inv-solo-1', 'customer-a')).not.toBeNull();
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(1);
  });

  it('keeps another owner reminder and forgets only the exact owner or invoice', () => {
    manualBankPending.remember(manualPendingResult(), 'customer-a');
    // The exact regression: B reads before A reads again, and A must survive.
    expect(manualBankPending.read('inv-solo-1', 'customer-b')).toBeNull();
    expect(manualBankPending.read('inv-solo-1', 'customer-a')?.paymentId).toBe('pay-mb-1');
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(1);

    manualBankPending.remember(manualPendingResult({ paymentId: 'pay-b' }), 'customer-b');
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(2);

    // Another invoice and an unknown owner never see or delete these reminders.
    expect(manualBankPending.read('inv-other', 'customer-a')).toBeNull();
    expect(manualBankPending.read('inv-solo-1', 'customer-unknown')).toBeNull();
    expect(manualBankPending.read('inv-solo-1', 'customer-a')?.paymentId).toBe('pay-mb-1');
    expect(manualBankPending.read('inv-solo-1', 'customer-b')?.paymentId).toBe('pay-b');
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(2);

    manualBankPending.forget('inv-solo-1', null);
    manualBankPending.forget('inv-solo-1', 'customer-b');
    expect(manualBankPending.read('inv-solo-1', 'customer-b')).toBeNull();
    expect(manualBankPending.read('inv-solo-1', 'customer-a')?.paymentId).toBe('pay-mb-1');
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(1);

    manualBankPending.forget('inv-solo-1', 'customer-a');
    expect(manualBankPending.read('inv-solo-1', 'customer-a')).toBeNull();
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(0);
  });

  it('clears malformed data only under the current owner key', () => {
    manualBankPending.remember(manualPendingResult(), 'customer-a');
    const key = manualBankPendingNoticeStorageKeys()[0];
    expect(key).toBeTruthy();
    localStorage.setItem(key, '{not-json');
    expect(manualBankPending.read('inv-solo-1', 'customer-b')).toBeNull();
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(1);
    expect(manualBankPending.read('inv-solo-1', 'customer-a')).toBeNull();
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(0);
  });

  it('rejects a stored owner that differs from the exact key owner', () => {
    manualBankPending.remember(manualPendingResult(), 'customer-a');
    const key = manualBankPendingNoticeStorageKeys()[0];
    const record = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...record, customerId: 'customer-b' }));

    expect(manualBankPending.read('inv-solo-1', 'customer-b')).toBeNull();
    expect(manualBankPending.read('inv-solo-1', 'customer-a')).toBeNull();
    expect(manualBankPendingNoticeStorageKeys()).toHaveLength(0);
  });
});

function manualBankPendingNoticeStorageKeys(): string[] {
  return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? '')
    .filter((key) => key.startsWith('fixhome.manual_bank.pending.'));
}
