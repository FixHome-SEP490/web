export type SummaryPrice =
  | { kind: 'none' }
  /** A price the server confirmed (or a legacy fixed price): the only blue amount. */
  | { kind: 'firm'; amount: number }
  /** Approved tiers, the device facts still decide which one. */
  | { kind: 'range'; min: number; max: number }
  /** A technician quotes on site; `from` is a nonbinding reference. */
  | { kind: 'survey'; from: number | null; to: number | null }
  /** Only confirmed labor is summed; the remaining devices still need pricing. */
  | { kind: 'partial'; confirmedTotal: number; unresolvedCount: number };

/**
 * Sums typed per-device prices without treating survey or missing prices as 0.
 * Ranges remain ranges; an unresolved quote only permits a confirmed subtotal.
 */
export function summarizeVisitDevicePrices(prices: readonly SummaryPrice[]): SummaryPrice {
  if (prices.length === 0) return { kind: 'none' };

  let confirmedTotal = 0;
  let minimum = 0;
  let maximum = 0;
  let hasRange = false;
  let unresolvedCount = 0;
  let hasUnpricedDevice = false;

  for (const price of prices) {
    if (price.kind === 'firm') {
      confirmedTotal += price.amount;
      minimum += price.amount;
      maximum += price.amount;
    } else if (price.kind === 'range') {
      hasRange = true;
      minimum += price.min;
      maximum += price.max;
      unresolvedCount += 1;
    } else if (price.kind === 'partial') {
      confirmedTotal += price.confirmedTotal;
      minimum += price.confirmedTotal;
      maximum += price.confirmedTotal;
      unresolvedCount += price.unresolvedCount;
      hasUnpricedDevice = price.unresolvedCount > 0;
    } else {
      unresolvedCount += 1;
      hasUnpricedDevice = true;
    }
  }

  if (hasUnpricedDevice) {
    return confirmedTotal > 0
      ? { kind: 'partial', confirmedTotal, unresolvedCount }
      : { kind: 'survey', from: null, to: null };
  }
  if (hasRange) return { kind: 'range', min: minimum, max: maximum };
  return { kind: 'firm', amount: confirmedTotal };
}
