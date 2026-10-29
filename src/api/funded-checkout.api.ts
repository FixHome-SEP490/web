import apiClient from './client';

/** The reservation/finance API accepts ServiceOrder IDs for reservation and cash,
 * while solo wallet, VNPay and ZERO routes accept the linked Invoice ID. */
export type FundedScope =
  | { kind: 'SOLO'; serviceOrderId: string; invoiceId: string }
  | { kind: 'VISIT_GROUP'; id: string };
export type FundedCashScope =
  | { kind: 'SOLO'; serviceOrderId: string }
  | { kind: 'VISIT_GROUP'; id: string };
export type FundedCashReservation = { voucherReservationId: string; customerDueVnd: number };

export type FundedReservation = {
  id: string; claimId: string; scopeId: string; attemptId: string;
  state: 'RESERVED'; reservedAt: string; expiresAt: string;
};
export type FundedCashDeclaration = {
  declaredAmount: number;
  technicianNotes?: string;
  receiptEvidenceUrl?: string;
};
export type FundedCashConfirmation = { agreed: true } | { agreed: false; disputeReason: string };

export class VoucherReservationExpiredError extends Error {
  readonly code = 'VOUCHER_RESERVATION_EXPIRED';
  constructor() {
    super('Thời gian giữ voucher đã hết. Hãy tải lại thông tin thanh toán để thử lại.');
    this.name = 'VoucherReservationExpiredError';
  }
}

