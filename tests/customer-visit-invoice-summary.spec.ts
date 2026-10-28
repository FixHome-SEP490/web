import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import type { VisitCheckout } from '../src/api/visit-groups.api';

enableAutoUnmount(afterEach);
const route = reactive({ params: { id: 'v1' } });
const { visits, orders } = vi.hoisted(() => ({
  visits: { get: vi.fn(), checkout: vi.fn(), payWithWallet: vi.fn(), confirmCash: vi.fn(), vnpayUrl: vi.fn() },
  orders: { getOrder: vi.fn(), getInvoice: vi.fn(), getEvidence: vi.fn(), getAdditionalCosts: vi.fn(), approveQuotation: vi.fn() },
}));
vi.mock('../src/api/visit-groups.api', () => ({ visitGroupsApi: visits }));
vi.mock('../src/api/orders.api', () => ({ ordersApi: orders }));
vi.mock('../src/api/customer-wallet.api', () => ({ customerWalletApi: { summary: async () => ({ balance: 1000000 }) } }));
vi.mock('../src/services/chat-socket.service', () => ({ chatSocketService: { subscribe: () => () => undefined } }));
vi.mock('../src/services/live-updates', () => ({
  LIVE_DEBOUNCE_MS: 150, onBookingChange: () => () => undefined,
  onOrderChange: () => () => undefined, onResync: () => () => undefined,
}));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push: vi.fn() }) }));
import Page from '../src/pages/customer/CustomerVisitPage.vue';

const money = (amount: number) => `${amount.toLocaleString('vi-VN')}₫`;
const group = () => ({ id: 'v1', status: 'submitted', leadBookingId: 'b1', items: [1, 2, 3].map(n => ({
  id: `item${n}`, sequence: n, serviceId: 's', deviceLabel: `Thiết bị ${n}`,
  booking: { id: `b${n}`, status: 'MATCHED', serviceName: `Dịch vụ máy ${n}`, description: '', media: [] },
})) });
const checkout = (): VisitCheckout => ({ visitGroupId: 'v1', total: 600000, waiting: 0, ready: true, paid: false, pendingCash: null,
  devices: [1, 2, 3].map(n => ({ sequence: n, bookingId: `b${n}`, serviceOrderId: `o${n}`, invoiceId: `inv${n}`,
    deviceLabel: null, serviceName: `Dịch vụ máy ${n}`, orderCode: `TEST-${n}`, state: 'succeeded', amount: n * 100000, paid: false })),
});
const invoice = (n: number) => ({ id: `inv${n}`, serviceOrderId: `o${n}`, grandTotal: n * 100000,
  laborTotal: n * 100000, partsTotal: 0, shippingFee: 0, technicianPartWarrantyFeeTotal: 0,
  items: [{ id: `line${n}`, invoiceId: `inv${n}`, type: 'labor', description: `Tiền công hóa đơn máy ${n}`, quantity: 1, unitPrice: n * 100000, lineTotal: n * 100000 }],
});

