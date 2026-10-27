/**
 * Private, normalized UI plumbing only. These shapes are not the Backend wire DTO.
 * A future adapter must validate the signed reservation response before calling
 * acceptVoucherQuote; this module never submits payment or marks settlement complete.
 */
export type VoucherCheckoutMethod = 'WALLET' | 'VNPAY' | 'CASH';
export type VoucherCheckoutScope =
  | { type: 'SOLO'; id: string }
  | { type: 'VISIT_GROUP'; id: string };

export interface VoucherAttemptKey {
  claimId: string;
  scope: VoucherCheckoutScope;
  method: VoucherCheckoutMethod;
}

export type VoucherAttempt<TQuote = unknown> =
  | { status: 'disabled'; reason: 'backend_unavailable' | 'invalid_context' }
  | { status: 'reserving'; key: VoucherAttemptKey; requestId: string }
  | { status: 'awaiting_settlement'; key: VoucherAttemptKey; requestId: string; quote: TQuote; expiresAtMs: number };

export interface NormalizedVoucherQuote<TQuote> {
  requestId: string;
  key: VoucherAttemptKey;
  quote: TQuote;
  /** Absolute expiry provided by a validated authoritative Backend response. */
  expiresAtMs: number;
}

function validKey(key: VoucherAttemptKey): boolean {
  return !!key.claimId.trim() && !!key.scope.id.trim()
    && (key.scope.type === 'SOLO' || key.scope.type === 'VISIT_GROUP')
    && (key.method === 'WALLET' || key.method === 'VNPAY' || key.method === 'CASH');
}

function sameKey(left: VoucherAttemptKey, right: VoucherAttemptKey): boolean {
  return left.claimId === right.claimId && left.scope.type === right.scope.type
    && left.scope.id === right.scope.id && left.method === right.method;
}

export function beginVoucherAttempt(
  key: VoucherAttemptKey,
  backendContractAvailable: boolean,
  requestId: string,
): VoucherAttempt {
  if (!validKey(key) || !requestId.trim()) return { status: 'disabled', reason: 'invalid_context' };
  if (!backendContractAvailable) return { status: 'disabled', reason: 'backend_unavailable' };
  return { status: 'reserving', key, requestId };
}

export function acceptVoucherQuote<TQuote>(
  current: VoucherAttempt,
  candidate: NormalizedVoucherQuote<TQuote>,
  nowMs: number,
): VoucherAttempt<TQuote> | null {
  if (current.status !== 'reserving' || !sameKey(current.key, candidate.key)
    || current.requestId !== candidate.requestId || !Number.isSafeInteger(candidate.expiresAtMs)
    || candidate.expiresAtMs <= nowMs) return null;
  return {
    status: 'awaiting_settlement', key: current.key, requestId: current.requestId,
    quote: candidate.quote, expiresAtMs: candidate.expiresAtMs,
  };
}

export function remainingHoldSeconds(expiresAtMs: number, nowMs: number): number {
  if (!Number.isSafeInteger(expiresAtMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
}

export type AuthoritativeDueState = 'zero_due_requires_server_finalization' | 'customer_payment_required' | 'invalid';

/** Classifies an authoritative due amount only; it never means payment succeeded. */
export function classifyAuthoritativeDue(customerDueVnd: number): AuthoritativeDueState {
  if (!Number.isSafeInteger(customerDueVnd) || customerDueVnd < 0) return 'invalid';
  return customerDueVnd === 0 ? 'zero_due_requires_server_finalization' : 'customer_payment_required';
}