/** Thrown only when the reservation lookup contract explicitly confirms no active hold. */
export class NoActiveFundedCashReservationError extends Error {
  readonly code = 'NO_ACTIVE_FUNDED_CASH_RESERVATION';
  constructor() {
    super('Không có voucher đang giữ cho thanh toán này.');
    this.name = 'NoActiveFundedCashReservationError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(): never { throw new Error('Không thể xác minh giao dịch ưu đãi.'); }
function key(value: unknown): value is string { return typeof value === 'string' && uuid.test(value); }
function obj(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function vnd(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function data(value: unknown): Record<string, unknown> {
  if (!obj(value) || value.success !== true || !obj(value.data)) invalid();
  return value.data;
}
function ensureScope(scope: FundedScope): void {
  if (scope.kind === 'SOLO') {
    if (!key(scope.serviceOrderId) || !key(scope.invoiceId)) invalid();
  } else if (scope.kind === 'VISIT_GROUP') {
    if (!key(scope.id)) invalid();
  } else invalid();
}
function route(scope: FundedScope, rail: 'wallet' | 'vnpay' | 'zero-closeout'): string {
  ensureScope(scope);
  const id = scope.kind === 'SOLO' ? scope.invoiceId : scope.id;
  return '/finance/funded/' + (scope.kind === 'SOLO' ? 'solo/' : 'visit-groups/')
    + encodeURIComponent(id) + '/' + rail;
}
function ensureCashScope(scope: FundedCashScope): void {
  if (scope.kind === 'SOLO') {
    if (!key(scope.serviceOrderId)) invalid();
  } else if (scope.kind === 'VISIT_GROUP') {
    if (!key(scope.id)) invalid();
  } else invalid();
}
function cashRoute(scope: FundedCashScope, rail: 'cash/reservation' | 'cash/declare' | 'cash/confirm'): string {
  ensureCashScope(scope);
  const id = scope.kind === 'SOLO' ? scope.serviceOrderId : scope.id;
  return '/finance/funded/' + (scope.kind === 'SOLO' ? 'solo/' : 'visit-groups/')
    + encodeURIComponent(id) + '/' + rail;
}
function hold(id: string): { voucherReservationId: string } {
  if (!key(id)) invalid();
  return { voucherReservationId: id };
}
function cashSettlement(value: unknown): Record<string, unknown> {
  const result = data(value);
  if (!key(result.id) || !['pending_confirmation', 'confirmed', 'disputed', 'verified'].includes(String(result.status))) invalid();
  return result;
}

export const fundedCheckoutApi = {
  async reserve(claimId: string, scopeId: string, attemptId: string): Promise<FundedReservation> {
    if (![claimId, scopeId, attemptId].every(key)) invalid();
    const result = data((await apiClient.post<unknown>('/vouchers/apply', { claimId, scopeId, attemptId })).data);
    if (!key(result.id) || result.claimId !== claimId || result.scopeId !== scopeId
      || result.attemptId !== attemptId
      || typeof result.reservedAt !== 'string' || typeof result.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(result.reservedAt)) || !Number.isFinite(Date.parse(result.expiresAt))
      || Date.parse(result.expiresAt) <= Date.parse(result.reservedAt)
      || Date.parse(result.expiresAt) - Date.parse(result.reservedAt) > 15 * 60 * 1000) invalid();
    if (result.state === 'EXPIRED' || Date.parse(result.expiresAt) <= Date.now()) {
      throw new VoucherReservationExpiredError();
    }
    if (result.state !== 'RESERVED') invalid();
    return { id: result.id, claimId, scopeId, attemptId, state: 'RESERVED',
      reservedAt: result.reservedAt, expiresAt: result.expiresAt };
  },
  async release(reservationId: string): Promise<void> {
    const body = hold(reservationId);
    const v = data((await apiClient.post<unknown>(
      '/vouchers/reservations/' + encodeURIComponent(body.voucherReservationId) + '/release')).data);
    if (v.id !== reservationId || !['RELEASED', 'EXPIRED'].includes(String(v.state))) invalid();
  },
  async wallet(scope: FundedScope, reservationId: string): Promise<{ paid: true; amount: number; balance: number }> {
    const v = data((await apiClient.post<unknown>(route(scope, 'wallet'), hold(reservationId))).data);
    if (v.paid !== true || !vnd(v.amount) || !vnd(v.balance)
      || (scope.kind === 'SOLO' ? v.invoiceId !== scope.invoiceId : v.visitGroupId !== scope.id)) invalid();
    return { paid: true, amount: v.amount, balance: v.balance };
  },
  async vnpay(scope: FundedScope, reservationId: string): Promise<string> {
    const v = data((await apiClient.post<unknown>(route(scope, 'vnpay'), hold(reservationId))).data);
    if (typeof v.paymentUrl !== 'string') invalid();
    let target: URL;
    try { target = new URL(v.paymentUrl); } catch { return invalid(); }
    if (target.protocol !== 'https:' || !target.hostname || target.username || target.password) invalid();
    return target.toString();
  },
  async zero(scope: FundedScope, reservationId: string): Promise<{ paid: true; amount: 0; settlementId: string }> {
    const v = data((await apiClient.post<unknown>(route(scope, 'zero-closeout'), hold(reservationId))).data);
    if (v.paid !== true || v.amount !== 0 || !key(v.settlementId)) invalid();
    return { paid: true, amount: 0, settlementId: v.settlementId };
  },
  async cashReservation(scope: FundedCashScope): Promise<FundedCashReservation> {
    const v = data((await apiClient.get<unknown>(cashRoute(scope, 'cash/reservation'))).data);
    if (v.voucherReservationId === null && v.customerDueVnd === null) {
      throw new NoActiveFundedCashReservationError();
    }
    if (!key(v.voucherReservationId) || !vnd(v.customerDueVnd)) invalid();
    return { voucherReservationId: v.voucherReservationId, customerDueVnd: v.customerDueVnd };
  },
  async declareCash(scope: FundedCashScope, reservationId: string, input: FundedCashDeclaration): Promise<void> {
    if (!vnd(input.declaredAmount)
      || (input.technicianNotes !== undefined && typeof input.technicianNotes !== 'string')
      || (input.receiptEvidenceUrl !== undefined && typeof input.receiptEvidenceUrl !== 'string')) invalid();
    const result = cashSettlement((await apiClient.post<unknown>(cashRoute(scope, 'cash/declare'), {
      declaredAmount: input.declaredAmount,
      ...(input.technicianNotes !== undefined ? { technicianNotes: input.technicianNotes } : {}),
      ...(input.receiptEvidenceUrl !== undefined ? { receiptEvidenceUrl: input.receiptEvidenceUrl } : {}),
      ...hold(reservationId),
    })).data);
    if (result.status !== 'pending_confirmation') invalid();
  },
  async confirmCash(scope: FundedCashScope, reservationId: string, input: FundedCashConfirmation): Promise<void> {
    if (typeof input.agreed !== 'boolean'
      || (input.agreed === false && (!input.disputeReason.trim() || input.disputeReason.length > 2000))) invalid();
    const body = input.agreed
      ? { agreed: true, ...hold(reservationId) }
      : { agreed: false, disputeReason: input.disputeReason.trim(), ...hold(reservationId) };
    const result = cashSettlement((await apiClient.post<unknown>(cashRoute(scope, 'cash/confirm'), body)).data);
    const expectedStatus = input.agreed ? (scope.kind === 'VISIT_GROUP' ? 'verified' : 'confirmed') : 'disputed';
    if (result.status !== expectedStatus) invalid();
  },
};
