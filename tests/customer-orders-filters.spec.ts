// Tab states and the list the page opens on (pure logic, no API).
import { describe, expect, it } from 'vitest';
import { ORDER_STATES, REQUEST_STATES, pickInitialList } from '../src/pages/customer/customer-orders-filters';
import { filterParams } from '../src/api/paging';

const idle = (total = 0, statuses: string[] = []) => ({ loading: false, total, statuses });

describe('customer orders tab states', () => {
  it('tabs partition the states: every booking and order state is in exactly one non-ALL tab or none', () => {
    const tabs = ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
    for (const table of [ORDER_STATES, REQUEST_STATES]) {
      const seen = tabs.flatMap((t) => table[t]);
      expect(new Set(seen).size).toBe(seen.length);
    }
    expect(REQUEST_STATES.ALL).toEqual(['submitted', 'matching', 'closed', 'cancelled']);
    expect(REQUEST_STATES.ALL).not.toContain('matched');
    expect([...REQUEST_STATES.IN_PROGRESS, ...REQUEST_STATES.CANCELLED].sort()).toEqual([...REQUEST_STATES.ALL].sort());
    expect(ORDER_STATES.ALL).toEqual([]);
  });

  it('sends one request with statuses, search and withoutOrder', () => {
    expect(filterParams({ statuses: REQUEST_STATES.IN_PROGRESS, search: ' máy ', excludeVisitGroups: true, withoutOrder: true }))
      .toEqual({ statuses: 'submitted,matching,closed', search: 'máy', excludeVisitGroups: 'true', withoutOrder: 'true' });
    expect(filterParams({ statuses: ORDER_STATES.ALL })).toEqual({});
  });
});

describe('pickInitialList', () => {
  it('waits for every list', () => {
    expect(pickInitialList({ orders: { loading: true, total: 0 }, requests: idle(), visits: idle() })).toBeNull();
  });
  it('opens on what is still waiting for a technician before repair orders', () => {
    expect(pickInitialList({ orders: idle(3), requests: idle(1, ['MATCHING']), visits: idle() })).toBe('requests');
    expect(pickInitialList({ orders: idle(3), requests: idle(13, ['CLOSED']), visits: idle(2, ['submitted']) })).toBe('visits');
  });
  it('otherwise orders, then requests, then visits', () => {
    expect(pickInitialList({ orders: idle(3), requests: idle(2, ['CANCELLED']), visits: idle(1, ['completed']) })).toBe('orders');
    expect(pickInitialList({ orders: idle(0), requests: idle(2, ['CANCELLED']), visits: idle(1) })).toBe('requests');
    expect(pickInitialList({ orders: idle(0), requests: idle(0), visits: idle(1, ['completed']) })).toBe('visits');
    expect(pickInitialList({ orders: idle(0), requests: idle(0), visits: idle(0) })).toBeNull();
  });
});
