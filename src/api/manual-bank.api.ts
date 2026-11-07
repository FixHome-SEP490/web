import apiClient from './client';

export type ManualBankPaymentStatus = 'pending' | 'verified';

/** Exactly what `POST /finance/manual-bank/:invoiceId` returns inside `data`. */
export interface ManualBankPaymentResult {
  paymentId: string;
  invoiceId: string;
  amount: number;
  status: ManualBankPaymentStatus;
}

/** The customer's own reminder of an open request; the invoice remains the source of truth. */
export interface ManualBankPendingAttempt {
  paymentId: string;
  invoiceId: string;
  amount: number;
  status: 'pending';
  customerId: string | null;
  recordedAt: string;
}

type CustomerIdInput = string | null | undefined;

/** The key holds BOTH the exact owner and invoice, so accounts never share a reminder. */
const PENDING_KEY_PREFIX = 'fixhome.manual_bank.pending.v2:';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPositiveWholeVnd = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const ownerId = (customerId: CustomerIdInput): string | null => {
  const id = typeof customerId === 'string' ? customerId.trim() : '';
  return id || null;
};

const pendingKey = (invoiceId: string, customerId: string) =>
  `${PENDING_KEY_PREFIX}${encodeURIComponent(customerId)}:${encodeURIComponent(invoiceId)}`;

function parsePaymentResult(value: unknown, requestedInvoiceId: string): ManualBankPaymentResult {
  if (!isRecord(value)) throw new Error('Máy chủ chưa trả về yêu cầu chuyển khoản hợp lệ.');
  const paymentId = typeof value.paymentId === 'string' ? value.paymentId.trim() : '';
  const invoiceId = typeof value.invoiceId === 'string' ? value.invoiceId.trim() : '';
  const status = value.status;
  if (!paymentId || invoiceId !== requestedInvoiceId || !isPositiveWholeVnd(value.amount)
    || (status !== 'pending' && status !== 'verified')) {
    throw new Error('Máy chủ trả về yêu cầu chuyển khoản không hợp lệ. Vui lòng thử lại.');
  }
  return { paymentId, invoiceId, amount: value.amount, status };
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function parsePendingAttempt(
  value: unknown,
  invoiceId: string,
  customerId: string,
): ManualBankPendingAttempt | null {
  if (!isRecord(value)) return null;
  const paymentId = typeof value.paymentId === 'string' ? value.paymentId.trim() : '';
  const storedInvoiceId = typeof value.invoiceId === 'string' ? value.invoiceId.trim() : '';
  const storedCustomerId = typeof value.customerId === 'string' ? value.customerId.trim() : '';
  const recordedAt = typeof value.recordedAt === 'string' ? value.recordedAt : '';
  if (!paymentId || storedInvoiceId !== invoiceId || storedCustomerId !== customerId
    || value.status !== 'pending' || !isPositiveWholeVnd(value.amount) || !recordedAt) return null;
  return { paymentId, invoiceId, amount: value.amount, status: 'pending', customerId: storedCustomerId, recordedAt };
}

function forgetPending(invoiceId: string, customerId: CustomerIdInput): void {
  const owner = ownerId(customerId);
  if (!invoiceId || !owner) return;
  try {
    storage()?.removeItem(pendingKey(invoiceId, owner));
  } catch {
    // Nothing else to do: the next read simply cannot recover a stored request.
  }
}

/**
 * A scoped reminder only. `InvoiceResponseDto` carries no payment list, so the
 * customer can recover an open request after a reload without pretending it was
 * paid. The server still decides whether the request exists and is confirmed.
 *
 * A missing owner is never written to storage and never reads an existing
 * record: the page may show the returned in-memory attempt for this visit, but
 * another account must not inherit it. Every forget is owner-scoped, so reading
 * or clearing as customer B can never delete customer A's reminder.
 */
export const manualBankPending = {
  remember(result: ManualBankPaymentResult, customerId: CustomerIdInput): ManualBankPendingAttempt | null {
    const owner = ownerId(customerId);
    if (result.status !== 'pending') {
      forgetPending(result.invoiceId, owner);
      return null;
    }
    const attempt: ManualBankPendingAttempt = {
      paymentId: result.paymentId,
      invoiceId: result.invoiceId,
      amount: result.amount,
      status: 'pending',
      customerId: owner,
      recordedAt: new Date().toISOString(),
    };
    if (!owner) return attempt;
    try {
      storage()?.setItem(pendingKey(result.invoiceId, owner), JSON.stringify(attempt));
    } catch {
      // A blocked storage still leaves the in-memory notice for this visit.
    }
    return attempt;
  },

  read(invoiceId: string, customerId: CustomerIdInput): ManualBankPendingAttempt | null {
    const owner = ownerId(customerId);
    if (!invoiceId || !owner) return null;
    let raw: string | null = null;
    try {
      raw = storage()?.getItem(pendingKey(invoiceId, owner)) ?? null;
    } catch {
      return null;
    }
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      forgetPending(invoiceId, owner);
      return null;
    }
    const attempt = parsePendingAttempt(parsed, invoiceId, owner);
    if (!attempt) {
      forgetPending(invoiceId, owner);
      return null;
    }
    return attempt;
  },

  forget(invoiceId: string, customerId: CustomerIdInput): void {
    forgetPending(invoiceId, customerId);
  },
};

export const manualBankApi = {
  async createPayment(invoiceId: string): Promise<ManualBankPaymentResult> {
    if (!invoiceId) throw new Error('Chưa có hóa đơn để tạo yêu cầu chuyển khoản.');
    const res = await apiClient.post<{ data?: unknown }>(
      `/finance/manual-bank/${encodeURIComponent(invoiceId)}`,
    );
    return parsePaymentResult(res.data?.data, invoiceId);
  },
};
