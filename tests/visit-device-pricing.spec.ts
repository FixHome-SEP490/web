import { describe, expect, it } from 'vitest';
import { summarizeVisitDevicePrices } from '../src/components/booking/visit-device-pricing';

describe('visit device pricing summary', () => {
  it('adds only server-confirmed firm labor prices as a firm total', () => {
    expect(summarizeVisitDevicePrices([
      { kind: 'firm', amount: 199000 },
      { kind: 'firm', amount: 250000 },
    ])).toEqual({ kind: 'firm', amount: 449000 });
  });

  it('adds approved ranges and firm prices without losing the range', () => {
    expect(summarizeVisitDevicePrices([
      { kind: 'firm', amount: 199000 },
      { kind: 'range', min: 250000, max: 350000 },
    ])).toEqual({ kind: 'range', min: 449000, max: 549000 });
  });

  it('shows only a confirmed subtotal when another device still needs a quote', () => {
    expect(summarizeVisitDevicePrices([
      { kind: 'firm', amount: 199000 },
      { kind: 'survey', from: 250000, to: 400000 },
      { kind: 'none' },
    ])).toEqual({ kind: 'partial', confirmedTotal: 199000, unresolvedCount: 2 });
  });

  it('does not turn an unknown price into a zero or estimated total', () => {
    expect(summarizeVisitDevicePrices([
      { kind: 'survey', from: 250000, to: 400000 },
      { kind: 'none' },
    ])).toEqual({ kind: 'survey', from: null, to: null });
  });
});
