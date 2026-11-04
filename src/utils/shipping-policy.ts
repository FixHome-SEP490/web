export type ShippingPolicyVersion = 'LEGACY_100_0' | 'W3_70_30_V1';

export interface ShippingPolicySnapshot {
  shippingPolicyVersion?: string | null;
  shippingFee?: unknown;
  customerShippingShare?: unknown;
  technicianShippingShare?: unknown;
  /** Display only when an authoritative server read supplies this value. */
  technicianNetLabor?: unknown;
}

export type ShippingPolicyRead =
  | { state: 'valid'; policyVersion: ShippingPolicyVersion; courierCost: number | null; customerShare: number | null; technicianShare: number | null; technicianNetLabor: number | null }
  | { state: 'error'; message: string };

const nonNegativeVnd = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

/**
 * Read the server snapshot without deriving W3 values on the client.
 * An absent policy version is historical LEGACY; only an explicit W3 version
 * allows displaying the server-provided shares.
 */
export function readShippingPolicy(snapshot: ShippingPolicySnapshot): ShippingPolicyRead {
  const courierCost = nonNegativeVnd(snapshot.shippingFee);
  const technicianNetLabor = nonNegativeVnd(snapshot.technicianNetLabor);
  const version = snapshot.shippingPolicyVersion;
  const hasCustomerShare = snapshot.customerShippingShare !== null && snapshot.customerShippingShare !== undefined;
  const hasTechnicianShare = snapshot.technicianShippingShare !== null && snapshot.technicianShippingShare !== undefined;

  if (version == null || version === '' || version === 'LEGACY_100_0') {
    if (hasCustomerShare || hasTechnicianShare) {
      const customerShare = nonNegativeVnd(snapshot.customerShippingShare);
      const technicianShare = nonNegativeVnd(snapshot.technicianShippingShare);
      if (courierCost === null || customerShare !== courierCost || technicianShare !== 0) {
        return { state: 'error', message: 'Chưa thể đối chiếu phần phí giao hàng theo chính sách đã lưu.' };
      }
    }
    return {
      state: 'valid',
      policyVersion: 'LEGACY_100_0',
      courierCost,
      customerShare: courierCost,
      technicianShare: courierCost === null ? null : 0,
      technicianNetLabor,
    };
  }

  if (version !== 'W3_70_30_V1') {
    return { state: 'error', message: 'Chưa thể đối chiếu chính sách phí giao hàng.' };
  }

  const customerShare = nonNegativeVnd(snapshot.customerShippingShare);
  const technicianShare = nonNegativeVnd(snapshot.technicianShippingShare);
  if (courierCost === null || customerShare === null || technicianShare === null
    || BigInt(customerShare) + BigInt(technicianShare) !== BigInt(courierCost)
    || BigInt(customerShare) !== (7n * BigInt(courierCost) + 5n) / 10n) {
    return { state: 'error', message: 'Chưa thể đối chiếu phần phí giao hàng theo chính sách W3.' };
  }

  return {
    state: 'valid',
    policyVersion: 'W3_70_30_V1',
    courierCost,
    customerShare,
    technicianShare,
    technicianNetLabor,
  };
}