describe('Customer VisitGroup finalized invoice summary', () => {
  let snapshot: ReturnType<typeof checkout>;
  let invoices: Record<string, ReturnType<typeof invoice> | null>;
  async function open() {
    const w = mount(Page, { global: { stubs: { 'router-link': true, CustomerStopReplaceRequest: true, FhBackLink: true,
      VisitOrderDetails: true, FailedRepairIncident: true, VoucherCheckoutChooser: true, BookingMediaViewer: true,
    } } });
    await flushPromises();
    return w;
  }
  beforeEach(() => {
    vi.clearAllMocks();
    route.params.id = 'v1';
    snapshot = checkout();
    invoices = { o1: invoice(1), o2: invoice(2), o3: invoice(3) };
    visits.get.mockResolvedValue(group());
    visits.checkout.mockImplementation(async () => structuredClone(snapshot));
    orders.getOrder.mockImplementation(async (id: string) => ({ id, bookingId: id.replace('o', 'b'), visitGroupId: 'v1',
      status: 'UNDER_REPAIR', completionRequestedAt: '2026-10-28T02:00:00Z',
      quotation: { id: `q-${id}`, status: 'approved', items: [{ description: 'Ước tính không được dùng', lineTotal: 9900000 }] },
    }));
    orders.getInvoice.mockImplementation(async (id: string) => structuredClone(invoices[id]));
    orders.getEvidence.mockResolvedValue([]);
    orders.getAdditionalCosts.mockResolvedValue([]);
  });

  it('shows all three finalized machines and one gross total above checkout, regardless of selection', async () => {
    const w = await open();
    const summary = w.get('[data-testid="visit-invoice-summary"]');
    expect(summary.attributes('aria-labelledby')).toBe('visit-invoice-summary-title');
    expect(summary.findAll('[data-testid^="visit-invoice-row-"]')).toHaveLength(3);
    for (const n of [1, 2, 3]) {
      const row = summary.get(`[data-testid="visit-invoice-row-${n}"]`);
      expect(row.text()).toContain(`Máy ${n}`);
      expect(row.text()).toContain(`Dịch vụ máy ${n}`);
      expect(row.get('[data-testid="visit-invoice-amount"]').text()).toBe(money(n * 100000));
      expect(row.text()).toContain(`Tiền công hóa đơn máy ${n}`);
    }
    expect(summary.get('[data-testid="visit-invoice-gross"]').text()).toBe(money(600000));
    expect(summary.get('[data-testid="visit-invoice-unpaid"]').text()).toBe(money(600000));
    expect(summary.text()).not.toContain('Ước tính không được dùng');
    expect(summary.element.compareDocumentPosition(w.get('[data-testid="visit-checkout"]').element) & 4).toBe(4);
    expect(w.text().match(/Tổng hóa đơn gốc/g)).toHaveLength(1);
    const before = summary.text();
    await w.get('[data-testid="visit-device-select-3"]').trigger('click');
    expect(summary.text()).toBe(before);
    expect(visits.payWithWallet).not.toHaveBeenCalled();
    expect(visits.confirmCash).not.toHaveBeenCalled();
    expect(visits.vnpayUrl).not.toHaveBeenCalled();
    expect(orders.approveQuotation).not.toHaveBeenCalled();
  });

  it('shows failed machine2 as zero alongside the two repaired invoices without using its old estimate', async () => {
    snapshot.devices[1] = { ...snapshot.devices[1], state: 'failed', amount: 0, invoiceId: null };
    snapshot.total = 400000;
    invoices.o2 = null;
    const w = await open();
    const row = w.get('[data-testid="visit-invoice-row-2"]');
    expect(row.text()).toContain('Không sửa được');
    expect(row.get('[data-testid="visit-invoice-amount"]').text()).toBe(money(0));
    expect(row.text()).not.toContain('Ước tính');
    expect(w.get('[data-testid="visit-invoice-gross"]').text()).toBe(money(400000));
  });

  it.each(['paid', 'mixed', 'pending_cash'] as const)('separates invoice gross from server unpaid total for %s', async mode => {
    if (mode === 'paid') {
      snapshot.paid = true; snapshot.ready = false; snapshot.total = 0;
      snapshot.devices.forEach(device => { device.paid = true; });
    } else if (mode === 'mixed') {
      snapshot.devices[0].paid = true; snapshot.devices[1].paid = true; snapshot.total = 300000;
    } else snapshot.pendingCash = { id: 'cash1', amount: 600000, declaredAt: '2026-10-28T02:00:00Z' };
    const w = await open();
    expect(w.get('[data-testid="visit-invoice-gross"]').text()).toBe(money(600000));
    expect(w.get('[data-testid="visit-invoice-unpaid"]').text()).toBe(money(snapshot.total));
    expect(w.get('[data-testid="visit-invoice-row-1"]').text()).toContain(mode === 'pending_cash' ? 'Chưa thanh toán' : 'Đã thanh toán');
    expect(visits.confirmCash).not.toHaveBeenCalled();
  });

  it('keeps pending quotations unknown and labels confirmed gross as only a partial total', async () => {
    snapshot.devices[2] = { ...snapshot.devices[2], state: 'open', amount: 0, invoiceId: null };
    snapshot.waiting = 1; snapshot.ready = false; snapshot.total = 300000;
    const w = await open();
    const summary = w.get('[data-testid="visit-invoice-summary"]');
    const row = summary.get('[data-testid="visit-invoice-row-3"]');
    expect(row.text()).toContain('Chưa xác định');
    expect(row.find('[data-testid="visit-invoice-amount"]').exists()).toBe(false);
    expect(row.text()).not.toContain('Tiền công hóa đơn máy 3');
    expect(summary.get('[data-testid="visit-invoice-gross"]').text()).toBe(money(300000));
    expect(summary.text()).toContain('1 máy chưa xác định');
    expect(summary.text()).toContain('Chưa phải tổng cả 3 máy');
    expect(summary.text()).not.toContain('Tổng hóa đơn gốc');
  });

  it('does not turn three pending machines into a zero gross invoice', async () => {
    snapshot.devices.forEach(device => { device.state = 'open'; device.amount = 0; });
    snapshot.waiting = 3; snapshot.ready = false; snapshot.total = 0;
    const w = await open();
    const summary = w.get('[data-testid="visit-invoice-summary"]');
    expect(summary.find('[data-testid="visit-invoice-gross"]').exists()).toBe(false);
    expect(summary.text()).toContain('3 máy chưa xác định');
    expect(summary.get('[data-testid="visit-invoice-unpaid"]').text()).toBe(money(0));
  });

  it('preserves a genuine finalized zero invoice', async () => {
    for (const n of [1, 2, 3]) {
      snapshot.devices[n - 1].amount = 0;
      invoices[`o${n}`] = { ...invoice(n), grandTotal: 0, laborTotal: 0, items: [] };
    }
    snapshot.total = 0; snapshot.ready = false;
    const w = await open();
    expect(w.get('[data-testid="visit-invoice-gross"]').text()).toBe(money(0));
    expect(w.get('[data-testid="visit-invoice-row-2"]').text()).not.toContain('Chưa xác định');
    expect(visits.payWithWallet).not.toHaveBeenCalled();
  });

  it.each(['missing', 'wrong_order', 'wrong_invoice', 'wrong_amount', 'malformed_line', 'wrong_line_invoice', 'duplicate_line', 'missing_lines'] as const)(
    'does not confirm a %s invoice or expose its line items', async mode => {
      if (mode === 'missing') invoices.o2 = null;
      if (mode === 'wrong_order') invoices.o2!.serviceOrderId = 'foreign';
      if (mode === 'wrong_invoice') invoices.o2!.id = 'foreign';
      if (mode === 'wrong_amount') invoices.o2!.grandTotal = 999999;
      if (mode === 'malformed_line') invoices.o2!.items[0].lineTotal = -1;
      if (mode === 'wrong_line_invoice') invoices.o2!.items[0].invoiceId = 'foreign';
      if (mode === 'duplicate_line') invoices.o2!.items.push({ ...invoices.o2!.items[0] });
      if (mode === 'missing_lines') invoices.o2!.items = [];
      const w = await open();
      const row = w.get('[data-testid="visit-invoice-row-2"]');
      expect(row.text()).toContain('Chưa xác định');
      expect(row.text()).not.toContain('Tiền công hóa đơn máy 2');
      expect(w.get('[data-testid="visit-invoice-gross"]').text()).toBe(money(400000));
    },
  );

  it.each(['invoice', 'order', 'booking'] as const)('does not count a duplicate %s twice', async mode => {
    if (mode === 'invoice') snapshot.devices[1].invoiceId = 'inv1';
    if (mode === 'order') snapshot.devices[1].serviceOrderId = 'o1';
    if (mode === 'booking') snapshot.devices.push({ ...snapshot.devices[1] });
    const w = await open();
    expect(w.get('[data-testid="visit-invoice-row-2"]').text()).toContain('Chưa xác định');
    expect(w.get('[data-testid="visit-invoice-summary"]').findAll('[data-testid^="visit-invoice-row-"]')).toHaveLength(3);
    expect(w.get('[data-testid="visit-invoice-gross"]').text()).toBe(money(mode === 'booking' ? 400000 : 300000));
  });

  it('keeps a checkout read failure unknown instead of displaying a free visit', async () => {
    visits.checkout.mockRejectedValue(new Error('Network Error'));
    const w = await open();
    const summary = w.get('[data-testid="visit-invoice-summary"]');
    expect(summary.find('[data-testid="visit-invoice-unpaid"]').exists()).toBe(false);
    expect(summary.find('[data-testid="visit-invoice-gross"]').exists()).toBe(false);
    expect(summary.text()).toContain('Chưa xác định');
    expect(w.find('[data-testid="visit-checkout-error"]').exists()).toBe(true);
  });

  it('does not count an invoice twice when the parent repeats a booking', async () => {
    const parent = group();
    parent.items[2].booking.id = 'b2';
    visits.get.mockResolvedValue(parent);
    const w = await open();
    expect(w.get('[data-testid="visit-invoice-row-2"]').text()).toContain('Chưa xác định');
    expect(w.get('[data-testid="visit-invoice-row-3"]').text()).toContain('Chưa xác định');
    expect(w.get('[data-testid="visit-invoice-gross"]').text()).toBe(money(100000));
  });

  it('shows finalized line totals and fees exactly as supplied without repricing or recounting them', async () => {
    invoices.o1!.items[0].quantity = 2;
    invoices.o1!.items[0].unitPrice = 75000;
    invoices.o1!.items[0].lineTotal = 80000;
    invoices.o1!.shippingFee = 15000;
    invoices.o1!.technicianPartWarrantyFeeTotal = 5000;
    const w = await open();
    const row = w.get('[data-testid="visit-invoice-row-1"]');
    expect(row.text()).toContain(money(80000));
    expect(row.text()).toContain('Phí giao linh kiện');
    expect(row.text()).toContain(money(15000));
    expect(row.text()).toContain('Phí bảo hành linh kiện');
    expect(row.text()).toContain(money(5000));
    expect(row.get('[data-testid="visit-invoice-amount"]').text()).toBe(money(100000));
    expect(w.get('[data-testid="visit-invoice-gross"]').text()).toBe(money(600000));
  });
});
