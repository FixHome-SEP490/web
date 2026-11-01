import { describe, expect, it } from 'vitest';
import { isArrivedWaiting, isVisitArrived } from '../src/utils/visit-arrival';

const device = (orderStatus: string | null, arrivedAt: string | null, outcome: 'succeeded' | 'failed' | 'quote_declined' | null = null) =>
  ({ orderStatus, arrivedAt, outcome });

describe('bug 17: a checked-in visit reads as arrived without a new order state', () => {
  it('marks a device waiting for its own repair once the visit is checked in', () => {
    expect(isArrivedWaiting(device('en_route', '2026-11-01T11:20:00Z'))).toBe(true);
    expect(isArrivedWaiting(device('EN_ROUTE', '2026-11-01T11:20:00Z'))).toBe(true);
  });

  it('keeps travelling, repairing and finished devices as they are', () => {
    expect(isArrivedWaiting(device('en_route', null))).toBe(false);
    expect(isArrivedWaiting(device('under_repair', '2026-11-01T11:20:00Z'))).toBe(false);
    expect(isArrivedWaiting(device('cancelled', '2026-11-01T11:20:00Z', 'quote_declined'))).toBe(false);
    expect(isArrivedWaiting(device('completed', '2026-11-01T11:20:00Z'))).toBe(false);
  });

  it('labels the parent only while nothing is under repair yet', () => {
    const items = [device('en_route', '2026-11-01T11:20:00Z'), device('en_route', '2026-11-01T11:20:00Z')];
    expect(isVisitArrived({ status: 'en_route', items } as never)).toBe(true);
    expect(isVisitArrived({ status: 'under_repair', items } as never)).toBe(false);
    expect(isVisitArrived({ status: 'en_route', items: [device('en_route', null)] } as never)).toBe(false);
  });
});
